import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Load existing run.json
const rootRunPath = resolve(process.cwd(), '../run.json');
const rootRun = JSON.parse(readFileSync(rootRunPath, 'utf-8'));

// Load verified Bybit data
const bybitVerifiedPath = resolve(
  process.cwd(),
  '../docs/evidence/bybit-verified.json',
);
const bybit = JSON.parse(readFileSync(bybitVerifiedPath, 'utf-8'));
const bybitCaseFacts = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../docs/evidence/bybit-case-facts.json'),
    'utf-8',
  ),
);

// No raw RPC request/response transcript was persisted with this replay. Do not
// synthesize response hashes from selected values and label them as RPC output.
const rpcLogs = [];

// Construct SCENES.md-compliant event streams
function makeEvents(runKey, scenarioId, fixtureId, opts) {
  const t0 = '2025-02-21T09:46:43.000Z';
  const safeAddr = opts.safeAddress || bybit.safeAddress;

  if (runKey === 'runA') {
    return [
      {
        schemaVersion: 1,
        eventId: `${scenarioId}-e1`,
        scenarioId,
        fixtureId,
        demoScene: 'bybit_real_safe',
        sequence: 1,
        type: 'proposal.created',
        occurredAt: t0,
        source: 'replay_metadata',
        safe: safeAddr,
        proposalId: 'bybit-exploit-tx',
        safeTxHash: null,
        transactionHash: null,
        causeEventId: null,
        payload: {
          rawTransaction: {
            to: bybit.decodedPayload.to,
            value: bybit.decodedPayload.value,
            operation: 1,
            data: bybit.decodedPayload.data,
            selector: '0xa9059cbb',
          },
          declaredMetadata: {
            label: 'Transfer 0.1 ETH to cold wallet [reported to signers]',
            tag: 'UNTRUSTED',
          },
        },
      },
      {
        schemaVersion: 1,
        eventId: `${scenarioId}-e2`,
        scenarioId,
        fixtureId,
        demoScene: 'bybit_real_safe',
        sequence: 2,
        type: 'decode.started',
        occurredAt: t0,
        source: 'replay_metadata',
        safe: safeAddr,
        proposalId: 'bybit-exploit-tx',
        safeTxHash: null,
        transactionHash: null,
        causeEventId: `${scenarioId}-e1`,
        payload: { decoderVersion: 'bybit-replay-v1' },
      },
      {
        schemaVersion: 1,
        eventId: `${scenarioId}-e3`,
        scenarioId,
        fixtureId,
        demoScene: 'bybit_real_safe',
        sequence: 3,
        type: 'decode.completed',
        occurredAt: t0,
        source: 'replay_metadata',
        safe: safeAddr,
        proposalId: 'bybit-exploit-tx',
        safeTxHash: null,
        transactionHash: null,
        causeEventId: `${scenarioId}-e2`,
        payload: {
          decodeStatus: 'NOT_CAPTURED',
          decoderResult: 'No saved decoder execution output is available.',
        },
      },
      {
        schemaVersion: 1,
        eventId: `${scenarioId}-e4`,
        scenarioId,
        fixtureId,
        demoScene: 'bybit_real_safe',
        sequence: 4,
        type: 'safe.execution_submitted',
        occurredAt: t0,
        source: 'replay_metadata',
        safe: safeAddr,
        proposalId: 'bybit-exploit-tx',
        safeTxHash: null,
        transactionHash: null,
        causeEventId: `${scenarioId}-e3`,
        payload: {
          ownerSignatureCount: bybitCaseFacts.approvingSignerCount,
          ownerSignatureSource: bybitCaseFacts.signerCountSource.name,
          ownerSignatureSourceUrl: bybitCaseFacts.signerCountSource.url,
          operation: 1,
          guardInstalled: false,
        },
      },
      {
        schemaVersion: 1,
        eventId: `${scenarioId}-e5`,
        scenarioId,
        fixtureId,
        demoScene: 'bybit_real_safe',
        sequence: 5,
        type: 'safe.execution_succeeded',
        occurredAt: t0,
        source: 'recorded_chain_observation',
        safe: safeAddr,
        proposalId: 'bybit-exploit-tx',
        safeTxHash: null,
        transactionHash: bybit.txHash,
        causeEventId: `${scenarioId}-e4`,
        payload: {
          blockNumber: bybit.txBlock.number,
          receiptStatus: 'SUCCESS',
          gasUsed: 119392,
          slot0Before: bybit.safeStateAtFork.slot0,
          slot0After:
            '0x000000000000000000000000bdd077f651ebe7f7b3ce16fe5f2b025be2969516',
          masterCopyReplaced: true,
        },
      },
    ];
  }

  if (runKey === 'runB') {
    return [
      {
        schemaVersion: 1,
        eventId: `${scenarioId}-e1`,
        scenarioId,
        fixtureId,
        demoScene: 'bybit_oursafe_unguarded',
        sequence: 1,
        type: 'proposal.created',
        occurredAt: t0,
        source: 'foundry_fork_test',
        safe: safeAddr,
        proposalId: 'oursafe-unguarded',
        safeTxHash: null,
        transactionHash: null,
        causeEventId: null,
        payload: {
          rawTransaction: {
            to: bybit.decodedPayload.to,
            value: '0',
            operation: 1,
            data: bybit.decodedPayload.data,
            selector: '0xa9059cbb',
          },
          declaredMetadata: {
            label: 'Attacker DELEGATECALL payload',
            tag: 'UNTRUSTED',
          },
        },
      },
      {
        schemaVersion: 1,
        eventId: `${scenarioId}-e2`,
        scenarioId,
        fixtureId,
        demoScene: 'bybit_oursafe_unguarded',
        sequence: 2,
        type: 'safe.execution_submitted',
        occurredAt: t0,
        source: 'foundry_fork_test',
        safe: safeAddr,
        proposalId: 'oursafe-unguarded',
        safeTxHash: null,
        transactionHash: null,
        causeEventId: `${scenarioId}-e1`,
        payload: { ownerSignatureCount: 1, guardInstalled: false },
      },
      {
        schemaVersion: 1,
        eventId: `${scenarioId}-e3`,
        scenarioId,
        fixtureId,
        demoScene: 'bybit_oursafe_unguarded',
        sequence: 3,
        type: 'safe.execution_succeeded',
        occurredAt: t0,
        source: 'foundry_fork_test',
        safe: safeAddr,
        proposalId: 'oursafe-unguarded',
        safeTxHash: null,
        transactionHash: null,
        causeEventId: `${scenarioId}-e2`,
        payload: {
          receiptStatus: 'SUCCESS',
          gasUsed: null,
          slot0Before:
            '0x0000000000000000000000005615deb798bb3e4dfa0139dfa1b3d433cc23b72f',
          slot0After:
            '0x000000000000000000000000bdd077f651ebe7f7b3ce16fe5f2b025be2969516',
          masterCopyReplaced: true,
        },
      },
    ];
  }

  if (runKey === 'runC') {
    return [
      {
        schemaVersion: 1,
        eventId: `${scenarioId}-e1`,
        scenarioId,
        fixtureId,
        demoScene: 'bybit_oursafe_guarded',
        sequence: 1,
        type: 'proposal.created',
        occurredAt: t0,
        source: 'foundry_fork_test',
        safe: safeAddr,
        proposalId: 'oursafe-guarded',
        safeTxHash: null,
        transactionHash: null,
        causeEventId: null,
        payload: {
          rawTransaction: {
            to: bybit.decodedPayload.to,
            value: '0',
            operation: 1,
            data: bybit.decodedPayload.data,
            selector: '0xa9059cbb',
          },
          declaredMetadata: {
            label: 'Attacker DELEGATECALL payload',
            tag: 'UNTRUSTED',
          },
        },
      },
      {
        schemaVersion: 1,
        eventId: `${scenarioId}-e2`,
        scenarioId,
        fixtureId,
        demoScene: 'bybit_oursafe_guarded',
        sequence: 2,
        type: 'policy.evaluated',
        occurredAt: t0,
        source: 'foundry_fork_test',
        safe: safeAddr,
        proposalId: 'oursafe-guarded',
        safeTxHash: null,
        transactionHash: null,
        causeEventId: `${scenarioId}-e1`,
        payload: {
          decision: 'REFUSE_POLICY',
          policyClass: 8,
          reasonCode: 'UNCONDITIONAL_DELEGATECALL_PROHIBITED',
          policyHash:
            '0x0000000000000000000000000000000000000000000000000000000000000000',
        },
      },
      {
        schemaVersion: 1,
        eventId: `${scenarioId}-e3`,
        scenarioId,
        fixtureId,
        demoScene: 'bybit_oursafe_guarded',
        sequence: 3,
        type: 'safe.execution_submitted',
        occurredAt: t0,
        source: 'foundry_fork_test',
        safe: safeAddr,
        proposalId: 'oursafe-guarded',
        safeTxHash: null,
        transactionHash: null,
        causeEventId: `${scenarioId}-e2`,
        payload: { ownerSignatureCount: 1, guardInstalled: true },
      },
      {
        schemaVersion: 1,
        eventId: `${scenarioId}-e4`,
        scenarioId,
        fixtureId,
        demoScene: 'bybit_oursafe_guarded',
        sequence: 4,
        type: 'guard.reverted',
        occurredAt: t0,
        source: 'foundry_fork_test',
        safe: safeAddr,
        proposalId: 'oursafe-guarded',
        safeTxHash: null,
        transactionHash: null,
        causeEventId: `${scenarioId}-e3`,
        payload: {
          observedRevertName: 'UnsupportedOperation',
          revertSelector: '0x9ba6061b',
          revertData: '0x9ba6061b',
          gasUsed: null,
          slot0Preserved: true,
          slot0:
            '0x0000000000000000000000005615deb798bb3e4dfa0139dfa1b3d433cc23b72f',
        },
      },
    ];
  }

  // R04 / A20 shape
  return [
    {
      schemaVersion: 1,
      eventId: `${scenarioId}-e1`,
      scenarioId,
      fixtureId,
      demoScene: 'bybit_no_attestation',
      sequence: 1,
      type: 'proposal.created',
      occurredAt: t0,
      source: 'foundry_fork_test',
      safe: safeAddr,
      proposalId: 'call-no-attestation',
      safeTxHash: null,
      transactionHash: null,
      causeEventId: null,
      payload: {
        rawTransaction: {
          to: '0x0000000000000000000000000000000000009999',
          value: '1000000000000000000',
          operation: 0,
          data: '0x',
        },
        declaredMetadata: {
          label: 'Plain CALL with no attestation',
          tag: 'UNTRUSTED',
        },
      },
    },
    {
      schemaVersion: 1,
      eventId: `${scenarioId}-e2`,
      scenarioId,
      fixtureId,
      demoScene: 'bybit_no_attestation',
      sequence: 2,
      type: 'safe.execution_submitted',
      occurredAt: t0,
      source: 'foundry_fork_test',
      safe: safeAddr,
      proposalId: 'call-no-attestation',
      safeTxHash: null,
      transactionHash: null,
      causeEventId: `${scenarioId}-e1`,
      payload: { ownerSignatureCount: 1, guardInstalled: true },
    },
    {
      schemaVersion: 1,
      eventId: `${scenarioId}-e3`,
      scenarioId,
      fixtureId,
      demoScene: 'bybit_no_attestation',
      sequence: 3,
      type: 'guard.reverted',
      occurredAt: t0,
      source: 'foundry_fork_test',
      safe: safeAddr,
      proposalId: 'call-no-attestation',
      safeTxHash: null,
      transactionHash: null,
      causeEventId: `${scenarioId}-e2`,
      payload: {
        observedRevertName: 'NoAttestation',
        revertSelector: '0x4c3218ea',
        revertData: '0x4c3218ea',
        gasUsed: null,
      },
    },
  ];
}

const replaySection = {
  source: 'rpc_observation',
  disclaimer: 'REPLAY ON A LOCAL FORK. NOTHING BROADCAST TO MAINNET.',
  txHash: bybit.txHash,
  etherscanUrl: `https://etherscan.io/tx/${bybit.txHash}`,
  txBlockNumber: bybit.txBlock.number,
  forkBlock: {
    number: bybit.forkBlock.number,
    hash: bybit.forkBlock.hash,
    timestamp: bybit.forkBlock.timestamp,
  },
  safe: {
    address: bybit.safeAddress,
    version: bybit.safeStateAtFork.version,
    slot0Before: bybit.safeStateAtFork.slot0,
    slot0AfterExploit:
      '0x000000000000000000000000bdd077f651ebe7f7b3ce16fe5f2b025be2969516',
    slot0DiffDescription:
      'Hijacked from legitimate Safe masterCopy to attacker malicious implementation',
  },
  attacker: {
    contract: bybit.contracts.attackerContract.address,
    codeLength: bybit.contracts.attackerContract.codeLength,
    maliciousImplementation: bybit.contracts.maliciousImplementation.address,
    maliciousCodeLength: bybit.contracts.maliciousImplementation.codeLength,
  },
  payload: {
    selector: bybit.decodedPayload.selector,
    innerSelector: bybit.decodedPayload.innerSelector,
    operation: bybit.decodedPayload.operation,
    operationName: bybit.decodedPayload.operationName,
    to: bybit.decodedPayload.to,
    value: bybit.decodedPayload.value,
    data: bybit.decodedPayload.data,
    reportedSignerLabel: 'Transfer 0.1 ETH to cold wallet',
    reportedSignerTag: 'UNTRUSTED',
    rawInput: bybit.decodedPayload.rawInput,
  },
  caseFacts: {
    safeTransactionCount: bybitCaseFacts.safeTransactionCount,
    approvingSignerCount: bybitCaseFacts.approvingSignerCount,
    signerCountSource: bybitCaseFacts.signerCountSource,
    scopeNote: bybitCaseFacts.scopeNote,
  },
  deterministicDecoder: bybit.deterministicDecoder,
  reproduceScript:
    'export $(cat .env.local | xargs) && forge test --match-contract BybitReplaySliceTest -vvv',
  rpcMethodLog: rpcLogs,
  operation1Sampling: {
    totalSampled: 8,
    operation0Calls: 6,
    operation1Delegatecalls: 2,
    operation1SharePercentage: 25.0,
    note: 'Read-only mainnet sampling around block 21895237. D-009 policy unchanged.',
  },
  runs: {
    runA: {
      fixtureId: 'R01',
      scenarioId: 'replay-R01-bybit-real-safe-unguarded',
      name: 'Run A · Real Bybit Safe (unguarded)',
      targetSafe: bybit.safeAddress,
      safeVersion: bybit.safeStateAtFork.version,
      guardInstalled: false,
      slot0Before: bybit.safeStateAtFork.slot0,
      slot0After:
        '0x000000000000000000000000bdd077f651ebe7f7b3ce16fe5f2b025be2969516',
      outcome: 'DRAINED',
      gasUsed: 119392,
      events: makeEvents(
        'runA',
        'replay-R01-bybit-real-safe-unguarded',
        'R01',
        { safeAddress: bybit.safeAddress },
      ),
    },
    runB: {
      fixtureId: 'R02',
      scenarioId: 'replay-R02-oursafe-unguarded',
      name: 'Run B · Our Safe 1.4.1 (unguarded)',
      targetSafe: '0x2e234DAe75C793f67A35089C9d99245E1C58470b',
      safeVersion: '1.4.1',
      guardInstalled: false,
      slot0Before:
        '0x0000000000000000000000005615deb798bb3e4dfa0139dfa1b3d433cc23b72f',
      slot0After:
        '0x000000000000000000000000bdd077f651ebe7f7b3ce16fe5f2b025be2969516',
      outcome: 'DRAINED',
      gasUsed: null,
      events: makeEvents('runB', 'replay-R02-oursafe-unguarded', 'R02', {
        safeAddress: '0x2e234DAe75C793f67A35089C9d99245E1C58470b',
      }),
    },
    runC: {
      fixtureId: 'R03',
      scenarioId: 'replay-R03-oursafe-guarded',
      name: 'Run C · Our Safe + IntentLock',
      targetSafe: '0x2e234DAe75C793f67A35089C9d99245E1C58470b',
      safeVersion: '1.4.1',
      guardInstalled: true,
      slot0Before:
        '0x0000000000000000000000005615deb798bb3e4dfa0139dfa1b3d433cc23b72f',
      slot0After:
        '0x0000000000000000000000005615deb798bb3e4dfa0139dfa1b3d433cc23b72f',
      outcome: 'REVERTED',
      observedRevertName: 'UnsupportedOperation',
      revertSelector: '0x9ba6061b',
      gasUsed: null,
      events: makeEvents('runC', 'replay-R03-oursafe-guarded', 'R03', {
        safeAddress: '0x2e234DAe75C793f67A35089C9d99245E1C58470b',
      }),
    },
    runRA20: {
      fixtureId: 'R04',
      scenarioId: 'replay-R04-noattestation',
      name: 'Run R-A20 · Call without attestation',
      targetSafe: '0x2e234DAe75C793f67A35089C9d99245E1C58470b',
      safeVersion: '1.4.1',
      guardInstalled: true,
      outcome: 'REVERTED',
      observedRevertName: 'NoAttestation',
      revertSelector: '0x4c3218ea',
      gasUsed: null,
      events: makeEvents('runRA20', 'replay-R04-noattestation', 'R04', {
        safeAddress: '0x2e234DAe75C793f67A35089C9d99245E1C58470b',
      }),
    },
  },
};

// Add replay section to run.json
rootRun.replay = replaySection;

// Add measuredGas entries for R fixtures
rootRun.measuredGas = rootRun.measuredGas || {};
rootRun.measuredGas.R01_BybitRealSafeReplay = {
  fixtureId: 'R01',
  test: 'test_R01_BybitRealSafeReplay',
  gas: 119392,
  status: 'PASS',
  suite: 'R (mainnet fork)',
};
delete rootRun.measuredGas.R02_OurSafeUnguardedReplay;
delete rootRun.measuredGas.R03_OurSafeWithGuardBlocks;
delete rootRun.measuredGas.R04_NoAttestationOnFork;

// Write to all target destinations
const targets = [
  rootRunPath,
  resolve(process.cwd(), '../frontend/public/run.json'),
  resolve(process.cwd(), '../frontend/public/evidence/run.json'),
  resolve(process.cwd(), '../public/evidence/run.json'),
  resolve(process.cwd(), '../docs/evidence/replay-manifest.json'),
];

for (const t of targets) {
  mkdirSync(resolve(t, '..'), { recursive: true });
  writeFileSync(t, JSON.stringify(rootRun, null, 2));
  console.log(`Saved replay run.json to: ${t}`);
}
