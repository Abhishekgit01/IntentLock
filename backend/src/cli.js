#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeFunctionData, maxUint256, parseAbi } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { compilePolicyFile } from './policy-format.js';

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const catalogPath = path.join(rootDirectory, 'docs/fixtures/catalog.json');
const vectorPath = path.join(
  rootDirectory,
  'docs/fixtures/verifier-vectors.json',
);
const ERC20_ABI = parseAbi([
  'function approve(address spender,uint256 amount) returns (bool)',
]);
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dead';
const GUARD_ADDRESS = '0x000000000000000000000000000000000000cafe';

function option(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

async function keygen(args) {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const keyPath = path.resolve(
    option(
      args,
      '--out',
      path.join(
        homedir(),
        '.intentlock',
        'keys',
        `${account.address.toLowerCase()}.intentlock-key`,
      ),
    ),
  );
  await mkdir(path.dirname(keyPath), { recursive: true, mode: 0o700 });
  await writeFile(keyPath, `${privateKey}\n`, { flag: 'wx', mode: 0o600 });
  process.stdout.write(
    `${JSON.stringify({ created: true, address: account.address, keyFile: keyPath, privateKeyPrinted: false })}\n`,
  );
}

async function jsonRequest(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}

function baseTransaction(health, descriptor = {}) {
  const safe = health.safeAddress;
  const chainId = Number(health.observedChainId ?? health.configuredChainId);
  const safeNonce = health.safeNonce;
  const recipient = health.nativeRecipients?.[0] ?? DEAD_ADDRESS;
  if (
    !safe ||
    !Number.isSafeInteger(chainId) ||
    safeNonce === null ||
    safeNonce === undefined
  ) {
    throw new Error(
      'Verifier health must expose safeAddress, safeNonce, and chainId',
    );
  }
  return {
    chainId,
    safe,
    safeNonce: String(safeNonce),
    to:
      descriptor.toKind === 'safe'
        ? safe
        : descriptor.toKind === 'unlisted'
          ? DEAD_ADDRESS
          : recipient,
    value: String(descriptor.value ?? '1'),
    data: descriptor.data ?? '0x',
    operation: descriptor.operation ?? 0,
    safeTxGas: '0',
    baseGas: '0',
    gasPrice: '0',
    gasToken: '0x0000000000000000000000000000000000000000',
    refundReceiver: '0x0000000000000000000000000000000000000000',
  };
}

function transactionForFixture(fixture, health) {
  const title = fixture.title.toLowerCase();
  const descriptor = {};
  if (fixture.decision === 'REFUSE_UNSUPPORTED') {
    descriptor.data = fixture.id === 'D02' ? '0x1234' : '0xdeadbeef';
  } else if (fixture.decision === 'REFUSE_POLICY') {
    if (title.includes('delegatecall') || fixture.id === 'A06') {
      descriptor.operation = 1;
    } else if (fixture.id === 'P01' || fixture.id === 'P02') {
      const token = health.erc20Tokens?.[0]?.address;
      if (!token) {
        descriptor.data = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [DEAD_ADDRESS, maxUint256],
        });
      } else {
        descriptor.toKind = 'token';
        descriptor.toAddress = token;
        descriptor.value = '0';
        descriptor.data = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [DEAD_ADDRESS, maxUint256],
        });
      }
    } else if (fixture.id === 'P04') {
      descriptor.value = health.maxNativeTransferWei
        ? (BigInt(health.maxNativeTransferWei) + 1n).toString()
        : '1';
    } else if (fixture.id === 'P03' || fixture.id === 'A02') {
      descriptor.toKind = 'unlisted';
    } else if (fixture.id.startsWith('H')) {
      descriptor.toKind = 'safe';
      descriptor.value = '0';
      descriptor.data = `0xe19a9dd9${GUARD_ADDRESS.slice(2).padStart(64, '0')}`;
    } else {
      descriptor.operation = 1;
    }
  } else if (fixture.decision === 'ATTEST_WITH_TIMELOCK') {
    descriptor.toKind = 'safe';
    descriptor.value = '0';
    descriptor.data = `0xe19a9dd9${GUARD_ADDRESS.slice(2).padStart(64, '0')}`;
  }
  const transaction = baseTransaction(health, descriptor);
  if (descriptor.toAddress) transaction.to = descriptor.toAddress;
  return transaction;
}

async function sendDecode(endpoint, transaction) {
  return jsonRequest(`${endpoint.replace(/\/$/, '')}/decode`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(transaction),
  });
}

async function conformance(args) {
  const endpoint = option(args, '--endpoint', 'http://127.0.0.1:8787');
  const cliContext = {
    safeAddress: option(args, '--safe'),
    safeNonce: option(args, '--nonce'),
    configuredChainId: option(args, '--chain-id'),
    nativeRecipients: option(args, '--recipient')
      ? [option(args, '--recipient')]
      : undefined,
  };
  const healthResponse = await jsonRequest(
    `${endpoint.replace(/\/$/, '')}/health`,
  );
  const health = healthResponse.body ?? {};
  const context = {
    ...health,
    safeAddress: cliContext.safeAddress ?? health.safeAddress,
    safeNonce: cliContext.safeNonce ?? health.safeNonce,
    configuredChainId: cliContext.configuredChainId ?? health.configuredChainId,
    nativeRecipients: cliContext.nativeRecipients ?? health.nativeRecipients,
  };
  const vectors = JSON.parse(await readFile(vectorPath, 'utf8'));
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));

  const policyVectors = vectors.policyVectors.map((vector) => {
    try {
      const compiled = compilePolicyFile(vector.policy);
      const pass =
        compiled.canonicalBytes === vector.canonicalBytes &&
        compiled.policyHash === vector.policyHash;
      return {
        id: vector.id,
        pass,
        expectedPolicyHash: vector.policyHash,
        actualPolicyHash: compiled.policyHash,
      };
    } catch (error) {
      return { id: vector.id, pass: false, error: error.message };
    }
  });

  const decodeVectors = [];
  const catalogResults = [];
  if (
    context.safeAddress &&
    context.safeNonce !== null &&
    context.safeNonce !== undefined &&
    context.configuredChainId
  ) {
    for (const vector of vectors.decodeVectors) {
      try {
        const response = await sendDecode(
          endpoint,
          baseTransaction(context, vector.transaction),
        );
        const decision = response.body?.decision ?? null;
        decodeVectors.push({
          id: vector.id,
          expectedDecision: vector.expectedDecision,
          actualDecision: decision,
          pass: response.ok && decision === vector.expectedDecision,
          httpStatus: response.status,
        });
      } catch (error) {
        decodeVectors.push({
          id: vector.id,
          expectedDecision: vector.expectedDecision,
          actualDecision: null,
          pass: false,
          error: error.message,
        });
      }
    }
    for (const fixture of catalog.fixtures) {
      if (fixture.id === 'F01') {
        catalogResults.push({
          id: fixture.id,
          expectedDecision: fixture.decision,
          actualDecision: null,
          expectedExecutionRevert: fixture.expectedRevert,
          pass: false,
          notApplicable: true,
          error:
            'Availability failure is outside a healthy POST /decode decision check.',
        });
        continue;
      }
      try {
        const response = await sendDecode(
          endpoint,
          transactionForFixture(fixture, context),
        );
        const decision = response.body?.decision ?? null;
        catalogResults.push({
          id: fixture.id,
          expectedDecision: fixture.decision,
          actualDecision: decision,
          expectedExecutionRevert: fixture.expectedRevert,
          pass: response.ok && decision === fixture.decision,
          httpStatus: response.status,
        });
      } catch (error) {
        catalogResults.push({
          id: fixture.id,
          expectedDecision: fixture.decision,
          actualDecision: null,
          expectedExecutionRevert: fixture.expectedRevert,
          pass: false,
          error: error.message,
        });
      }
    }
  } else {
    for (const vector of vectors.decodeVectors) {
      decodeVectors.push({
        id: vector.id,
        expectedDecision: vector.expectedDecision,
        actualDecision: null,
        pass: false,
        error: 'Verifier health or CLI flags did not provide a Safe context',
      });
    }
    for (const fixture of catalog.fixtures) {
      catalogResults.push({
        id: fixture.id,
        expectedDecision: fixture.decision,
        actualDecision: null,
        expectedExecutionRevert: fixture.expectedRevert,
        pass: false,
        error: 'Verifier health or CLI flags did not provide a Safe context',
      });
    }
  }

  const all = [...policyVectors, ...decodeVectors, ...catalogResults];
  const result = {
    format: 'intentlock.conformance.v1',
    endpoint,
    scope:
      'local policy compiler known answers plus endpoint POST /decode decision checks; catalog templates are representative and do not test execution/state behavior',
    health: {
      status: health.status ?? 'unavailable',
      signerAddress: health.signerAddress ?? null,
      policyHash: health.policyHash ?? null,
      decoderVersion: health.decoderVersion ?? null,
    },
    counts: {
      policyVectors: {
        passed: policyVectors.filter((item) => item.pass).length,
        total: policyVectors.length,
      },
      decodeVectors: {
        passed: decodeVectors.filter((item) => item.pass).length,
        total: decodeVectors.length,
      },
      catalog: {
        passed: catalogResults.filter((item) => item.pass).length,
        total: catalogResults.length,
      },
      total: {
        passed: all.filter((item) => item.pass).length,
        total: all.length,
      },
    },
    policyVectors,
    decodeVectors,
    catalog: catalogResults,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!healthResponse.ok || all.some((item) => !item.pass))
    process.exitCode = 1;
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'keygen') await keygen(args);
  else if (command === 'conformance') await conformance(args);
  else {
    process.stderr.write('Usage: intentlock <keygen|conformance> [options]\n');
    process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(`IntentLock CLI error: ${error.message}\n`);
  process.exitCode = 1;
}
