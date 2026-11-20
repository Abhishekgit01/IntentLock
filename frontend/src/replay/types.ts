import type { NodeId, Status, RevertName, PayloadFields, SceneEvent } from '../workbench/scenes'

export type ReplayRunKey = 'runA' | 'runB' | 'runC' | 'runRA20'

export interface RPCLogItem {
  method: string
  params: unknown[]
  responseHash: string
  status: string
}

export interface ReplayRunData {
  fixtureId: string
  scenarioId: string
  name: string
  targetSafe: string
  safeVersion: string
  guardInstalled: boolean
  slot0Before: string
  slot0After: string
  outcome: 'DRAINED' | 'REVERTED' | 'EXECUTED'
  observedRevertName?: string
  revertSelector?: string
  gasUsed: number
  events: Array<{
    schemaVersion: number
    eventId: string
    scenarioId: string
    fixtureId: string
    demoScene: string
    sequence: number
    type: string
    occurredAt: string
    source: string
    safe: string | null
    proposalId: string | null
    safeTxHash: string | null
    transactionHash: string | null
    causeEventId: string | null
    payload: Record<string, unknown>
  }>
}

export interface ReplayData {
  source: string
  disclaimer: string
  txHash: string
  etherscanUrl: string
  txBlockNumber: number
  forkBlock: {
    number: number
    hash: string
    timestamp: number
  }
  safe: {
    address: string
    version: string
    slot0Before: string
    slot0AfterExploit: string
    slot0DiffDescription: string
  }
  attacker: {
    contract: string
    codeLength: number
    maliciousImplementation: string
    maliciousCodeLength: number
  }
  payload: {
    selector: string
    innerSelector: string
    operation: number
    operationName: string
    to: string
    value: string
    data: string
    reportedSignerLabel: string
    reportedSignerTag: string
    rawInput: string
  }
  reproduceScript: string
  rpcMethodLog: RPCLogItem[]
  operation1Sampling?: {
    totalSampled: number
    operation0Calls: number
    operation1Delegatecalls: number
    operation1SharePercentage: number
    note: string
  }
  runs: {
    runA: ReplayRunData
    runB: ReplayRunData
    runC: ReplayRunData
    runRA20: ReplayRunData
  }
}
