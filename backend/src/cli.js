#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { ATTESTATION_TYPES } from './attestations.js';
import {
  createHybridKeyBundle,
  envelopeJson,
  signHybridAttestation,
  verifyHybridEnvelope,
} from './hybrid-pq.js';
import { compilePolicyFile, lintPolicyDraft } from './policy-format.js';

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const catalogPath = path.join(rootDirectory, 'docs/fixtures/catalog.json');
const vectorPath = path.join(
  rootDirectory,
  'docs/fixtures/verifier-vectors.json',
);
const rawTransactionFields = [
  'chainId',
  'safe',
  'safeNonce',
  'to',
  'value',
  'data',
  'operation',
  'safeTxGas',
  'baseGas',
  'gasPrice',
  'gasToken',
  'refundReceiver',
];

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--'))
    throw new Error(`${name} requires a value`);
  return value;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(file) {
  const text =
    file === '-'
      ? await readStdin()
      : await readFile(path.resolve(file), 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${file}: ${error.message}`);
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function jsonRequest(url, init) {
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new Error(`Could not reach ${url}: ${error.message}`);
  }
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}

function endpointFrom(args) {
  return option(args, '--endpoint', 'http://127.0.0.1:8787').replace(/\/$/, '');
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
  print({
    created: true,
    address: account.address,
    keyFile: keyPath,
    privateKeyPrinted: false,
  });
}

async function hybridCommand(action, args) {
  if (action === 'keygen') {
    const outputDirectory = option(args, '--out');
    if (!outputDirectory)
      throw new Error('hybrid keygen requires --out DIRECTORY');
    print(await createHybridKeyBundle(outputDirectory));
    return;
  }
  if (action === 'sign') {
    const inputFile = args.find((arg) => !arg.startsWith('--'));
    const keyDirectory = option(args, '--keys');
    const outputFile = option(args, '--out');
    if (!inputFile || !keyDirectory || !outputFile) {
      throw new Error(
        'Use hybrid sign attestation.json --keys DIRECTORY --out envelope.json',
      );
    }
    const envelope = await signHybridAttestation({
      input: await readJson(inputFile),
      keyDirectory,
    });
    const outputPath = path.resolve(outputFile);
    await writeFile(outputPath, envelopeJson(envelope), {
      flag: 'wx',
      mode: 0o600,
    });
    print({
      created: true,
      file: outputPath,
      digest: envelope.attestationDigest,
      ecdsaSigner: envelope.signer.ecdsaAddress,
      pqAlgorithm: envelope.signer.pqAlgorithm,
      pqPublicKeyFingerprint: envelope.signer.pqPublicKeyFingerprint,
      scope: envelope.scope,
      registrySubmission: envelope.enforcement.registrySubmission,
      onchainAuthorization: envelope.enforcement.onchainAuthorization,
    });
    return;
  }
  if (action === 'verify') {
    const inputFile = args.find((arg) => !arg.startsWith('--'));
    const trustedKeys = option(args, '--keys');
    const chainIdText = option(args, '--chain-id');
    const registryAddress = option(args, '--registry');
    const chainId = Number(chainIdText);
    if (
      !inputFile ||
      !trustedKeys ||
      !Number.isSafeInteger(chainId) ||
      chainId <= 0 ||
      !registryAddress
    ) {
      throw new Error(
        'Use hybrid verify envelope.json --keys TRUSTED_KEY_DIRECTORY --chain-id ID --registry ADDRESS',
      );
    }
    const result = await verifyHybridEnvelope(
      await readJson(inputFile),
      trustedKeys,
      { chainId, registryAddress },
    );
    print(result);
    if (!result.verified) process.exitCode = 1;
    return;
  }
  throw new Error(
    'Use hybrid keygen --out DIRECTORY, hybrid sign attestation.json --keys DIRECTORY --out envelope.json, or hybrid verify envelope.json --keys TRUSTED_KEY_DIRECTORY --chain-id ID --registry ADDRESS',
  );
}

async function health(args) {
  const endpoint = endpointFrom(args);
  const result = await jsonRequest(`${endpoint}/health`);
  print({
    source: 'verifier_api',
    endpoint,
    httpStatus: result.status,
    ...result.body,
  });
  if (!result.ok) process.exitCode = 1;
}

async function context(args) {
  const endpoint = endpointFrom(args);
  const result = await jsonRequest(`${endpoint}/v1/context`);
  print({
    source: 'configured_chain_rpc',
    endpoint,
    httpStatus: result.status,
    context: result.body,
  });
  if (!result.ok) process.exitCode = 1;
}

async function doctor(args) {
  const endpoint = endpointFrom(args);
  const health = await jsonRequest(`${endpoint}/health`);
  const chain = await jsonRequest(`${endpoint}/v1/context`);
  const h = health.body ?? {};
  const c = chain.body ?? {};
  const checks = [
    { name: 'Verifier API responds', status: health.ok ? 'pass' : 'fail' },
    {
      name: 'Configured RPC responds',
      status: h.rpc === 'connected' ? 'pass' : 'fail',
    },
    {
      name: 'RPC chain matches configuration',
      status:
        h.observedChainId === h.configuredChainId && h.observedChainId != null
          ? 'pass'
          : 'fail',
    },
    {
      name: 'Safe is configured and readable',
      status: c.ready ? 'pass' : 'fail',
    },
    {
      name: 'Policy hash is configured',
      status: h.policyConfigured ? 'pass' : 'fail',
    },
    {
      name: 'Safe has no enabled modules',
      status:
        c.enabledModules === 0
          ? 'pass'
          : c.enabledModules == null
            ? 'warn'
            : 'fail',
    },
    {
      name: 'Execution relayer is ready',
      status: h.executionAvailable ? 'pass' : 'warn',
    },
  ];
  const failed = checks.some((check) => check.status === 'fail');
  const warnings = checks.some((check) => check.status === 'warn');
  print({
    source: 'verifier_api_and_configured_chain_rpc',
    endpoint,
    status: failed
      ? 'NEEDS_ATTENTION'
      : warnings
        ? 'READY_WITH_WARNINGS'
        : 'READY',
    checks,
    chain: {
      configuredChainId: h.configuredChainId ?? null,
      observedChainId: h.observedChainId ?? null,
      safeAddress: c.safeAddress ?? h.safeAddress ?? null,
      safeNonce: c.safeNonce ?? h.safeNonce ?? null,
      guardAddress: c.guardAddress ?? null,
      enabledModules: c.enabledModules ?? null,
      policyHash: h.policyHash ?? null,
      executionAvailable: Boolean(h.executionAvailable),
    },
  });
  if (failed) process.exitCode = 1;
}

async function createProposal(args) {
  const file = args.find((arg) => !arg.startsWith('--'));
  if (!file)
    throw new Error(
      'proposal create requires a raw Safe transaction JSON file',
    );
  const input = await readJson(file);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Proposal input must be a JSON object');
  }
  const transaction = input.transaction ?? input;
  validateRawTransaction(transaction);
  const endpoint = endpointFrom(args);
  const body = input.transaction ? input : { transaction };
  const result = await jsonRequest(`${endpoint}/v1/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  print({
    source: 'verifier_api_and_chain_rpc',
    endpoint,
    httpStatus: result.status,
    proposal: result.body,
  });
  if (!result.ok) process.exitCode = 1;
}

async function createProposalTemplate(args) {
  const file = args.find((arg) => !arg.startsWith('--'));
  if (!file)
    throw new Error('proposal template requires an output JSON file path');
  const endpoint = endpointFrom(args);
  const health = await jsonRequest(`${endpoint}/health`);
  const context = health.body ?? {};
  if (!health.ok || context.status !== 'ready') {
    throw new Error(
      `Cannot make a live template: verifier health is ${context.status ?? `HTTP ${health.status}`}. Start the configured API and chain, then run doctor.`,
    );
  }
  const recipient = context.nativeRecipients?.[0];
  if (!context.safeAddress || context.safeNonce == null || !recipient) {
    throw new Error(
      'Verifier health must provide a configured Safe, current nonce, and allowed native recipient',
    );
  }
  const transaction = {
    chainId: context.observedChainId ?? context.configuredChainId,
    safe: context.safeAddress,
    safeNonce: String(context.safeNonce),
    to: recipient,
    value: '1',
    data: '0x',
    operation: 0,
    safeTxGas: '0',
    baseGas: '0',
    gasPrice: '0',
    gasToken: `0x${'00'.repeat(20)}`,
    refundReceiver: `0x${'00'.repeat(20)}`,
  };
  const outputPath = path.resolve(file);
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        transaction,
        declaredMetadata: { label: 'CLI generated native transfer example' },
      },
      null,
      2,
    )}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  print({
    created: true,
    file: outputPath,
    chainId: transaction.chainId,
    safe: transaction.safe,
    safeNonce: transaction.safeNonce,
    recipient: transaction.to,
    valueWei: transaction.value,
    note: 'Review the fields, then run proposal create with this file. The display label is untrusted metadata.',
  });
}

async function showProposal(args) {
  const proposalId = args.find((arg) => !arg.startsWith('--'));
  if (!proposalId) throw new Error('proposal show requires a proposal ID');
  const endpoint = endpointFrom(args);
  const result = await jsonRequest(
    `${endpoint}/v1/proposals/${encodeURIComponent(proposalId)}`,
  );
  print({
    source: 'verifier_api_memory_store',
    endpoint,
    httpStatus: result.status,
    proposal: result.body,
  });
  if (!result.ok) process.exitCode = 1;
}

function explainEvent(event) {
  const payload = event.payload ?? {};
  const decision = payload.decision;
  const revert = payload.observedRevertName;
  if (event.type === 'proposal.created')
    return 'Proposal received. The backend evaluates raw Safe fields, not a UI label.';
  if (event.type === 'decode.started')
    return 'The backend is decoding destination, value, operation, calldata, nonce, and chain.';
  if (event.type === 'decode.completed')
    return `Decoding finished${payload.decodeStatus ? ` with status ${payload.decodeStatus}` : ''}.`;
  if (event.type === 'policy.evaluated')
    return `Deterministic policy decision: ${decision ?? 'not included in event'}.`;
  if (event.type === 'verifier.responded')
    return `A verifier responded: ${payload.result ?? 'result not included'}.`;
  if (event.type === 'attestation.threshold_met')
    return `Verifier threshold reached: ${payload.validSignerCount ?? '?'} of ${payload.threshold ?? '?'}.`;
  if (event.type === 'attestation.accepted')
    return `Verifier signature accepted. Current valid signer count: ${payload.validSignerCount ?? 'not reported'}.`;
  if (event.type === 'attestation.submitted_onchain')
    return 'The verifier attestation was written to the registry. This receipt is chain evidence.';
  if (event.type === 'attestation.already_submitted_onchain')
    return 'The registry already contains the matching attestation; no duplicate write was needed.';
  if (event.type === 'safe.execution_submitted')
    return `Safe execution submitted with ${payload.ownerSignatureCount ?? 'an unreported number of'} owner signatures.`;
  if (event.type === 'execution.submitted')
    return 'A signed Safe transaction was submitted to the configured local chain.';
  if (event.type === 'execution.not_submitted')
    return `Execution was not submitted${payload.reason ? `: ${payload.reason}` : '.'}`;
  if (event.type === 'execution.succeeded')
    return `The chain receipt reports successful execution${payload.blockNumber ? ` in block ${payload.blockNumber}` : ''}.`;
  if (event.type === 'execution.failed')
    return `The submitted transaction failed${payload.observedRevertName ? ` with ${payload.observedRevertName}` : ''}.`;
  if (event.type === 'guard.reverted')
    return `The on-chain guard rejected execution${revert ? ` with ${revert}` : ''}.`;
  if (event.type === 'safe.execution_failed')
    return `Safe execution failed${revert ? ` with ${revert}` : ''}.`;
  if (event.type === 'safe.execution_succeeded')
    return `Safe execution succeeded${payload.blockNumber ? ` in block ${payload.blockNumber}` : ''}.`;
  if (event.type === 'timelock.scheduled')
    return 'The exact action was scheduled and is waiting for its on-chain ready time.';
  if (event.type === 'timelock.ready')
    return 'The chain reports that the scheduled action is ready.';
  if (event.type === 'timelock.cancelled')
    return 'The scheduled action was cancelled.';
  return `Backend event: ${event.type}.`;
}

async function watchProposal(args) {
  const proposalId = args.find((arg) => !arg.startsWith('--'));
  if (!proposalId) throw new Error('proposal watch requires a proposal ID');
  const endpoint = endpointFrom(args);
  let response;
  try {
    response = await fetch(
      `${endpoint}/v1/proposals/${encodeURIComponent(proposalId)}/events`,
      { headers: { accept: 'text/event-stream' } },
    );
  } catch (error) {
    throw new Error(`Could not reach ${endpoint}: ${error.message}`);
  }
  if (!response.ok || !response.body)
    throw new Error(`Could not watch proposal (${response.status})`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) {
        const event = JSON.parse(data);
        print({
          source: 'backend_api_event_stream',
          sequence: event.sequence,
          type: event.type,
          explanation: explainEvent(event),
          event,
        });
      }
      boundary = buffer.indexOf('\n\n');
    }
    if (done) break;
  }
}

async function signSafe(args) {
  const file = args.find((arg) => !arg.startsWith('--'));
  const keyFile = option(args, '--key');
  if (!file)
    throw new Error('sign-safe requires a raw Safe transaction JSON file');
  if (!keyFile)
    throw new Error(
      'sign-safe requires --key with a local Safe owner key file',
    );
  const transaction = validateRawTransaction(await readJson(file));
  const keyText = (await readFile(path.resolve(keyFile), 'utf8')).trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(keyText))
    throw new Error('Key file must contain one 32-byte hex key');
  const account = privateKeyToAccount(keyText);
  const endpoint = endpointFrom(args);
  const [decoded, safeContext] = await Promise.all([
    jsonRequest(`${endpoint}/decode`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(transaction),
    }),
    jsonRequest(`${endpoint}/v1/context`),
  ]);
  if (!decoded.ok)
    throw new Error(
      `Backend decode rejected transaction (${decoded.status}): ${decoded.body?.error?.message ?? 'unknown error'}`,
    );
  if (!safeContext.ok)
    throw new Error(
      `Could not verify Safe owners from chain (${safeContext.status})`,
    );
  if (decoded.body?.decision !== 'ATTEST') {
    throw new Error(
      `Refusing to sign: backend decision is ${decoded.body?.decision ?? 'missing'}`,
    );
  }
  const owners = safeContext.body?.owners;
  if (
    !Array.isArray(owners) ||
    !owners.some(
      (owner) => owner.toLowerCase() === account.address.toLowerCase(),
    )
  ) {
    throw new Error(
      `Key address ${account.address} is not an owner of the configured Safe`,
    );
  }
  const signature = await account.sign({ hash: decoded.body.safeTxHash });
  print({
    source: 'local_safe_owner_signature',
    signer: account.address,
    safeTxHash: decoded.body.safeTxHash,
    decision: decoded.body.decision,
    signature,
    warning:
      'Signature authorizes only this exact Safe transaction digest. Keep it private until submitted.',
  });
}

async function attestProposal(args) {
  const proposalId = args.find((arg) => !arg.startsWith('--'));
  const keyFile = option(args, '--key');
  if (!proposalId) throw new Error('attest requires a proposal ID');
  if (!keyFile)
    throw new Error(
      'attest requires --key with one configured verifier key file',
    );
  const endpoint = endpointFrom(args);
  const [proposalResponse, configResponse, contextResponse] = await Promise.all(
    [
      jsonRequest(`${endpoint}/v1/proposals/${encodeURIComponent(proposalId)}`),
      jsonRequest(`${endpoint}/v1/config`),
      jsonRequest(`${endpoint}/v1/context`),
    ],
  );
  if (!proposalResponse.ok)
    throw new Error(`Could not read proposal (${proposalResponse.status})`);
  if (!configResponse.ok)
    throw new Error(
      `Could not read verifier configuration (${configResponse.status})`,
    );
  if (!contextResponse.ok)
    throw new Error(`Could not read chain time (${contextResponse.status})`);
  const proposal = proposalResponse.body;
  const config = configResponse.body;
  const context = contextResponse.body;
  if (proposal.decision !== 'ATTEST')
    throw new Error(`Refusing to attest policy decision ${proposal.decision}`);
  const keyText = (await readFile(path.resolve(keyFile), 'utf8')).trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(keyText))
    throw new Error('Key file must contain one 32-byte hex key');
  const account = privateKeyToAccount(keyText);
  if (
    !Array.isArray(config.verifierAddresses) ||
    !config.verifierAddresses.some(
      (address) => address.toLowerCase() === account.address.toLowerCase(),
    )
  ) {
    throw new Error(
      `Key address ${account.address} is not in the configured verifier set`,
    );
  }
  if (
    !config.registryAddress ||
    !config.verifierSetId ||
    !context.timestamp ||
    !proposal.decoded?.intent
  ) {
    throw new Error(
      'Proposal, registry, verifier-set, or chain timestamp fields are incomplete',
    );
  }
  const issuedAt = BigInt(context.timestamp);
  const attestation = {
    safe: proposal.transaction.safe,
    safeNonce: BigInt(proposal.transaction.safeNonce),
    safeTxHash: proposal.safeTxHash,
    intentHash: proposal.decoded.intentHash,
    intentSchemaVersion: 1,
    policyClass: proposal.decoded.policyClass,
    targetCodeHash: proposal.decoded.targetCodeHash,
    resolvedImplementation: proposal.decoded.intent.resolvedImplementation,
    implementationCodeHash: proposal.decoded.intent.implementationCodeHash,
    policyHash: config.policyHash,
    verifierSetId: config.verifierSetId,
    issuedAt,
    validUntil: issuedAt + BigInt(config.maxAttestationSeconds),
    proposalId: proposal.proposalId,
  };
  const signature = await account.signTypedData({
    domain: {
      name: 'IntentLock',
      version: '1',
      chainId: config.chainId,
      verifyingContract: config.registryAddress,
    },
    types: ATTESTATION_TYPES,
    primaryType: 'IntentAttestation',
    message: attestation,
  });
  const serialized = Object.fromEntries(
    Object.entries(attestation).map(([field, value]) => [
      field,
      typeof value === 'bigint' ? value.toString() : value,
    ]),
  );
  const submitted = await jsonRequest(
    `${endpoint}/v1/proposals/${encodeURIComponent(proposalId)}/attestations`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ attestation: serialized, signature }),
    },
  );
  print({
    source: 'local_verifier_signature_and_backend_verification',
    signer: account.address,
    proposalId,
    decision: proposal.decision,
    httpStatus: submitted.status,
    result: submitted.body,
    signatureSubmitted: submitted.ok,
    privateKeyPrinted: false,
  });
  if (!submitted.ok) process.exitCode = 1;
}

async function executeProposal(args) {
  const proposalId = args.find((arg) => !arg.startsWith('--'));
  const inlineSignatures = option(args, '--safe-signatures');
  const signatureFile = option(args, '--safe-signatures-file');
  if (!proposalId) throw new Error('execute requires a proposal ID');
  if (inlineSignatures && signatureFile)
    throw new Error(
      'Use either --safe-signatures or --safe-signatures-file, not both',
    );
  if (!inlineSignatures && !signatureFile)
    throw new Error(
      'execute requires externally produced Safe signatures via --safe-signatures-file or --safe-signatures',
    );
  const safeSignatures =
    inlineSignatures ??
    (await readFile(path.resolve(signatureFile), 'utf8')).trim();
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(safeSignatures))
    throw new Error('Safe signatures must be non-empty even-length hex bytes');
  const endpoint = endpointFrom(args);
  const response = await jsonRequest(
    `${endpoint}/v1/proposals/${encodeURIComponent(proposalId)}/execute`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ safeSignatures }),
    },
  );
  print({
    source: 'local_anvil_execution_api',
    endpoint,
    proposalId,
    httpStatus: response.status,
    result: response.body,
  });
  if (!response.ok) process.exitCode = 1;
}

async function policyCommand(action, args) {
  const file = args.find((arg) => !arg.startsWith('--'));
  if (!file)
    throw new Error(
      `policy ${action} requires a policy JSON file (use - for stdin)`,
    );
  const input = await readJson(file);
  if (action === 'validate') {
    const compiled = compilePolicyFile(input);
    print({ valid: true, source: 'local_deterministic_compiler', ...compiled });
    return;
  }
  if (action === 'compile') {
    const compiled = compilePolicyFile(input);
    const outputPath = option(args, '--out');
    if (outputPath) {
      await writeFile(path.resolve(outputPath), compiled.canonicalPolicyJson, {
        flag: 'w',
      });
    }
    print({
      valid: true,
      source: 'local_deterministic_compiler',
      outputFile: outputPath ? path.resolve(outputPath) : null,
      ...compiled,
    });
    return;
  }
  if (action === 'lint') {
    const issues = lintPolicyDraft(input);
    print({
      source: 'local_policy_linter',
      issues,
      counts: {
        errors: issues.filter((issue) => issue.severity === 'error').length,
        warnings: issues.filter((issue) => issue.severity === 'warning').length,
      },
    });
    if (issues.some((issue) => issue.severity === 'error'))
      process.exitCode = 1;
    return;
  }
  throw new Error(`Unknown policy command: ${action}`);
}

function validateRawTransaction(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Raw transaction input must be a JSON object');
  }
  const extra = Object.keys(input).filter(
    (key) => !rawTransactionFields.includes(key),
  );
  const missing = rawTransactionFields.filter((key) => !(key in input));
  if (extra.length || missing.length) {
    throw new Error(
      `Raw transaction fields mismatch; unexpected: ${extra.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'}`,
    );
  }
  if (
    !Number.isSafeInteger(input.chainId) ||
    ![0, 1].includes(input.operation)
  ) {
    throw new Error(
      'chainId and operation must be safe integers; operation must be 0 or 1',
    );
  }
  for (const field of ['safe', 'to', 'gasToken', 'refundReceiver']) {
    if (
      typeof input[field] !== 'string' ||
      !/^0x[0-9a-fA-F]{40}$/.test(input[field])
    ) {
      throw new Error(`${field} must be a 20-byte EVM address`);
    }
  }
  for (const field of [
    'safeNonce',
    'value',
    'safeTxGas',
    'baseGas',
    'gasPrice',
  ]) {
    if (
      typeof input[field] !== 'string' ||
      !/^(0|[1-9][0-9]*)$/.test(input[field])
    ) {
      throw new Error(`${field} must be a canonical unsigned decimal string`);
    }
  }
  if (
    typeof input.data !== 'string' ||
    !/^0x(?:[0-9a-fA-F]{2})*$/.test(input.data)
  ) {
    throw new Error('data must be even-length hex calldata');
  }
  return input;
}

async function decode(args) {
  const file = args.find((arg) => !arg.startsWith('--'));
  if (!file)
    throw new Error(
      'decode requires a raw transaction JSON file (use - for stdin)',
    );
  const transaction = validateRawTransaction(await readJson(file));
  const endpoint = endpointFrom(args);
  const result = await jsonRequest(`${endpoint}/decode`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(transaction),
  });
  print({
    source: 'verifier_api',
    endpoint,
    httpStatus: result.status,
    result: result.body,
  });
  if (!result.ok) process.exitCode = 1;
}

function vectorTransaction(context, descriptor) {
  if (
    !context.safeAddress ||
    !context.configuredChainId ||
    context.safeNonce == null
  ) {
    throw new Error(
      'Verifier health must provide safeAddress, configuredChainId, and safeNonce for decoder vectors',
    );
  }
  const recipient = context.nativeRecipients?.[0];
  if (!recipient)
    throw new Error(
      'Verifier health must provide a configured native recipient for decoder vectors',
    );
  return {
    chainId: context.observedChainId ?? context.configuredChainId,
    safe: context.safeAddress,
    safeNonce: String(context.safeNonce),
    to: recipient,
    value: descriptor.value,
    data: descriptor.data,
    operation: descriptor.operation,
    safeTxGas: '0',
    baseGas: '0',
    gasPrice: '0',
    gasToken: `0x${'00'.repeat(20)}`,
    refundReceiver: `0x${'00'.repeat(20)}`,
  };
}

async function conformance(args) {
  const endpoint = endpointFrom(args);
  const healthResponse = await jsonRequest(`${endpoint}/health`);
  const health = healthResponse.body ?? {};
  const vectors = await readJson(vectorPath);
  const catalog = await readJson(catalogPath);
  const policyVectors = vectors.policyVectors.map((vector) => {
    try {
      const compiled = compilePolicyFile(vector.policy);
      return {
        id: vector.id,
        source: 'checked_in_known_answer_vector',
        expectedPolicyHash: vector.policyHash,
        actualPolicyHash: compiled.policyHash,
        pass:
          compiled.canonicalBytes === vector.canonicalBytes &&
          compiled.policyHash === vector.policyHash,
      };
    } catch (error) {
      return {
        id: vector.id,
        source: 'checked_in_known_answer_vector',
        pass: false,
        error: error.message,
      };
    }
  });
  const decodeVectors = [];
  for (const vector of vectors.decodeVectors) {
    try {
      const transaction = vectorTransaction(health, vector.transaction);
      const response = await jsonRequest(`${endpoint}/decode`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(transaction),
      });
      const actualDecision = response.body?.decision ?? null;
      decodeVectors.push({
        id: vector.id,
        source: 'checked_in_known_answer_vector_with_live_verifier_context',
        expectedDecision: vector.expectedDecision,
        actualDecision,
        httpStatus: response.status,
        pass: response.ok && actualDecision === vector.expectedDecision,
      });
    } catch (error) {
      decodeVectors.push({
        id: vector.id,
        source: 'checked_in_known_answer_vector',
        expectedDecision: vector.expectedDecision,
        actualDecision: null,
        pass: false,
        error: error.message,
      });
    }
  }
  const catalogRows = catalog.fixtures.map((fixture) => ({
    id: fixture.id,
    expectedDecision: fixture.decision,
    status: 'NOT_RUN',
    reason:
      'Catalog fixture does not contain a complete raw transaction and execution harness input; no result is inferred.',
  }));
  const executed = [...policyVectors, ...decodeVectors];
  const passed = executed.filter((item) => item.pass).length;
  const result = {
    format: 'intentlock.conformance.v1',
    endpoint,
    source: 'local_known_answer_vectors_and_live_verifier_api',
    health: {
      httpStatus: healthResponse.status,
      status: health.status ?? 'unavailable',
      signerAddress: health.signerAddress ?? null,
      policyHash: health.policyHash ?? null,
      decoderVersion: health.decoderVersion ?? null,
    },
    counts: {
      executed: {
        passed,
        failed: executed.length - passed,
        total: executed.length,
      },
      catalog: { executed: 0, notRun: catalogRows.length },
    },
    policyVectors,
    decodeVectors,
    catalog: catalogRows,
  };
  print(result);
  if (!healthResponse.ok || executed.some((item) => !item.pass))
    process.exitCode = 1;
}

function usage(stream = process.stdout) {
  const color = stream.isTTY && process.env.NO_COLOR === undefined;
  const paint = (code, value) =>
    color ? `\u001b[${code}m${value}\u001b[0m` : value;
  const title = paint('1;38;2;255;91;20', 'INTENTLOCK');
  const dim = (value) => paint('90', value);
  const command = (value) => paint('1;37', value);
  const mark = [
    '                   .--------.',
    '                  /          \\',
    '                  |          |',
    '             .----+------------+----.',
    '             |       .------.       |',
    '             |       |  ()  |       |',
    '             |       |  ||  |       |',
    "             |       '------'       |",
    "             '----------------------'",
  ];
  const heading = [
    `${title}  ${dim('POLICY TOOLKIT')}`,
    dim('SAFE TRANSACTION POLICY WORKBENCH'),
    '',
    paint('1;37', 'Compile policy.'),
    paint('1;37', 'Inspect raw transactions.'),
    paint('1;37', 'Verify with your configured API.'),
    '',
    '',
    '',
  ];
  stream.write('\n');
  for (let index = 0; index < mark.length; index += 1) {
    stream.write(
      `  ${paint('38;2;255;91;20', mark[index].padEnd(38))}   ${heading[index] ?? ''}\n`,
    );
  }
  stream.write(
    `  ${dim('──────────────────────────────────────────────────────────')}\n\n`,
  );
  stream.write(
    `  ${paint('1;37', 'GET STARTED · TYPE THESE AT THE INTENTLOCK> PROMPT')}\n`,
  );
  stream.write(
    `  ${command('policy validate policy.json')}  ${dim('check policy shape + hash')}\n`,
  );
  stream.write(
    `  ${command('policy compile policy.json')}   ${dim('compile canonical policy')}\n`,
  );
  stream.write(
    `  ${command('policy lint policy.json')}      ${dim('find policy issues')}\n\n`,
  );
  stream.write(`  ${paint('1;37', 'COMMANDS')}\n`);
  stream.write(
    `  ${command('health')}        ${dim('read configured verifier API health')}\n`,
  );
  stream.write(
    `  ${command('doctor')}        ${dim('check API, RPC, Safe, policy, modules, and relayer readiness')}\n`,
  );
  stream.write(
    `  ${command('context')}      ${dim('read current Safe owners, nonce, modules, and balance')}\n`,
  );
  stream.write(
    `  ${command('keygen')}        ${dim('create a disposable local key file')}\n`,
  );
  stream.write(
    `  ${command('hybrid keygen --out DIR')} ${dim('create ECDSA + ML-DSA-65 local verifier keys')}\n`,
  );
  stream.write(
    `  ${command('hybrid sign input.json --keys DIR --out FILE')} ${dim('sign an EIP-712 attestation off-chain with both keys')}\n`,
  );
  stream.write(
    `  ${command('hybrid verify envelope.json --keys DIR --chain-id ID --registry ADDRESS')} ${dim('verify both signatures and the expected EIP-712 domain')}\n`,
  );
  stream.write(
    `  ${command('policy')}        ${dim('validate, compile, or lint a policy JSON file')}\n`,
  );
  stream.write(
    `  ${command('decode')}        ${dim('submit raw Safe fields to POST /decode')}\n`,
  );
  stream.write(
    `  ${command('proposal create tx.json')} ${dim('decode and store a proposal against live RPC')}\n`,
  );
  stream.write(
    `  ${command('proposal template tx.json')} ${dim('write a raw Safe example from live Safe context')}\n`,
  );
  stream.write(
    `  ${command('proposal show ID')} ${dim('read a proposal from this backend process')}\n`,
  );
  stream.write(
    `  ${command('proposal watch ID')} ${dim('stream workflow events with plain-English explanations')}\n`,
  );
  stream.write(
    `  ${command('sign-safe tx.json --key FILE')} ${dim('sign an ATTEST Safe digest as a verified owner')}\n`,
  );
  stream.write(
    `  ${command('attest PROPOSAL_ID --key FILE')} ${dim('sign and submit one configured verifier attestation')}\n`,
  );
  stream.write(
    `  ${command('execute ID --safe-signatures-file FILE')} ${dim('submit a private signature file to the configured Safe')}\n`,
  );
  stream.write(
    `  ${command('conformance')}   ${dim('run known-answer checks against a verifier')}\n\n`,
  );
  stream.write(
    `  ${dim('Fish one-shot form: npm run intentlock -- health')}\n`,
  );
  stream.write(
    `  ${dim('Run npm run intentlock -- --help to reopen this screen. Use - for JSON stdin.')}\n\n`,
  );
}

function tokenize(line) {
  const values = [];
  let value = '';
  let quote = null;
  let escaped = false;
  for (const character of line) {
    if (escaped) {
      value += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (quote) {
      if (character === quote) quote = null;
      else value += character;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (/\s/.test(character)) {
      if (value) values.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  if (escaped) value += '\\';
  if (quote) throw new Error('Unclosed quote in command');
  if (value) values.push(value);
  return values;
}

async function runCommand(command, args, { interactive = false } = {}) {
  if (
    command === '--help' ||
    command === '-h' ||
    command === 'help' ||
    args.includes('--help') ||
    args.includes('-h')
  ) {
    usage();
  } else if (command === 'health') await health(args);
  else if (command === 'doctor') await doctor(args);
  else if (command === 'context') await context(args);
  else if (command === 'keygen') await keygen(args);
  else if (command === 'hybrid') await hybridCommand(args[0], args.slice(1));
  else if (command === 'decode') await decode(args);
  else if (command === 'proposal') {
    const [action, ...rest] = args;
    if (action === 'create') await createProposal(rest);
    else if (action === 'template') await createProposalTemplate(rest);
    else if (action === 'show') await showProposal(rest);
    else if (action === 'watch') await watchProposal(rest);
    else
      throw new Error(
        'Use proposal template tx.json, proposal create tx.json, proposal show ID, or proposal watch ID',
      );
  } else if (command === 'sign-safe') await signSafe(args);
  else if (command === 'attest') await attestProposal(args);
  else if (command === 'execute') await executeProposal(args);
  else if (command === 'conformance') await conformance(args);
  else if (command === 'policy') await policyCommand(args[0], args.slice(1));
  else if (!command) usage();
  else throw new Error(`Unknown command: ${command}`);
  if (interactive) process.exitCode = 0;
}

async function interactive() {
  const promptColor = process.env.NO_COLOR === undefined;
  const prompt = promptColor
    ? '\u001b[38;2;255;91;20mintentlock\u001b[0m> '
    : 'intentlock> ';
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt,
  });
  usage();
  process.stdout.write(
    'Type help to see commands. Type exit or press Ctrl-D to leave.\n',
  );
  terminal.prompt();
  for await (const line of terminal) {
    let parts;
    try {
      parts = tokenize(line.trim());
      if (!parts.length) {
        terminal.prompt();
        continue;
      }
      const [command, ...args] = parts;
      if (command === 'exit' || command === 'quit') break;
      if (command === 'clear') {
        process.stdout.write('\u001b[2J\u001b[H');
        usage();
      } else {
        await runCommand(command, args, { interactive: true });
      }
    } catch (error) {
      process.stderr.write(`IntentLock CLI error: ${error.message}\n`);
      process.exitCode = 0;
    }
    terminal.prompt();
  }
  terminal.close();
}

const [command, ...args] = process.argv.slice(2);
if (!command && process.stdin.isTTY && process.stdout.isTTY) {
  await interactive();
} else {
  try {
    await runCommand(command, args);
  } catch (error) {
    process.stderr.write(`IntentLock CLI error: ${error.message}\n`);
    process.exitCode = 1;
  }
}
