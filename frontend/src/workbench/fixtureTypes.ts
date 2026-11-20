export type FixtureKind = 'benign' | 'attack' | 'unknown' | 'availability'
export type Outcome = 'EXECUTED' | 'BLOCKED' | 'QUARANTINED' | 'PENDING' | 'TIMELOCKED' | 'FAIL_CLOSED'

/** The shape of one fixture. fixtures.ts must export an array of these. */
export interface Fixture {
  id: string
  critical: boolean
  category: string
  kind: FixtureKind
  title: string
  setup: string
  action: string
  decision: string
  workflowStatus: string
  executionSucceeds: boolean
  outcome: Outcome
  expectedRevertProposed: string | null
  assertions: string[]
}
