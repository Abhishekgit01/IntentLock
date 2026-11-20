/**
 * Single source of truth for the workbench.
 * Every caption, node description, timeline event, camera pose and tour step lives here.
 * Components only render what `engine.ts` derives from this file.
 * All values are synthetic. Captions are capped at 15 words (checked by scripts/check-workbench.mjs).
 */

export type NodeId = 'proposal' | 'payload' | 'verifierA' | 'verifierB' | 'verifierC' | 'registry' | 'gate' | 'vault'
export type Status = 'idle' | 'active' | 'ok' | 'bad' | 'warn' | 'off'
export type RevertName = 'DigestMismatch' | 'UnsupportedOperation' | 'ThresholdNotMet' | 'AlreadyConsumed'
export type PayloadStage = 'home' | 'gate' | 'bounce' | 'vault'
export type StampKind = 'revert' | 'ok' | 'drained'
export type Mode = 'unguarded' | 'guarded'
export type ScenarioId = 'delegatecall' | 'forged' | 'legit'
export type BreakId = 'destination' | 'operation' | 'verifierB' | 'replay'
export type CameraKey = NodeId | 'overview' | 'verifiers' | 'vaultSlots'
export type VaultCore = 'good' | 'bad'
export type Source = 'mock' | 'chain'
export type CheckStatus = 'pass' | 'fail' | 'skipped'
export type BlockOutcome = 'reverted' | 'included' | 'drained'

export interface PayloadFields {
  operation: 'CALL' | 'DELEGATECALL'
  to: string
  value: string
  data: string
  decodedIntent: string
  /** full-length values used to build the calldata and digest views */
  raw: { toFull: string; valueWeiHex: string; dataHex: string; nonce: number }
}

export interface GuardCheck {
  name: string
  status: CheckStatus
}
export interface RevertInfo {
  name: RevertName
  /** 4-byte selector. Mock values start with 0xMOCK. */
  selector: string
  args: string[]
}
export interface TraceLine {
  depth: number
  call: string
}
export interface StateDiffRow {
  field: string
  before: string
  after: string
}

export interface SceneEvent {
  /** milliseconds from the start of the run */
  t: number
  node: NodeId
  status: Status
  /** caption shown while this is the latest event, 15 words or fewer */
  label: string
  revert?: RevertInfo
  fixtureId?: string
  /** receipt data. Set on the event where the transaction lands in a block. */
  txHash?: string
  blockNumber?: number
  gasUsed?: number
  source?: Source
  blockOutcome?: BlockOutcome
  guardChecks?: GuardCheck[]
  trace?: TraceLine[]
  stateDiff?: StateDiffRow[]
  /** visual directives, interpreted by engine.ts */
  stage?: PayloadStage
  stamp?: StampKind
  vault?: { balance?: number; core?: VaultCore; ms?: number }
}

/** What verifiers signed. null means nobody signed anything. */
export interface Attestation {
  intentHash: string
  policyHash: string
  validUntil: string
  signer: string
}

export interface RunDef {
  id: ScenarioId
  label: string
  blurb: string
  payload: PayloadFields
  /** the payload the signers approved, when it differs from `payload` */
  approved?: PayloadFields
  attestation: Attestation | null
  guarded: SceneEvent[]
  unguarded: SceneEvent[]
}

export interface BreakDef {
  id: BreakId
  label: string
  blurb: string
  payload: PayloadFields
  approved?: PayloadFields
  attestation: Attestation | null
  events: SceneEvent[]
  /** what the same payload would do with no guard. Used for the trace comparison only, never played. */
  unguarded?: SceneEvent[]
}

export type RunRef = { kind: 'scenario'; id: ScenarioId } | { kind: 'break'; id: BreakId }

export const BADGES = ['SYNTHETIC LOCAL CHAIN', 'MOCK DATA'] as const

export const PROPOSAL = { title: 'Transfer 0.1 ETH to cold wallet', tag: 'UNTRUSTED' } as const

export const VAULT = {
  startBalance: 10,
  cores: { good: '0x1A2B…c0de', bad: '0xBAD0…5e1c' },
} as const

/** Nodes that only exist when the guard is on. */
export const GUARD_NODES: NodeId[] = ['verifierA', 'verifierB', 'verifierC', 'registry', 'gate']

export const REGISTRY = { needed: 2, total: 3 } as const

export const STATUS_WORDS: Record<Status, string> = {
  idle: 'WAITING',
  active: 'CHECKING',
  ok: 'ATTESTED',
  bad: 'MISMATCH',
  warn: 'NO RESPONSE',
  off: 'OFFLINE',
}

export const STAMP_TEXT: Record<StampKind, { title: string; sub: string }> = {
  revert: { title: 'REVERT', sub: 'state unchanged' },
  ok: { title: 'EXECUTED', sub: 'every check passed' },
  drained: { title: 'DRAINED', sub: 'nothing checked it' },
}

/* ---------- mock identifiers: every mock hash, selector and address starts with 0xMOCK ---------- */

function xmur3(str: string) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return (h ^= h >>> 16) >>> 0
  }
}
export function mockHex(seed: string, len: number): string {
  const next = xmur3(seed)
  let out = ''
  while (out.length < len) out += next().toString(16).padStart(8, '0')
  return out.slice(0, len)
}
/** 32-byte deterministic hex hash. */
export const mockHash = (seed: string) => `0x${mockHex(seed, 64)}`
/** 20-byte deterministic address. */
export const mockAddr = (seed: string) => `0x${mockHex(seed, 40)}`
/** 4-byte selector. */
export const mockSelector = (seed: string) => `0x${mockHex(seed, 8)}`

export const DEFAULT_SOURCE: Source = 'chain'

export const CHAIN = {
  rpcUrl: 'http://127.0.0.1:8545',
  vaultAddress: '0x67f2Cd72901b066233E8aEc8e832B9eC8f5DD56B',
  guardAddress: '0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82',
  registryAddress: '0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0',
  slotZero: '0x0',
  /** the block every run lands in, and how many recent blocks the 3D row shows */
  block: 10,
  blocksShown: 5,
  calldataSelector: '0x6a761202',
}

export const BLOCK_OUTCOME_TEXT: Record<BlockOutcome, string> = {
  reverted: 'REVERTED (guard)',
  included: 'INCLUDED',
  drained: 'INCLUDED (no guard)',
}

export const INSPECTOR_TABS = ['Checks', 'Revert', 'Calldata', 'Digest', 'State', 'Trace'] as const
export type InspectorTab = (typeof INSPECTOR_TABS)[number]

const ADDR = {
  cold: { short: '0x71C7…e4A1', full: '0x71C7656EC7ab88b098defB751B7401B5f6d8e4A1' },
  attacker: { short: '0x9f3A…c1d0', full: '0x9f3A22b7d41cE05a8Bb6D3c9017e5fA2c4D0c1d0' },
  malicious: { short: '0xBAD0…5e1c', full: '0xBAD0c0de5a7e1f3b9d2c48E6a07f19d3bC905e1c' },
}

const WEI = { zero: '0', tenth: '016345785d8a0000', ten: '8ac7230489e80000' }
const NONCE = 41
const UPGRADE_SELECTOR = '0x3659cfe6'

const e = (t: number, node: NodeId, status: Status, label: string, extra: Partial<SceneEvent> = {}): SceneEvent => ({
  t,
  node,
  status,
  label,
  ...extra,
})

/* ---------- receipts: what the chain reports once a transaction lands ---------- */

export const CHECK_NAMES = [
  'Operation is a plain CALL',
  'Digest equals the proposal digest',
  '2 of 3 attestations on that digest',
  'Digest not used before',
] as const
const checks = (...s: CheckStatus[]): GuardCheck[] => CHECK_NAMES.map((name, i) => ({ name, status: s[i] ?? 'skipped' }))

const REVERTS = {
  UnsupportedOperation: (op: string): RevertInfo => ({
    name: 'UnsupportedOperation',
    selector: '0x5109f2d1',
    args: [`operation = ${op}`],
  }),
  ThresholdNotMet: (have: number): RevertInfo => ({
    name: 'ThresholdNotMet',
    selector: '0x028c5040',
    args: [`have = ${have}`, 'need = 2'],
  }),
  DigestMismatch: (seed: string): RevertInfo => ({
    name: 'DigestMismatch',
    selector: '0x600f6b40',
    args: [`expected = ${mockHash('approved:' + seed)}`, `actual = ${mockHash('actual:' + seed)}`],
  }),
  AlreadyConsumed: (seed: string): RevertInfo => ({
    name: 'AlreadyConsumed',
    selector: '0x0ebc8ea6',
    args: [`digest = ${mockHash('approved:' + seed)}`],
  }),
}

const tx = (seed: string, gasUsed: number, outcome: BlockOutcome, extra: Partial<SceneEvent>): Partial<SceneEvent> => ({
  txHash: mockHash('tx:' + seed),
  blockNumber: CHAIN.block,
  gasUsed,
  source: 'chain',
  blockOutcome: outcome,
  ...extra,
})

const BASE_STATE: { balance: string; slot0: string; owners: string; modules: string; nonce: string } = {
  balance: '10.000 ETH',
  slot0: VAULT.cores.good,
  owners: '3 of 3 signers',
  modules: 'none',
  nonce: String(NONCE),
}
const GUARD_ON = 'IntentLock (2 of 3)'
const GUARD_OFF = 'none'

function state(guard: string, after: Partial<typeof BASE_STATE> = {}): StateDiffRow[] {
  const a = { ...BASE_STATE, ...after }
  return [
    { field: 'Vault balance', before: BASE_STATE.balance, after: a.balance },
    { field: 'Storage slot 0 (implementation)', before: BASE_STATE.slot0, after: a.slot0 },
    { field: 'Owners', before: BASE_STATE.owners, after: a.owners },
    { field: 'Guard', before: guard, after: guard },
    { field: 'Modules', before: BASE_STATE.modules, after: a.modules },
    { field: 'Nonce', before: BASE_STATE.nonce, after: a.nonce },
  ]
}

const PAYLOADS: Record<ScenarioId, PayloadFields> = {
  delegatecall: {
    operation: 'DELEGATECALL',
    to: ADDR.malicious.short,
    value: '0 ETH',
    data: `0x${UPGRADE_SELECTOR}…5e1c  upgradeTo(address)`,
    decodedIntent: 'Replace the vault logic. Change owners.',
    raw: { toFull: ADDR.malicious.full, valueWeiHex: WEI.zero, dataHex: UPGRADE_SELECTOR + ADDR.malicious.full.slice(2).toLowerCase().padStart(64, '0'), nonce: NONCE },
  },
  forged: {
    operation: 'CALL',
    to: ADDR.attacker.short,
    value: '10.000 ETH',
    data: '0x   (empty, signatures: none)',
    decodedIntent: 'Send the whole balance to an unknown address.',
    raw: { toFull: ADDR.attacker.full, valueWeiHex: WEI.ten, dataHex: '', nonce: NONCE },
  },
  legit: {
    operation: 'CALL',
    to: ADDR.cold.short,
    value: '0.1 ETH',
    data: '0x   (empty)',
    decodedIntent: 'Send 0.1 ETH to the allowlisted cold wallet.',
    raw: { toFull: ADDR.cold.full, valueWeiHex: WEI.tenth, dataHex: '', nonce: NONCE },
  },
}

const attestation = (seed: string): Attestation => ({
  intentHash: mockHash('intent:' + seed),
  policyHash: mockHash('policy:v1'),
  validUntil: `block ${CHAIN.block + 120}`,
  signer: mockAddr('verifier-a'),
})

export const SCENARIOS: RunDef[] = [
  {
    id: 'delegatecall',
    label: 'Delegatecall attack',
    blurb: 'Looks like a transfer. Runs foreign code.',
    payload: PAYLOADS.delegatecall,
    approved: PAYLOADS.legit,
    attestation: attestation('legit'),
    guarded: [
      e(0, 'proposal', 'active', 'Signers see a friendly transfer. It is untrusted.'),
      e(900, 'payload', 'active', 'The real payload is a DELEGATECALL to an unknown contract.', { stage: 'home' }),
      e(2000, 'verifierA', 'active', 'Verifier A decodes the raw payload on its own.'),
      e(3000, 'verifierA', 'bad', 'A: decoded intent differs from the proposal. No attestation.'),
      e(3700, 'verifierB', 'bad', 'B refuses too. Different device, same answer.'),
      e(4500, 'verifierC', 'ok', 'C trusted the front-end feed and attested. Only one vote.'),
      e(5300, 'registry', 'warn', 'Registry holds 1 of 3. Two are needed.'),
      e(6100, 'payload', 'active', 'The payload reaches the gate.', { stage: 'gate' }),
      e(6900, 'gate', 'bad', 'Gate refuses DELEGATECALL. The laser grid holds.', {
        fixtureId: 'WB-01',
        stamp: 'revert',
        ...tx('delegatecall:guarded', 38214, 'reverted', {
          revert: REVERTS.UnsupportedOperation('1 (DELEGATECALL)'),
          guardChecks: checks('fail'),
          trace: [
            { depth: 0, call: 'Safe.execTransaction(op = DELEGATECALL, to = 0xBAD0…5e1c)' },
            { depth: 1, call: 'Guard.checkTransaction(to, value, data, operation)' },
            { depth: 2, call: 'revert UnsupportedOperation(1)' },
          ],
          stateDiff: state(GUARD_ON),
        }),
      }),
      e(7100, 'payload', 'bad', 'The payload bounces back.', { stage: 'bounce' }),
      e(8300, 'vault', 'ok', 'Vault state unchanged. Balance is still 10.000 ETH.'),
    ],
    unguarded: [
      e(0, 'proposal', 'active', 'Signers see a friendly transfer. It is untrusted.'),
      e(900, 'payload', 'active', 'Same payload. This wallet has no verifiers and no gate.'),
      e(2100, 'gate', 'off', 'There is no guard on this wallet.'),
      e(2900, 'payload', 'active', 'The payload walks straight into the vault.', {
        stage: 'vault',
        ...tx('delegatecall:unguarded', 71_906, 'drained', {
          guardChecks: checks(),
          trace: [
            { depth: 0, call: 'Safe.execTransaction(op = DELEGATECALL, to = 0xBAD0…5e1c)' },
            { depth: 1, call: 'DELEGATECALL 0xBAD0…5e1c.upgradeTo(0xBAD0…5e1c)' },
            { depth: 2, call: 'SSTORE slot 0 = 0xBAD0…5e1c' },
            { depth: 2, call: 'SSTORE owners = [0x9f3A…c1d0]' },
            { depth: 2, call: 'enableModule(0xBAD0…5e1c)' },
            { depth: 1, call: 'CALL 0x9f3A…c1d0 value 10.000 ETH' },
          ],
          stateDiff: state(GUARD_OFF, { balance: '0.000 ETH', slot0: VAULT.cores.bad, owners: '1 signer (0x9f3A…c1d0)', modules: '0xBAD0…5e1c enabled', nonce: String(NONCE + 1) }),
        }),
      }),
      e(3800, 'vault', 'bad', 'The vault logic is swapped for 0xBAD0…5e1c.', { vault: { core: 'bad' } }),
      e(4600, 'vault', 'bad', 'The balance drains toward zero.', { vault: { balance: 0, ms: 2600 } }),
      e(7600, 'vault', 'bad', 'Vault drained. Nothing reverted.', { stamp: 'drained' }),
    ],
  },
  {
    id: 'forged',
    label: 'Forged CALL, no signatures',
    blurb: 'A plain transfer nobody approved.',
    payload: PAYLOADS.forged,
    attestation: null,
    guarded: [
      e(0, 'proposal', 'active', 'Someone submits a transfer with no approvals attached.'),
      e(900, 'payload', 'active', 'A plain CALL for the whole balance. Signatures: none.', { stage: 'home' }),
      e(2000, 'verifierA', 'warn', 'Verifier A holds no attestation for this payload.'),
      e(2600, 'verifierB', 'warn', 'Verifier B holds none either.'),
      e(3200, 'verifierC', 'warn', 'Verifier C was never asked to sign.'),
      e(4000, 'registry', 'bad', 'Registry holds 0 of 3. Two are needed.'),
      e(4800, 'payload', 'active', 'The payload reaches the gate.', { stage: 'gate' }),
      e(5600, 'gate', 'bad', 'Gate reverts. Not enough attestations.', {
        fixtureId: 'WB-02',
        stamp: 'revert',
        ...tx('forged:guarded', 41_377, 'reverted', {
          revert: REVERTS.ThresholdNotMet(0),
          guardChecks: checks('pass', 'pass', 'fail'),
          trace: [
            { depth: 0, call: 'Safe.execTransaction(op = CALL, to = 0x9f3A…c1d0, value = 10.000 ETH)' },
            { depth: 1, call: 'Guard.checkTransaction(to, value, data, operation)' },
            { depth: 2, call: 'Registry.countAttestations(digest) -> 0' },
            { depth: 2, call: 'revert ThresholdNotMet(have = 0, need = 2)' },
          ],
          stateDiff: state(GUARD_ON),
        }),
      }),
      e(5800, 'payload', 'bad', 'The payload bounces back.', { stage: 'bounce' }),
      e(7000, 'vault', 'ok', 'Vault state unchanged. Balance is still 10.000 ETH.'),
    ],
    unguarded: [
      e(0, 'proposal', 'active', 'Someone submits a transfer with no approvals attached.'),
      e(900, 'payload', 'active', 'A plain CALL for the whole balance. Nothing asks for proof.'),
      e(2100, 'gate', 'off', 'There is no guard on this wallet.'),
      e(2900, 'payload', 'active', 'The payload walks straight into the vault.', {
        stage: 'vault',
        ...tx('forged:unguarded', 52_840, 'drained', {
          guardChecks: checks(),
          trace: [
            { depth: 0, call: 'Safe.execTransaction(op = CALL, to = 0x9f3A…c1d0, value = 10.000 ETH)' },
            { depth: 1, call: 'CALL 0x9f3A…c1d0 value 10.000 ETH' },
          ],
          stateDiff: state(GUARD_OFF, { balance: '0.000 ETH', nonce: String(NONCE + 1) }),
        }),
      }),
      e(3800, 'vault', 'bad', 'The balance drains toward zero.', { vault: { balance: 0, ms: 2600 } }),
      e(6800, 'vault', 'bad', 'Vault drained. Nothing reverted.', { stamp: 'drained' }),
    ],
  },
  {
    id: 'legit',
    label: 'Legit transfer',
    blurb: 'The same screen, and it is true.',
    payload: PAYLOADS.legit,
    attestation: attestation('legit'),
    guarded: [
      e(0, 'proposal', 'active', 'Signers see a transfer. This time it is honest.'),
      e(900, 'payload', 'active', 'A plain CALL of 0.1 ETH to the allowlisted cold wallet.', { stage: 'home' }),
      e(2000, 'verifierA', 'ok', 'Verifier A decodes the payload. Intent matches. Attested.'),
      e(2900, 'verifierB', 'ok', 'Verifier B agrees. Attested.'),
      e(3800, 'verifierC', 'ok', 'Verifier C agrees. Attested.'),
      e(4600, 'registry', 'ok', 'Registry holds 3 of 3. Two were needed.'),
      e(5400, 'payload', 'active', 'The payload reaches the gate.', { stage: 'gate' }),
      e(6200, 'gate', 'ok', 'Gate opens. Operation is a plain CALL.', {
        ...tx('legit:guarded', 63_552, 'included', {
          guardChecks: checks('pass', 'pass', 'pass', 'pass'),
          trace: [
            { depth: 0, call: 'Safe.execTransaction(op = CALL, to = 0x71C7…e4A1, value = 0.1 ETH)' },
            { depth: 1, call: 'Guard.checkTransaction(to, value, data, operation)' },
            { depth: 2, call: 'Registry.countAttestations(digest) -> 3' },
            { depth: 1, call: 'CALL 0x71C7…e4A1 value 0.1 ETH' },
            { depth: 1, call: 'Guard.markConsumed(digest)' },
          ],
          stateDiff: state(GUARD_ON, { balance: '9.900 ETH', nonce: String(NONCE + 1) }),
        }),
      }),
      e(6500, 'payload', 'ok', 'The payload moves on to the vault.', { stage: 'vault' }),
      e(7600, 'vault', 'ok', 'Executed. Balance is now 9.900 ETH.', { vault: { balance: 9.9, ms: 1200 }, stamp: 'ok' }),
    ],
    unguarded: [
      e(0, 'proposal', 'active', 'Signers see a transfer. This time it is honest.'),
      e(900, 'payload', 'active', 'A plain CALL of 0.1 ETH to the cold wallet.'),
      e(2100, 'gate', 'off', 'There is no guard on this wallet.'),
      e(2900, 'payload', 'active', 'The payload walks into the vault.', {
        stage: 'vault',
        ...tx('legit:unguarded', 53_104, 'included', {
          guardChecks: checks(),
          trace: [
            { depth: 0, call: 'Safe.execTransaction(op = CALL, to = 0x71C7…e4A1, value = 0.1 ETH)' },
            { depth: 1, call: 'CALL 0x71C7…e4A1 value 0.1 ETH' },
          ],
          stateDiff: state(GUARD_OFF, { balance: '9.900 ETH', nonce: String(NONCE + 1) }),
        }),
      }),
      e(3800, 'vault', 'ok', 'It works, but nothing checked it. Balance is 9.900 ETH.', {
        vault: { balance: 9.9, ms: 1200 },
        stamp: 'ok',
      }),
    ],
  },
]

/** What the same tampered payload would do on a wallet with no guard. Not played, only compared. */
const unguardedLanding = (seed: string, gas: number, payloadTrace: TraceLine[], after: Partial<typeof BASE_STATE>): SceneEvent[] => [
  e(0, 'payload', 'active', 'Same payload on a wallet with no guard.', {
    stage: 'vault',
    ...tx(seed, gas, 'drained', { guardChecks: checks(), trace: payloadTrace, stateDiff: state(GUARD_OFF, after) }),
  }),
]

export const BREAKS: BreakDef[] = [
  {
    id: 'destination',
    label: 'Change destination',
    blurb: 'Swap the cold wallet for another address.',
    payload: { ...PAYLOADS.legit, to: ADDR.attacker.short, decodedIntent: 'Send 0.1 ETH to an unknown address.', raw: { ...PAYLOADS.legit.raw, toFull: ADDR.attacker.full } },
    approved: PAYLOADS.legit,
    attestation: attestation('legit'),
    events: [
      e(0, 'proposal', 'active', 'Same proposal. Only the destination changed after signing.'),
      e(900, 'payload', 'active', 'The payload now points at 0x9f3A…c1d0.', { stage: 'home' }),
      e(2000, 'verifierA', 'bad', 'A: destination differs from the signed intent.'),
      e(2700, 'verifierB', 'bad', 'B: destination differs too.'),
      e(3400, 'verifierC', 'bad', 'C: destination differs too.'),
      e(4200, 'registry', 'bad', 'Registry holds 0 of 3. Two are needed.'),
      e(5000, 'payload', 'active', 'The payload reaches the gate.', { stage: 'gate' }),
      e(5800, 'gate', 'bad', 'Gate reverts. The digest does not match what was signed.', {
        fixtureId: 'WB-04',
        stamp: 'revert',
        ...tx('destination', 39_760, 'reverted', {
          revert: REVERTS.DigestMismatch('destination'),
          guardChecks: checks('pass', 'fail'),
          trace: [
            { depth: 0, call: 'Safe.execTransaction(op = CALL, to = 0x9f3A…c1d0, value = 0.1 ETH)' },
            { depth: 1, call: 'Guard.checkTransaction(to, value, data, operation)' },
            { depth: 2, call: 'keccak256(payload) != approvedDigest' },
            { depth: 2, call: 'revert DigestMismatch(expected, actual)' },
          ],
          stateDiff: state(GUARD_ON),
        }),
      }),
      e(6000, 'payload', 'bad', 'The payload bounces back.', { stage: 'bounce' }),
      e(7200, 'vault', 'ok', 'Vault state unchanged. Balance is still 10.000 ETH.'),
    ],
    unguarded: unguardedLanding(
      'destination:unguarded',
      53_104,
      [
        { depth: 0, call: 'Safe.execTransaction(op = CALL, to = 0x9f3A…c1d0, value = 0.1 ETH)' },
        { depth: 1, call: 'CALL 0x9f3A…c1d0 value 0.1 ETH' },
      ],
      { balance: '9.900 ETH', nonce: String(NONCE + 1) },
    ),
  },
  {
    id: 'operation',
    label: 'Change CALL to DELEGATECALL',
    blurb: 'Same destination, more dangerous operation.',
    payload: { ...PAYLOADS.legit, operation: 'DELEGATECALL', decodedIntent: 'Run the destination code inside the vault.' },
    approved: PAYLOADS.legit,
    attestation: attestation('legit'),
    events: [
      e(0, 'proposal', 'active', 'Same proposal. Only the operation type changed.'),
      e(900, 'payload', 'active', 'The payload now says DELEGATECALL.', { stage: 'home' }),
      e(2000, 'verifierA', 'bad', 'A: operation differs from the signed intent.'),
      e(2700, 'verifierB', 'bad', 'B: operation differs too.'),
      e(3400, 'verifierC', 'ok', 'C attested the old digest. One vote only.'),
      e(4200, 'registry', 'warn', 'Registry holds 1 of 3. Two are needed.'),
      e(5000, 'payload', 'active', 'The payload reaches the gate.', { stage: 'gate' }),
      e(5800, 'gate', 'bad', 'Gate refuses DELEGATECALL before counting votes.', {
        fixtureId: 'WB-05',
        stamp: 'revert',
        ...tx('operation', 38_190, 'reverted', {
          revert: REVERTS.UnsupportedOperation('1 (DELEGATECALL)'),
          guardChecks: checks('fail'),
          trace: [
            { depth: 0, call: 'Safe.execTransaction(op = DELEGATECALL, to = 0x71C7…e4A1)' },
            { depth: 1, call: 'Guard.checkTransaction(to, value, data, operation)' },
            { depth: 2, call: 'revert UnsupportedOperation(1)' },
          ],
          stateDiff: state(GUARD_ON),
        }),
      }),
      e(6000, 'payload', 'bad', 'The payload bounces back.', { stage: 'bounce' }),
      e(7200, 'vault', 'ok', 'Vault state unchanged. Balance is still 10.000 ETH.'),
    ],
    unguarded: unguardedLanding(
      'operation:unguarded',
      58_420,
      [
        { depth: 0, call: 'Safe.execTransaction(op = DELEGATECALL, to = 0x71C7…e4A1)' },
        { depth: 1, call: 'DELEGATECALL 0x71C7…e4A1 (code runs with vault storage)' },
      ],
      { nonce: String(NONCE + 1) },
    ),
  },
  {
    id: 'verifierB',
    label: 'Disable verifier B',
    blurb: 'Take B offline. C misses the window.',
    payload: PAYLOADS.legit,
    attestation: attestation('legit'),
    events: [
      e(0, 'proposal', 'active', 'An honest transfer, but verifier B is switched off.'),
      e(900, 'payload', 'active', 'A plain CALL of 0.1 ETH to the cold wallet.', { stage: 'home' }),
      e(2000, 'verifierA', 'ok', 'Verifier A decodes the payload. Attested.'),
      e(2700, 'verifierB', 'off', 'Verifier B is offline. No attestation.'),
      e(3400, 'verifierC', 'warn', 'Verifier C misses the attestation window.'),
      e(4200, 'registry', 'bad', 'Registry holds 1 of 3. Two are needed.'),
      e(5000, 'payload', 'active', 'The payload reaches the gate.', { stage: 'gate' }),
      e(5800, 'gate', 'bad', 'Gate reverts. Not enough attestations.', {
        fixtureId: 'WB-06',
        stamp: 'revert',
        ...tx('verifierB', 41_377, 'reverted', {
          revert: REVERTS.ThresholdNotMet(1),
          guardChecks: checks('pass', 'pass', 'fail'),
          trace: [
            { depth: 0, call: 'Safe.execTransaction(op = CALL, to = 0x71C7…e4A1, value = 0.1 ETH)' },
            { depth: 1, call: 'Guard.checkTransaction(to, value, data, operation)' },
            { depth: 2, call: 'Registry.countAttestations(digest) -> 1' },
            { depth: 2, call: 'revert ThresholdNotMet(have = 1, need = 2)' },
          ],
          stateDiff: state(GUARD_ON),
        }),
      }),
      e(6000, 'payload', 'bad', 'The payload bounces back.', { stage: 'bounce' }),
      e(7200, 'vault', 'ok', 'Vault state unchanged. Balance is still 10.000 ETH.'),
    ],
    unguarded: unguardedLanding(
      'verifierB:unguarded',
      53_104,
      [
        { depth: 0, call: 'Safe.execTransaction(op = CALL, to = 0x71C7…e4A1, value = 0.1 ETH)' },
        { depth: 1, call: 'CALL 0x71C7…e4A1 value 0.1 ETH' },
      ],
      { balance: '9.900 ETH', nonce: String(NONCE + 1) },
    ),
  },
  {
    id: 'replay',
    label: 'Replay old signature',
    blurb: 'Reuse approvals that were already spent.',
    payload: PAYLOADS.legit,
    attestation: attestation('legit'),
    events: [
      e(0, 'proposal', 'active', 'Someone resubmits a transfer that already executed.'),
      e(900, 'payload', 'active', 'Same payload, same old signatures.', { stage: 'home' }),
      e(2000, 'verifierA', 'ok', 'A: the old signature is valid.'),
      e(2600, 'verifierB', 'ok', 'B: the old signature is valid.'),
      e(3200, 'verifierC', 'ok', 'C: the old signature is valid.'),
      e(4000, 'registry', 'ok', 'Registry holds 3 of 3. Two were needed.'),
      e(4800, 'payload', 'active', 'The payload reaches the gate.', { stage: 'gate' }),
      e(5600, 'gate', 'bad', 'Gate reverts. This digest was already used once.', {
        fixtureId: 'WB-07',
        stamp: 'revert',
        ...tx('replay', 44_902, 'reverted', {
          revert: REVERTS.AlreadyConsumed('replay'),
          guardChecks: checks('pass', 'pass', 'pass', 'fail'),
          trace: [
            { depth: 0, call: 'Safe.execTransaction(op = CALL, to = 0x71C7…e4A1, value = 0.1 ETH)' },
            { depth: 1, call: 'Guard.checkTransaction(to, value, data, operation)' },
            { depth: 2, call: 'Registry.countAttestations(digest) -> 3' },
            { depth: 2, call: 'consumed[digest] == true' },
            { depth: 2, call: 'revert AlreadyConsumed(digest)' },
          ],
          stateDiff: state(GUARD_ON),
        }),
      }),
      e(5800, 'payload', 'bad', 'The payload bounces back.', { stage: 'bounce' }),
      e(7000, 'vault', 'ok', 'Vault state unchanged. Balance is still 10.000 ETH.'),
    ],
    unguarded: unguardedLanding(
      'replay:unguarded',
      53_104,
      [
        { depth: 0, call: 'Safe.execTransaction(op = CALL, to = 0x71C7…e4A1, value = 0.1 ETH)' },
        { depth: 1, call: 'CALL 0x71C7…e4A1 value 0.1 ETH (paid a second time)' },
      ],
      { balance: '9.900 ETH', nonce: String(NONCE + 1) },
    ),
  },
]

export interface NodeInfo {
  title: string
  /** short label for the inspect chips */
  short: string
  what: string
  checks: string
}

export const NODE_INFO: Record<NodeId, NodeInfo> = {
  proposal: {
    short: 'Proposal',
    title: 'Proposal billboard',
    what: 'The friendly screen signers read before clicking Confirm.',
    checks: 'Nothing. It is untrusted text written by the front-end.',
  },
  payload: {
    short: 'Payload',
    title: 'Payload crate',
    what: 'The raw transaction that would actually execute on chain.',
    checks: 'Nothing itself. Verifiers decode it and the gate inspects it.',
  },
  verifierA: {
    short: 'Verifier A',
    title: 'Verifier A',
    what: 'An independent verifier on its own device and key.',
    checks: 'Decodes the raw payload and signs only if it matches the intent.',
  },
  verifierB: {
    short: 'Verifier B',
    title: 'Verifier B',
    what: 'A second verifier on a different device and key.',
    checks: 'Decodes the raw payload and signs only if it matches the intent.',
  },
  verifierC: {
    short: 'Verifier C',
    title: 'Verifier C',
    what: 'A third verifier, run by a different operator.',
    checks: 'Decodes the raw payload and signs only if it matches the intent.',
  },
  registry: {
    short: 'Registry',
    title: 'Attestation registry',
    what: 'A ring with three slots, one per verifier signature.',
    checks: 'Counts matching attestations and blocks execution below two of three.',
  },
  gate: {
    short: 'Gate',
    title: 'Guard gate',
    what: 'The on-chain check every execution must pass through.',
    checks: 'Operation allowed, digest matches, threshold met, digest not reused.',
  },
  vault: {
    short: 'Vault',
    title: 'Vault',
    what: 'The multisig vault holding funds and its implementation core.',
    checks: 'Nothing itself. It only changes if the gate lets a payload through.',
  },
}

export interface CameraPose {
  pos: [number, number, number]
  target: [number, number, number]
}

/** World positions used by both the scene and the camera poses. */
export const WORLD = {
  proposal: [-7.6, 2.4, 1.6],
  payload: [-4, 0.9, 0.8],
  gate: [0, 0, 0.8],
  vault: [5.4, 1.3, 0.8],
  registry: [0, 6.3, -2.5],
  verifierA: [-4.6, 5.4, -6],
  verifierB: [4.6, 5.4, -6],
  verifierC: [0, 9.8, -7],
} as const satisfies Record<string, readonly [number, number, number]>

export const PAYLOAD_STAGE_X: Record<PayloadStage, number> = { home: -4, gate: -1.5, bounce: -4, vault: 2.4 }

export const CAMERA: Record<CameraKey, CameraPose> = {
  overview: { pos: [0.4, 6, 15.5], target: [0.4, 4.2, 0] },
  verifiers: { pos: [0, 8.6, 8.5], target: [0, 6.8, -5] },
  proposal: { pos: [-6.2, 2.7, 8.2], target: [-7.6, 2.3, 1.6] },
  payload: { pos: [-2.6, 3, 8], target: [-4, 1.9, 0.8] },
  verifierA: { pos: [-3.6, 6, 0.6], target: [-4.6, 5.4, -6] },
  verifierB: { pos: [3.6, 6, 0.6], target: [4.6, 5.4, -6] },
  verifierC: { pos: [0, 10.2, 0.6], target: [0, 9.8, -7] },
  registry: { pos: [0, 6.7, 4.4], target: [0, 6.3, -2.5] },
  gate: { pos: [0, 2.8, 7.4], target: [0, 1.7, 0.8] },
  vault: { pos: [6.8, 2.9, 7.4], target: [5.4, 1.3, 0.8] },
  vaultSlots: { pos: [5.6, 2.2, 9.2], target: [5.4, 1.5, 2.4] },
}

export interface TourStep {
  camera: CameraKey
  select?: NodeId
  caption: string
  action?: { mode?: Mode; scenario?: ScenarioId; run?: boolean; crateOpen?: boolean }
}

export const TOUR: TourStep[] = [
  { camera: 'proposal', select: 'proposal', caption: 'This is what signers see. It is untrusted.', action: { crateOpen: false } },
  { camera: 'payload', select: 'payload', caption: 'This is what would actually run. The crate cracks open.', action: { crateOpen: true } },
  { camera: 'verifiers', select: 'verifierA', caption: 'Three verifiers decode the payload independently, on separate keys.', action: { crateOpen: false } },
  { camera: 'registry', select: 'registry', caption: 'The registry counts attestations. Two of three are needed.' },
  {
    camera: 'gate',
    select: 'gate',
    caption: 'Guard on: the gate refuses DELEGATECALL and the vault is untouched.',
    action: { mode: 'guarded', scenario: 'delegatecall', run: true, crateOpen: false },
  },
  {
    camera: 'vault',
    select: 'vault',
    caption: 'Guard off: the same payload swaps the core and drains the vault.',
    action: { mode: 'unguarded', scenario: 'delegatecall', run: true },
  },
]

export const IDLE_CAPTION = 'Pick a scenario and press play. Everything here is synthetic.'
export const INFO_HINT = 'Click any object in the scene, or pick one below.'
