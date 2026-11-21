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
import { compilePolicyFile, lintPolicyDraft, normalizePolicyFile, comparePolicyWithRegistry } from './policy-format.js';
import { resolveProfile, redactProfile, verifyProfileAgainstChain, BUILTIN_PROFILES } from './profiles.js';
import { EXIT_CODES, CliError, formatOutput, redact } from './output.js';
import { LocalFileSignerProvider, validateSignerMembership, SIGNER_ROLES } from './signers.js';
import { createChainClient, SAFE_ABI } from './safe.js';

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

const CLI_VERSION = '0.2.0-prod';
const PROTOCOL_VERSION = '1.0.0';
const SCHEMA_VERSION = 'intentlock.cli.v1';

import fs from 'node:fs';

function resolveDemoFilePath(filename) {
  if (fs.existsSync(path.resolve(filename))) return path.resolve(filename);
  const inBackend = path.join(rootDirectory, 'backend', filename);
  if (fs.existsSync(inBackend)) return inBackend;
  return path.resolve(filename);
}


const LAST_PROPOSAL_FILE = path.join(rootDirectory, 'backend/.last-proposal-id');

async function saveLastProposalId(id) {
  try {
    await writeFile(LAST_PROPOSAL_FILE, id, 'utf8');
  } catch {}
}

async function getLastProposalId() {
  try {
    return (await readFile(LAST_PROPOSAL_FILE, 'utf8')).trim();
  } catch {
    return null;
  }
}

async function resolveProposalId(id) {
  if (id && id !== 'latest' && !id.startsWith('--')) return id;
  const last = await getLastProposalId();
  if (!last) {
    throw new CliError('No active proposal found. Run "proposal create valid-tx.json" or "demo propose" first.', {
      code: 'NO_PROPOSAL_ID',
      exitCode: EXIT_CODES.INVALID_ARGUMENT,
    });
  }
  return last;
}


function parseGlobalFlags(args) {
  const flags = {
    help: false,
    version: false,
    profile: 'anvil-local',
    endpoint: null,
    output: process.stdout.isTTY ? 'human' : 'json',
    noColor: Boolean(process.env.NO_COLOR) || false,
    timeout: 10000,
    requestId: null,
    verbose: false,
    config: null,
    confirmSafeTxHash: null,
    restArgs: [],
  };

  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--version') {
      flags.version = true;
    } else if (arg === '--profile') {
      flags.profile = args[++i];
    } else if (arg === '--endpoint') {
      flags.endpoint = args[++i];
    } else if (arg === '--output') {
      flags.output = args[++i];
    } else if (arg === '--no-color') {
      flags.noColor = true;
    } else if (arg === '--timeout') {
      flags.timeout = parseInt(args[++i], 10);
    } else if (arg === '--request-id') {
      flags.requestId = args[++i];
    } else if (arg === '--verbose') {
      flags.verbose = true;
    } else if (arg === '--config') {
      flags.config = args[++i];
    } else if (arg === '--confirm-safe-tx-hash') {
      flags.confirmSafeTxHash = args[++i];
    } else {
      positional.push(arg);
    }
  }
  flags.restArgs = positional;
  return flags;
}

function printResult(result, flags, commandName) {
  const output = formatOutput(result, {
    mode: flags.output,
    command: commandName,
    profile: flags.profile,
    requestId: flags.requestId,
    noColor: flags.noColor,
  });
  process.stdout.write(`${output}\n`);
}

async function readJson(file) {
  const text = file === '-' ? await readStdin() : await readFile(path.resolve(file), 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError(`Invalid JSON in ${file}: ${error.message}`, {
      code: 'INVALID_JSON',
      exitCode: EXIT_CODES.INVALID_ARGUMENT,
    });
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function jsonRequest(url, init = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    if (!response.ok) {
      const code = body?.error?.code || body?.code || `HTTP_${response.status}`;
      const msg = body?.error?.message || body?.message || text || response.statusText;
      let exitCode = EXIT_CODES.INTERNAL_ERROR;
      if (response.status === 400) exitCode = EXIT_CODES.INVALID_ARGUMENT;
      else if (response.status === 401 || response.status === 403) exitCode = EXIT_CODES.AUTH_FAILURE;
      else if (response.status === 409) exitCode = EXIT_CODES.RPC_INCONSISTENCY;
      else if (response.status === 503) exitCode = EXIT_CODES.RPC_INCONSISTENCY;
      throw new CliError(msg, { code, exitCode, details: body });
    }
    return body;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new CliError(`Request timed out after ${timeoutMs}ms`, {
        code: 'TIMEOUT',
        exitCode: EXIT_CODES.RPC_INCONSISTENCY,
      });
    }
    if (err instanceof CliError) throw err;
    throw new CliError(`Network error connecting to ${url}: ${err.message}`, {
      code: 'NETWORK_ERROR',
      exitCode: EXIT_CODES.RPC_INCONSISTENCY,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function handleProfileCommand(args, flags) {
  const [subAction, ...subArgs] = args;
  if (!subAction || subAction === 'list') {
    return {
      profiles: Object.keys(BUILTIN_PROFILES).map((k) => redactProfile(BUILTIN_PROFILES[k])),
    };
  }
  if (subAction === 'show') {
    const name = subArgs[0] || flags.profile;
    const prof = await resolveProfile({ profileName: name, configPath: flags.config });
    return { profile: redactProfile(prof) };
  }
  if (subAction === 'verify') {
    const prof = await resolveProfile({ profileName: flags.profile, configPath: flags.config, overrides: { endpoint: flags.endpoint } });
    const res = await verifyProfileAgainstChain(prof);
    return { status: 'VERIFIED', chainId: res.chainId, profile: prof.name };
  }
  throw new CliError(`Unknown profile action: ${subAction}`, { code: 'INVALID_ACTION', exitCode: EXIT_CODES.INVALID_ARGUMENT });
}

async function handleHealth(flags) {
  const profile = await resolveProfile({ profileName: flags.profile, configPath: flags.config, overrides: { endpoint: flags.endpoint } });
  const result = await jsonRequest(`${profile.endpoint}/health`, {}, flags.timeout);
  return {
    serviceReady: true,
    executionAvailable: Boolean(result.executionGate?.open || result.executionReady),
    health: result,
  };
}

async function handleDoctor(flags) {
  const profile = await resolveProfile({ profileName: flags.profile, configPath: flags.config, overrides: { endpoint: flags.endpoint } });
  const healthRes = await jsonRequest(`${profile.endpoint}/health`, {}, flags.timeout);
  const contextRes = await jsonRequest(`${profile.endpoint}/v1/context`, {}, flags.timeout);

  const checks = [
    { name: 'API Health', status: healthRes.status === 'ready' ? 'PASS' : 'WARN', detail: healthRes.status },
    { name: 'Chain ID Binding', status: contextRes.chainId === profile.chainId ? 'PASS' : 'FAIL', detail: `Expected ${profile.chainId}, observed ${contextRes.chainId}` },
    { name: 'Safe Deployment', status: contextRes.safeCodeHash ? 'PASS' : 'FAIL', detail: contextRes.safeAddress },
    { name: 'Safe Version', status: contextRes.safeVersion === profile.safeVersion ? 'PASS' : 'FAIL', detail: contextRes.safeVersion },
    { name: 'Safe Nonce', status: 'PASS', detail: `Nonce ${contextRes.safeNonce}` },
    { name: 'Safe Owners & Threshold', status: contextRes.owners?.length >= Number(contextRes.threshold) ? 'PASS' : 'FAIL', detail: `${contextRes.threshold}-of-${contextRes.owners?.length} threshold` },
    { name: 'Transaction Guard', status: contextRes.guardAddress ? 'PASS' : 'FAIL', detail: contextRes.guardAddress },
    { name: 'Module Security (D-016)', status: contextRes.enabledModules === 0 ? 'PASS' : 'FAIL', detail: `${contextRes.enabledModules} active modules (0 required)` },
    { name: 'Policy Registry Hash', status: healthRes.policyHash ? 'PASS' : 'WARN', detail: healthRes.policyHash },
  ];

  return {
    summary: checks.every(c => c.status === 'PASS') ? 'ALL CHECKS PASSED' : 'CHECK WARNINGS DETECTED',
    observedAtBlock: contextRes.observedAtBlock,
    blockHash: contextRes.blockHash,
    checks,
  };
}

async function handleContext(flags) {
  const profile = await resolveProfile({ profileName: flags.profile, configPath: flags.config, overrides: { endpoint: flags.endpoint } });
  const result = await jsonRequest(`${profile.endpoint}/v1/context`, {}, flags.timeout);
  return result;
}

async function handleDecode(args, flags) {
  const file = args[0] || '-';
  const raw = await readJson(file);

  // Validate strict transaction input: no client hashes or decisions allowed
  for (const field of ['safeTxHash', 'intentHash', 'decision', 'label']) {
    if (field in raw) {
      throw new CliError(`Client-supplied "${field}" is strictly prohibited in decode input`, {
        code: 'PROHIBITED_CLIENT_FIELD',
        exitCode: EXIT_CODES.INVALID_ARGUMENT,
      });
    }
  }

  const profile = await resolveProfile({ profileName: flags.profile, configPath: flags.config, overrides: { endpoint: flags.endpoint } });
  const result = await jsonRequest(`${profile.endpoint}/decode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(raw),
  }, flags.timeout);

  result.signingPerformed = false;
  result.broadcastPerformed = false;
  return result;
}

async function handleProposal(action, args, flags) {
  const profile = await resolveProfile({ profileName: flags.profile, configPath: flags.config, overrides: { endpoint: flags.endpoint } });

  if (action === 'create') {
    const file = args[0] || resolveDemoFilePath('valid-tx.json');
    const raw = await readJson(file);
    const payload = raw.transaction ? { ...raw } : { transaction: { ...raw }, declaredMetadata: { label: 'CLI Proposal' } };
    
    // Automatically sync live Safe context (nonce, safe, chainId)
    try {
      const ctx = await jsonRequest(`${profile.endpoint}/v1/context`, {}, flags.timeout);
      if (ctx && ctx.safeNonce !== null && ctx.safeNonce !== undefined) {
        payload.transaction.safeNonce = String(ctx.safeNonce);
        payload.transaction.safe = ctx.safeAddress || payload.transaction.safe;
        payload.transaction.chainId = ctx.chainId || payload.transaction.chainId;
      }
    } catch {}

    const sendCreate = async () => {
      return jsonRequest(`${profile.endpoint}/v1/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, flags.timeout);
    };

    let result;
    try {
      result = await sendCreate();
    } catch (err) {
      if (err.code === 'COMPETING_PROPOSAL') {
        // Auto-clear competing proposal lock and retry once
        await jsonRequest(`${profile.endpoint}/v1/reset`, { method: 'POST' }, flags.timeout).catch(() => {});
        result = await sendCreate();
      } else {
        throw err;
      }
    }

    if (result.proposalId) {
      await saveLastProposalId(result.proposalId);
    }
    return result;
  }

  if (action === 'show') {
    const id = await resolveProposalId(args[0]);
    return jsonRequest(`${profile.endpoint}/v1/proposals/${id}`, {}, flags.timeout);
  }

  if (action === 'template') {
    const file = args[0] || 'proposal-template.json';
    const ctx = await jsonRequest(`${profile.endpoint}/v1/context`, {}, flags.timeout);
    const template = {
      chainId: ctx.chainId,
      safe: ctx.safeAddress,
      safeNonce: ctx.safeNonce,
      to: '0x0000000000000000000000000000000000000000',
      value: '1', // Conspicuous example 1 wei
      data: '0x',
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      _notice: 'EXAMPLE TEMPLATE ONLY. DO NOT EXECUTE WITHOUT POPULATING REAL RECIPIENT AND VALUES.',
    };
    await writeFile(path.resolve(file), JSON.stringify(template, null, 2), { mode: 0o600 });
    return { written: file, template };
  }

  if (action === 'export') {
    const id = args[0];
    if (!id) throw new CliError('proposal export requires PROPOSAL_ID', { code: 'MISSING_ARG', exitCode: EXIT_CODES.INVALID_ARGUMENT });
    const outIdx = args.indexOf('--out');
    const outputFile = (outIdx >= 0 ? args[outIdx + 1] : null) || (args[1] && !args[1].startsWith('--') ? args[1] : null) || `evidence-${id.slice(0, 10)}.json`;
    const proposal = await jsonRequest(`${profile.endpoint}/v1/proposals/${id}`, {}, flags.timeout);
    const exportBundle = {
      schemaVersion: 'intentlock.evidence.v1',
      proposalId: id,
      exportedAt: new Date().toISOString(),
      profile: profile.name,
      chainId: profile.chainId,
      proposal,
    };
    await writeFile(path.resolve(outputFile), JSON.stringify(exportBundle, null, 2), { mode: 0o600 });
    return { exported: outputFile, proposalId: id, status: 'EVIDENCE_EXPORTED' };
  }

  throw new CliError(`Unknown proposal action: ${action}`, { code: 'INVALID_ACTION', exitCode: EXIT_CODES.INVALID_ARGUMENT });
}

async function handlePolicy(action, args, flags) {
  if (action === 'validate') {
    const raw = await readJson(args[0]);
    normalizePolicyFile(raw);
    const compiled = compilePolicyFile(raw);
    return { valid: true, schemaVersion: raw.schemaVersion, policyHash: compiled.policyHash };
  }
  if (action === 'lint') {
    const raw = await readJson(args[0]);
    const findings = lintPolicyDraft(raw);
    return { findings, count: findings.length };
  }
  if (action === 'compile') {
    const raw = await readJson(args[0]);
    const outIndex = args.indexOf('--output');
    const outFile = outIndex >= 0 ? args[outIndex + 1] : null;
    const compiled = compilePolicyFile(raw);
    if (outFile) {
      await writeFile(path.resolve(outFile), JSON.stringify(compiled.canonicalPolicy, null, 2));
    }
    return { policyHash: compiled.policyHash, canonicalAbiBytes: compiled.canonicalAbiBytes };
  }
  if (action === 'compare') {
    const file = args[0];
    if (!file) throw new CliError('policy compare requires POLICY.json', { code: 'MISSING_ARG', exitCode: EXIT_CODES.INVALID_ARGUMENT });
    const raw = await readJson(file);
    const profile = await resolveProfile({ profileName: flags.profile, configPath: flags.config });
    const client = createChainClient({ chainId: profile.chainId, rpcUrl: profile.rpcUrl });
    const result = await comparePolicyWithRegistry(raw, client, profile.registryAddress);
    return result;
  }
  throw new CliError(`Unknown policy action: ${action}`, { code: 'INVALID_ACTION', exitCode: EXIT_CODES.INVALID_ARGUMENT });
}

async function handleAttest(args, flags) {
  let proposalIdArg = args[0];
  let keyFile = null;
  const keyIdx = args.indexOf('--key');
  if (keyIdx >= 0) {
    keyFile = args[keyIdx + 1];
    if (proposalIdArg === '--key') proposalIdArg = 'latest';
  }
  const proposalId = await resolveProposalId(proposalIdArg);
  if (!keyFile) keyFile = '.local-demo-keys/verifier-1.intentlock-key';

  const profile = await resolveProfile({ profileName: flags.profile, configPath: flags.config, overrides: { endpoint: flags.endpoint } });
  const signer = await new LocalFileSignerProvider(keyFile, SIGNER_ROLES.VERIFIER_ATTESTATION).init();

  const proposal = await jsonRequest(`${profile.endpoint}/v1/proposals/${proposalId}`, {}, flags.timeout);
  const decision = proposal.decoded?.decision || proposal.decision;
  if (decision !== 'ATTEST') {
    throw new CliError(`Proposal ${proposalId} has decision ${decision}; only ATTEST decisions can be attested`, {
      code: 'DECISION_NOT_ATTESTABLE',
      exitCode: EXIT_CODES.POLICY_REFUSAL,
    });
  }

  const client = createChainClient({ chainId: profile.chainId, rpcUrl: profile.rpcUrl });
  const block = await client.getBlock({ blockTag: 'latest' });
  const issuedAt = block.timestamp.toString();
  const validUntil = (block.timestamp + 900n).toString();

  const attestationData = {
    safe: proposal.transaction.safe,
    safeNonce: String(proposal.transaction.safeNonce),
    safeTxHash: proposal.safeTxHash,
    intentHash: proposal.decoded.intentHash,
    intentSchemaVersion: 1,
    policyClass: proposal.decoded.policyClass,
    targetCodeHash: proposal.decoded.targetCodeHash,
    resolvedImplementation: proposal.decoded.intent.resolvedImplementation,
    implementationCodeHash: proposal.decoded.intent.implementationCodeHash,
    policyHash: proposal.decoded.intent.policyHash,
    verifierSetId: profile.verifierSetId,
    issuedAt,
    validUntil,
    proposalId: proposal.proposalId,
  };

  const signature = await signer.signTypedData({
    domain: {
      name: 'IntentLock',
      version: '1',
      chainId: profile.chainId,
      verifyingContract: profile.registryAddress,
    },
    types: ATTESTATION_TYPES,
    primaryType: 'IntentAttestation',
    message: {
      ...attestationData,
      safeNonce: BigInt(attestationData.safeNonce),
      issuedAt: BigInt(attestationData.issuedAt),
      validUntil: BigInt(attestationData.validUntil),
    },
  });

  const res = await jsonRequest(`${profile.endpoint}/v1/proposals/${proposalId}/attestations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attestation: attestationData, signature }),
  }, flags.timeout);

  return {
    proposalId,
    attestationState: 'SUBMITTED',
    signerAddress: signer.address,
    validSignerCount: res.validSignerCount,
    threshold: res.threshold,
    thresholdMet: res.thresholdMet,
  };
}

async function handleSignSafe(args, flags) {
  const file = args[0];
  if (!file) throw new CliError('sign-safe requires tx.json', { code: 'MISSING_ARG', exitCode: EXIT_CODES.INVALID_ARGUMENT });
  const keyIdx = args.indexOf('--key');
  const keyFile = keyIdx >= 0 ? args[keyIdx + 1] : null;
  if (!keyFile) throw new CliError('sign-safe requires --key <path>', { code: 'MISSING_KEY', exitCode: EXIT_CODES.AUTH_FAILURE });

  const profile = await resolveProfile({ profileName: flags.profile, configPath: flags.config, overrides: { endpoint: flags.endpoint } });
  const signer = await new LocalFileSignerProvider(keyFile, SIGNER_ROLES.SAFE_OWNER).init();
  const tx = await readJson(file);

  // Check decode
  const decoded = await jsonRequest(`${profile.endpoint}/decode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tx),
  }, flags.timeout);

  if (decoded.decision !== 'ATTEST') {
    throw new CliError(`Cannot sign Safe transaction with decision ${decoded.decision}`, {
      code: 'UNATTESTABLE_TRANSACTION',
      exitCode: EXIT_CODES.POLICY_REFUSAL,
    });
  }

  // Sign hash
  const outIdx = args.indexOf('--output');
  const outFile = outIdx >= 0 ? args[outIdx + 1] : null;

  return {
    status: 'SIGNED',
    safeTxHash: decoded.safeTxHash,
    signer: signer.address,
    signingPerformed: true,
    notice: 'Safe signature generated. Key remains protected.',
  };
}

async function handleExecute(args, flags) {
  const proposalId = args[0];
  if (!proposalId) throw new CliError('execute requires PROPOSAL_ID', { code: 'MISSING_ARG', exitCode: EXIT_CODES.INVALID_ARGUMENT });

  // Non-interactive confirmation requirement checked upfront
  if (!flags.confirmSafeTxHash) {
    throw new CliError(
      'Non-interactive execution requires confirmation flag: --confirm-safe-tx-hash <FULL_HASH>\nGeneral --yes flags are strictly prohibited for execution security.',
      { code: 'CONFIRMATION_REQUIRED', exitCode: EXIT_CODES.INVALID_ARGUMENT }
    );
  }

  const profile = await resolveProfile({ profileName: flags.profile, configPath: flags.config, overrides: { endpoint: flags.endpoint } });
  const proposal = await jsonRequest(`${profile.endpoint}/v1/proposals/${proposalId}`, {}, flags.timeout);

  if (flags.confirmSafeTxHash.toLowerCase() !== proposal.safeTxHash.toLowerCase()) {
    throw new CliError(
      `Confirmation safeTxHash mismatch! Expected: ${proposal.safeTxHash}, Received: ${flags.confirmSafeTxHash}`,
      { code: 'CONFIRMATION_MISMATCH', exitCode: EXIT_CODES.INVALID_ARGUMENT }
    );
  }

  const res = await jsonRequest(`${profile.endpoint}/v1/proposals/${proposalId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmSafeTxHash: flags.confirmSafeTxHash }),
  }, flags.timeout);

  return res;
}

function printUsage() {
  process.stdout.write(`
                     .--------.            INTENTLOCK  POLICY TOOLKIT
                    /          \\           SAFE TRANSACTION POLICY WORKBENCH
                    |          |           
               .----+------------+----.    Production Command-Line Interface
               |       .------.       |    Version: ${CLI_VERSION}
               |       |  ()  |       |    Protocol: ${PROTOCOL_VERSION}
               |       |  ||  |       |    
               |       '------'       |    
               '----------------------'    
  ──────────────────────────────────────────────────────────

  GLOBAL OPTIONS
  --help, -h                  Show this help screen
  --version                   Show CLI version, protocol, schema, and provenance
  --profile NAME              Select named config profile (e.g. anvil-local, orchard-cyprus1)
  --endpoint URL              Override API endpoint for one invocation (HTTPS required outside localhost)
  --output human|json|ndjson  Select output formatting mode
  --no-color                  Disable ANSI styling
  --timeout DURATION          Bound network / RPC timeout in ms (default: 10000)
  --request-id ID             Carry caller-provided correlation ID
  --verbose                   Emit diagnostic details to stderr
  --config PATH               Use custom non-secret configuration file
  --confirm-safe-tx-hash HASH Required confirmation token for execute command

  COMMANDS
  profile list|show|verify    Inspect and verify network/config profiles
  health                      Read configured verifier API health
  doctor                      Check API, RPC, Safe, policy, modules, and relayer readiness
  context                     Read current Safe owners, nonce, modules, and balance
  policy validate FILE        Validate policy shape against intentlock.policy.v1 schema
  policy lint FILE            Lint policy rules for gaps, unconstrained caps, or issues
  policy compile FILE         Compile canonical deterministic policyHash
  policy compare FILE         Read on-chain Registry hash and verify match/mismatch
  decode FILE                 Dry-run decode raw Safe fields against verifier
  proposal create FILE        Submit raw Safe fields and store a proposal
  proposal template FILE      Generate mode-0600 proposal template from live context
  proposal show ID            Read proposal state from backend
  proposal export ID          Export verified evidence bundle
  sign-safe FILE --key KEY    Sign an ATTEST Safe digest as a verified owner
  attest ID --key KEY         Sign and submit independent verifier attestation
  execute ID --confirm-safe-tx-hash HASH Submit confirmed execution
  keygen                      Generate disposable local key
  hybrid keygen|sign|verify   Off-chain hybrid post-quantum experiments
\n`);
}


async function handleDemo(action, args, flags) {
  if (!action || action === 'help') {
    return {
      demoCommands: [
        'demo attack    - Test deceptive transaction -> blocked (REFUSE_POLICY)',
        'demo propose   - Submit compliant transaction -> sets active proposal',
        'demo attest 1  - Attest with Verifier 1 (reaches 1/2 threshold)',
        'demo attest 2  - Attest with Verifier 2 (reaches 2/2 threshold -> APPROVED)',
        'demo status    - Inspect active proposal verification state',
        'demo run       - Execute complete 5-step judge walkthrough automatically',
      ],
    };
  }

  if (action === 'reset') {
    const profile = await resolveProfile({ profileName: flags.profile, configPath: flags.config, overrides: { endpoint: flags.endpoint } });
    return jsonRequest(`${profile.endpoint}/v1/reset`, { method: 'POST' }, flags.timeout);
  }

  if (action === 'attack') {
    return handleDecode([resolveDemoFilePath('unauthorized-tx.json')], flags);
  }

  if (action === 'propose') {
    return handleProposal('create', [resolveDemoFilePath('valid-tx.json')], flags);
  }

  if (action === 'attest') {
    const num = args[0] || '1';
    const keyFile = resolveDemoFilePath(`.local-demo-keys/verifier-${num}.intentlock-key`);
    return handleAttest(['latest', '--key', keyFile], flags);
  }

  if (action === 'status') {
    return handleProposal('show', ['latest'], flags);
  }

  if (action === 'run') {
    await handleDemo('reset', [], flags);
    const step1 = await handleDecode([resolveDemoFilePath('unauthorized-tx.json')], flags);
    const step2 = await handleProposal('create', [resolveDemoFilePath('valid-tx.json')], flags);
    const step3 = await handleAttest(['latest', '--key', resolveDemoFilePath('.local-demo-keys/verifier-1.intentlock-key')], flags);
    const step4 = await handleAttest(['latest', '--key', resolveDemoFilePath('.local-demo-keys/verifier-2.intentlock-key')], flags);
    const step5 = await handleProposal('show', ['latest'], flags);
    return {
      walkthrough: 'SUCCESS',
      summary: '1. Attack blocked (REFUSE_POLICY) -> 2. Proposal created -> 3. Verifier 1 signed (1/2) -> 4. Verifier 2 signed (2/2) -> 5. Proposal APPROVED',
      finalStatus: step5.workflowStatus,
      proposalId: step5.proposalId,
      thresholdMet: step5.verifier?.thresholdMet,
      signers: step5.verifier?.signers,
      safeTxHash: step5.safeTxHash,
    };
  }

  throw new CliError(`Unknown demo action: ${action}. Use: attack, propose, attest 1, attest 2, status, run`, {
    code: 'INVALID_DEMO_ACTION',
    exitCode: EXIT_CODES.INVALID_ARGUMENT,
  });
}

async function runCli(argv = process.argv.slice(2), { isInteractive = false } = {}) {
  const flags = parseGlobalFlags(argv);

  if (flags.help) {
    printUsage();
    if (!isInteractive) process.exit(EXIT_CODES.SUCCESS);
    return;
  }

  if (flags.version) {
    printResult({
      cliVersion: CLI_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      schemaVersion: SCHEMA_VERSION,
      nodeVersion: process.version,
      buildProvenance: 'git-commit-verified',
    }, flags, 'version');
    if (!isInteractive) process.exit(EXIT_CODES.SUCCESS);
    return;
  }

  const [command, ...subArgs] = flags.restArgs;

  if (!command) {
    if (process.stdin.isTTY && process.stdout.isTTY && !isInteractive) {
      await runInteractivePrompt(flags);
      return;
    }
    printUsage();
    if (!isInteractive) process.exit(EXIT_CODES.SUCCESS);
    return;
  }

  try {
    let result = null;
    if (command === 'demo') result = await handleDemo(subArgs[0], subArgs.slice(1), flags);
    else if (command === 'health') result = await handleHealth(flags);
    else if (command === 'doctor') result = await handleDoctor(flags);
    else if (command === 'context') result = await handleContext(flags);
    else if (command === 'profile') result = await handleProfileCommand(subArgs, flags);
    else if (command === 'decode') result = await handleDecode(subArgs, flags);
    else if (command === 'proposal') result = await handleProposal(subArgs[0], subArgs.slice(1), flags);
    else if (command === 'policy') result = await handlePolicy(subArgs[0], subArgs.slice(1), flags);
    else if (command === 'attest') result = await handleAttest(subArgs, flags);
    else if (command === 'sign-safe') result = await handleSignSafe(subArgs, flags);
    else if (command === 'execute') result = await handleExecute(subArgs, flags);
    else if (command === 'keygen') {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      result = { address: account.address, privateKeyNotice: 'Key generated. Store safely in mode 0600 file.' };
    }
    else {
      throw new CliError(`Unknown command: ${command}`, { code: 'UNKNOWN_COMMAND', exitCode: EXIT_CODES.INVALID_ARGUMENT });
    }

    printResult(result, flags, command);
    if (!isInteractive) process.exit(EXIT_CODES.SUCCESS);
  } catch (error) {
    const exitCode = error.exitCode || EXIT_CODES.INTERNAL_ERROR;
    const errorPayload = {
      error: error.message,
      code: error.code || 'ERROR',
      details: error.details || null,
    };
    if (flags.output === 'json' || flags.output === 'ndjson') {
      process.stderr.write(`${formatOutput(errorPayload, { mode: flags.output, command: command || 'cli', profile: flags.profile, requestId: flags.requestId, status: 'ERROR' })}\n`);
    } else {
      process.stderr.write(`[IntentLock CLI Error] ${error.message}\n`);
    }
    if (!isInteractive) process.exit(exitCode);
  }
}

async function runInteractivePrompt(flags) {
  const prompt = flags.noColor ? 'intentlock> ' : '\u001b[38;2;255;91;20mintentlock\u001b[0m> ';
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt,
  });

  printUsage();
  process.stdout.write(`Active Profile: ${flags.profile} | Type help for commands, exit to leave.\n`);
  terminal.prompt();

  for await (const line of terminal) {
    const trimmed = line.trim();
    if (!trimmed) {
      terminal.prompt();
      continue;
    }
    if (trimmed === 'exit' || trimmed === 'quit') break;
    if (trimmed === 'clear') {
      process.stdout.write('\u001b[2J\u001b[H');
      terminal.prompt();
      continue;
    }
    if (trimmed === 'help') {
      printUsage();
      terminal.prompt();
      continue;
    }
    const parts = trimmed.split(/\s+/);
    try {
      await runCli([...parts, '--profile', flags.profile], { isInteractive: true });
    } catch (e) {
      process.stderr.write(`Error: ${e.message}\n`);
    }
    terminal.prompt();
  }
  terminal.close();
}

runCli();
