import type {
  NodeId,
  Status,
  RevertName,
  PayloadFields,
  SceneEvent,
  GuardCheck,
  StateDiffRow,
  BlockOutcome,
} from '../workbench/scenes'
import type { ReplayData, ReplayRunKey, ReplayRunData } from './types'

export interface ReplaySceneConfig {
  runKey: ReplayRunKey
  runData: ReplayRunData
  replay: ReplayData
  payload: PayloadFields
  events: SceneEvent[]
  badges: readonly string[]
  slot0Before: string
  slot0After: string
  blockNumber: number
  txHash: string
  gateLaser: boolean
  gateRevert?: { name: RevertName; selector: string; args: string[] }
}

const CHECK_NAMES = [
  'Operation is a plain CALL',
  'Digest equals the proposal digest',
  '2 of 3 attestations on that digest',
  'Digest not used before',
] as const

export function adaptReplayToScene(replay: ReplayData | null, runKey: ReplayRunKey = 'runC'): ReplaySceneConfig {
  if (!replay || !replay.runs) {
    // Missing replay section fallback -> renders 'not captured' / 'MOCK DATA'
    const fallbackPayload: PayloadFields = {
      operation: 'DELEGATECALL',
      to: 'not captured',
      value: 'not captured',
      data: 'not captured',
      decodedIntent: 'not captured',
      raw: {
        toFull: 'not captured',
        valueWeiHex: '0x0',
        dataHex: '0x',
        nonce: 0,
      },
    }
    return {
      runKey,
      runData: {
        fixtureId: 'not captured',
        scenarioId: 'not captured',
        name: 'not captured',
        targetSafe: 'not captured',
        safeVersion: 'not captured',
        guardInstalled: false,
        slot0Before: 'not captured',
        slot0After: 'not captured',
        outcome: 'DRAINED',
        gasUsed: 0,
        events: [],
      },
      replay: {} as ReplayData,
      payload: fallbackPayload,
      events: [],
      badges: ['SYNTHETIC SCENE', 'MOCK DATA · NO TRANSACTIONS SENT'],
      slot0Before: 'not captured',
      slot0After: 'not captured',
      blockNumber: 0,
      txHash: 'not captured',
      gateLaser: false,
    }
  }

  const runData = replay.runs[runKey] || replay.runs.runC
  const isGuarded = runData.guardInstalled
  const isOp1 = replay.payload.operation === 1

  const payload: PayloadFields = {
    operation: isOp1 ? 'DELEGATECALL' : 'CALL',
    to: replay.payload.to,
    value: replay.payload.value === '0' ? '0 ETH' : `${replay.payload.value} wei`,
    data: `${replay.payload.innerSelector || replay.payload.selector}… ${replay.payload.operationName}`,
    decodedIntent: isGuarded
      ? 'Same payload shape blocked on a guard-capable Safe.'
      : 'Raw Bybit delegatecall payload: hijacks Safe implementation.',
    raw: {
      toFull: replay.payload.to,
      valueWeiHex: '0x0',
      dataHex: replay.payload.data,
      nonce: runKey === 'runA' ? 71 : 0,
    },
  }

  // Derive scene events from runData.events
  const events: SceneEvent[] = []
  const outcome: BlockOutcome = runData.outcome === 'REVERTED' ? 'reverted' : 'drained'
  const isBlocked = runData.outcome === 'REVERTED'

  const stateDiff: StateDiffRow[] = [
    { field: 'Safe Address', before: runData.targetSafe, after: runData.targetSafe },
    { field: 'Safe Version', before: runData.safeVersion, after: runData.safeVersion },
    { field: 'Storage slot 0 (masterCopy)', before: runData.slot0Before, after: runData.slot0After },
    { field: 'Guard', before: isGuarded ? 'IntentLockGuard' : 'none', after: isGuarded ? 'IntentLockGuard' : 'none' },
    { field: 'Operation', before: isOp1 ? 'DELEGATECALL (1)' : 'CALL (0)', after: isOp1 ? 'DELEGATECALL (1)' : 'CALL (0)' },
  ]

  // Event sequence matching timeline
  events.push({
    t: 0,
    node: 'proposal',
    status: 'idle',
    label: 'Payload reportedly shown to signers arrives.',
    stage: 'home',
    vault: { balance: 10, core: 'good' },
  })

  events.push({
    t: 500,
    node: 'payload',
    status: 'active',
    label: 'Cube contains real selector 0xa9059cbb and operation=1.',
    stage: 'home',
  })

  if (isGuarded) {
    events.push({
      t: 1000,
      node: 'verifierA',
      status: 'bad',
      label: 'Policy engine evaluates: REFUSE_POLICY (DELEGATECALL).',
    })
    events.push({
      t: 1200,
      node: 'registry',
      status: 'bad',
      label: 'Zero verifier signatures: quorum threshold not met.',
    })
    events.push({
      t: 1600,
      node: 'gate',
      status: 'bad',
      label: 'IntentLock guard slams: UnsupportedOperation before lookup.',
      stage: 'bounce',
      revert: {
        name: 'UnsupportedOperation',
        selector: runData.revertSelector || '0x9ba6061b',
        args: ['operation = 1 (DELEGATECALL)'],
      },
      stamp: 'revert',
      txHash: replay.txHash,
      blockNumber: replay.forkBlock.number,
      gasUsed: runData.gasUsed,
      source: 'chain',
      blockOutcome: 'reverted',
      stateDiff,
      guardChecks: [
        { name: 'Operation is a plain CALL', status: 'fail' },
        { name: 'Digest equals the proposal digest', status: 'skipped' },
        { name: '2 of 3 attestations on that digest', status: 'skipped' },
        { name: 'Digest not used before', status: 'skipped' },
      ],
      vault: { balance: 10, core: 'good' },
    })
  } else {
    // Unguarded run
    events.push({
      t: 1200,
      node: 'gate',
      status: 'off',
      label: 'No transaction guard installed: payload waves through.',
      stage: 'gate',
    })
    events.push({
      t: 1700,
      node: 'vault',
      status: 'bad',
      label: 'Vault executed: slot 0 rewired to malicious implementation.',
      stage: 'vault',
      stamp: 'drained',
      txHash: replay.txHash,
      blockNumber: replay.forkBlock.number,
      gasUsed: runData.gasUsed,
      source: 'chain',
      blockOutcome: 'drained',
      stateDiff,
      vault: { balance: 10, core: 'bad' },
    })
  }

  return {
    runKey,
    runData,
    replay,
    payload,
    events,
    badges: ['REPLAY ON A LOCAL FORK. NOTHING BROADCAST TO MAINNET.'],
    slot0Before: runData.slot0Before,
    slot0After: runData.slot0After,
    blockNumber: replay.forkBlock.number,
    txHash: replay.txHash,
    gateLaser: isOp1,
    gateRevert: isBlocked
      ? {
          name: 'UnsupportedOperation',
          selector: runData.revertSelector || '0x9ba6061b',
          args: ['operation = 1 (DELEGATECALL)'],
        }
      : undefined,
  }
}
