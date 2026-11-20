export type ScenarioId = 'normal' | 'attack' | 'legit'
export type VerifierId = 'A' | 'B' | 'C'
export type VerifierStatus = 'waiting' | 'attested' | 'mismatch'
export type Phase = 'idle' | 'proposed' | 'decoded' | 'attesting' | 'timelock' | 'executed' | 'reverted'
export type Risk = 'high' | 'critical'
export type StampKind = 'reverted' | 'verified' | 'drained'
export type FlowStage = 'idle' | 'flowing' | 'blocked' | 'settled'
export type RunStatus = 'idle' | 'running' | 'done'
export type LogLevel = 'info' | 'ok' | 'warn' | 'danger'

export interface LogEntry {
  atMs: number
  level: LogLevel
  text: string
}

export type Patch =
  | { type: 'phase'; phase: Phase }
  | { type: 'signers'; count: number }
  | { type: 'decode'; lines: number }
  | { type: 'risk'; risk: Risk }
  | { type: 'verifier'; id: VerifierId; status: VerifierStatus }
  | { type: 'timelock'; durationMs: number }
  | { type: 'move'; durationMs: number; amount: number }
  | { type: 'stamp'; stamp: StampKind }
  | { type: 'flow'; flow: FlowStage }

export interface ScriptEvent {
  /** Milliseconds from the start of the run. */
  at: number
  patches: Patch[]
  caption?: string
  log?: { level: LogLevel; text: string }
}

export interface DecodedLine {
  tag: string
  text: string
  detail: string
  severity: 'danger' | 'ok'
}

export interface ScenarioScript {
  id: ScenarioId
  tabLabel: string
  runLabel: string
  blurb: string
  durationMs: number
  guardEnabled: boolean
  decoded: DecodedLine[]
  events: ScriptEvent[]
}

/** Everything the UI renders. A future on-chain adapter only has to produce this shape. */
export interface IntentLockState {
  scenario: ScenarioId
  status: RunStatus
  elapsedMs: number
  durationMs: number
  guardEnabled: boolean
  phase: Phase
  signerConfirms: number
  decodedLines: number
  risk: Risk | null
  verifiers: Record<VerifierId, VerifierStatus>
  attested: number
  mismatches: number
  thresholdMet: boolean
  timelock: { active: boolean; remainingMs: number; totalMs: number }
  balance: number
  moved: number
  stamp: StampKind | null
  flow: FlowStage
  caption: string
  log: LogEntry[]
}

export interface IntentLockApi {
  state: IntentLockState
  script: ScenarioScript
  /** Switch scenario and reset to the idle state. */
  select: (id: ScenarioId) => void
  /** Play the scripted sequence, optionally switching scenario first. */
  run: (id?: ScenarioId) => void
  reset: () => void
}
