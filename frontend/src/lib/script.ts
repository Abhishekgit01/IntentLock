import { TRANSFER_AMOUNT, VAULT_TOTAL } from './data'
import type {
  IntentLockState,
  LogEntry,
  Patch,
  RunStatus,
  ScenarioId,
  ScenarioScript,
  ScriptEvent,
  VerifierId,
} from './types'

const ev = (
  at: number,
  patches: Patch[],
  caption?: string,
  log?: ScriptEvent['log'],
): ScriptEvent => ({ at, patches, caption, log })

const SIGNER_CAPTION = 'Both signers clicked Confirm on the friendly screen.'

const normal: ScenarioScript = {
  id: 'normal',
  tabLabel: 'Normal multisig',
  runLabel: 'Run normal multisig',
  blurb: 'No guard. Quorum is enough.',
  durationMs: 15000,
  guardEnabled: false,
  decoded: [
    { tag: 'DELEGATECALL', text: 'delegatecall to unknown contract', detail: '0xBAD0…5e1c · unverified source, deployed 11 min ago', severity: 'danger' },
    { tag: 'UPGRADE', text: 'proxy implementation upgrade', detail: 'upgradeTo(0xBAD0…5e1c) rewrites the EIP-1967 slot', severity: 'danger' },
    { tag: 'OWNERS', text: 'ownership changes', detail: 'owner set replaced: 3 signers to 1 (0x9f3A…c1d0)', severity: 'danger' },
  ],
  events: [
    ev(300, [{ type: 'phase', phase: 'proposed' }], 'A proposal appears. Signers are shown: Transfer 0.1 ETH to cold wallet.', { level: 'info', text: 'Proposal #0412 submitted to multisig 0x4A9c…71B2' }),
    ev(2000, [{ type: 'decode', lines: 1 }], 'Underneath, the calldata says something else. Nobody in this flow decodes it.'),
    ev(2700, [{ type: 'decode', lines: 2 }]),
    ev(3400, [{ type: 'decode', lines: 3 }, { type: 'risk', risk: 'critical' }], undefined, { level: 'warn', text: 'Raw calldata: DELEGATECALL, proxy upgrade, owner swap (invisible to signers)' }),
    ev(5000, [{ type: 'signers', count: 1 }], undefined, { level: 'info', text: 'Signer 1 of 3 confirmed' }),
    ev(6200, [{ type: 'signers', count: 2 }], SIGNER_CAPTION, { level: 'info', text: 'Signer 2 of 3 confirmed. Quorum reached' }),
    ev(7400, [{ type: 'phase', phase: 'executed' }, { type: 'flow', flow: 'flowing' }, { type: 'move', durationMs: 4800, amount: VAULT_TOTAL }], 'Quorum met, so the multisig executes. No guard sits in the path.', { level: 'danger', text: 'execute(): delegatecall succeeded, proxy upgraded' }),
    ev(12200, [{ type: 'flow', flow: 'settled' }, { type: 'stamp', stamp: 'drained' }], 'Vault balance: 0.00 ETH. The screen lied and the chain obeyed.', { level: 'danger', text: 'Vault drained to 0x9f3A…c1d0 (80%) and 0xD00D…4e21 (20%)' }),
  ],
}

const attack: ScenarioScript = {
  id: 'attack',
  tabLabel: 'IntentLock: attack',
  runLabel: 'Run the attack',
  blurb: 'Verifiers disagree. Guard reverts.',
  durationMs: 20000,
  guardEnabled: true,
  decoded: normal.decoded,
  events: [
    ev(400, [{ type: 'phase', phase: 'proposed' }], 'A proposal appears. Signers are shown: Transfer 0.1 ETH to cold wallet.', { level: 'info', text: 'Proposal #0412 submitted to guarded multisig 0x4A9c…71B2' }),
    ev(2000, [{ type: 'phase', phase: 'decoded' }, { type: 'decode', lines: 1 }], 'IntentLock decodes the raw calldata, not the screen.', { level: 'info', text: 'Guard decoded calldata for proposal #0412' }),
    ev(2700, [{ type: 'decode', lines: 2 }]),
    ev(3400, [{ type: 'decode', lines: 3 }, { type: 'risk', risk: 'critical' }], undefined, { level: 'warn', text: 'Risk: CRITICAL. delegatecall, proxy upgrade, owner swap' }),
    ev(5000, [{ type: 'signers', count: 1 }], undefined, { level: 'info', text: 'Signer 1 of 3 confirmed' }),
    ev(6200, [{ type: 'signers', count: 2 }], SIGNER_CAPTION + ' A normal multisig would execute now.', { level: 'info', text: 'Signer 2 of 3 confirmed. Quorum reached' }),
    ev(7600, [{ type: 'phase', phase: 'attesting' }, { type: 'flow', flow: 'flowing' }], 'Execution requested. The guard asks three independent verifiers to attest.', { level: 'info', text: 'execute() requested. Waiting for 2 of 3 attestations' }),
    ev(9400, [{ type: 'verifier', id: 'A', status: 'mismatch' }], 'Verifier A decodes the raw calldata and gets a different intentHash.', { level: 'danger', text: 'Verifier A: intentHash mismatch, refuses to attest' }),
    ev(11200, [{ type: 'verifier', id: 'B', status: 'mismatch' }], 'Verifier B, on a separate device and key, disagrees too.', { level: 'danger', text: 'Verifier B: intentHash mismatch, refuses to attest' }),
    ev(12800, [{ type: 'verifier', id: 'C', status: 'attested' }], 'Verifier C trusted the front-end feed and attested. That is 1 of 3.', { level: 'warn', text: 'Verifier C: attested the UI summary (1 of 3)' }),
    ev(14200, [{ type: 'phase', phase: 'reverted' }, { type: 'flow', flow: 'blocked' }, { type: 'stamp', stamp: 'reverted' }], 'Threshold not met: 1 of 3 attested, 2 mismatches. The guard refuses to execute.', { level: 'danger', text: 'execute() reverted with IntentMismatch(). No funds moved' }),
    ev(16800, [], 'Vault balance unchanged: 2,480.00 ETH. The attacker received nothing.', { level: 'ok', text: 'Vault balance verified: 2,480.00 ETH' }),
    ev(18600, [], 'txHash and intentHash are kept for offline verification.', { level: 'info', text: 'Evidence retained: txHash, intentHash, 3 verifier manifests' }),
  ],
}

const legit: ScenarioScript = {
  id: 'legit',
  tabLabel: 'IntentLock: legitimate transfer',
  runLabel: 'Run legitimate transfer',
  blurb: 'Verifiers agree. Transfer executes.',
  durationMs: 20000,
  guardEnabled: true,
  decoded: [
    { tag: 'CALL', text: 'plain CALL to allowlisted cold wallet', detail: '0x71C7…e4A1 · on allowlist since block 19,204,331', severity: 'ok' },
    { tag: 'VALUE', text: 'transfer 0.1 ETH', detail: 'matches the amount the signers saw', severity: 'ok' },
    { tag: 'SAFE', text: 'no ownership or proxy changes', detail: 'storage writes: none · delegatecall: none', severity: 'ok' },
  ],
  events: [
    ev(400, [{ type: 'phase', phase: 'proposed' }], 'A proposal appears. Signers are shown: Transfer 0.1 ETH to cold wallet.', { level: 'info', text: 'Proposal #0413 submitted to guarded multisig 0x4A9c…71B2' }),
    ev(1800, [{ type: 'phase', phase: 'decoded' }, { type: 'decode', lines: 1 }], 'IntentLock decodes the raw calldata. This time it matches the screen.', { level: 'info', text: 'Guard decoded calldata for proposal #0413' }),
    ev(2500, [{ type: 'decode', lines: 2 }]),
    ev(3200, [{ type: 'decode', lines: 3 }, { type: 'risk', risk: 'high' }], undefined, { level: 'warn', text: 'Risk: HIGH by policy (first transfer to this destination in 30 days)' }),
    ev(4400, [{ type: 'signers', count: 1 }], undefined, { level: 'info', text: 'Signer 1 of 3 confirmed' }),
    ev(5400, [{ type: 'signers', count: 2 }], SIGNER_CAPTION, { level: 'info', text: 'Signer 2 of 3 confirmed. Quorum reached' }),
    ev(6200, [{ type: 'phase', phase: 'attesting' }], 'Execution requested. Verifiers decode the same calldata independently.', { level: 'info', text: 'execute() requested. Waiting for 2 of 3 attestations' }),
    ev(7400, [{ type: 'verifier', id: 'A', status: 'attested' }], undefined, { level: 'ok', text: 'Verifier A: attested (1 of 3)' }),
    ev(8800, [{ type: 'verifier', id: 'B', status: 'attested' }, { type: 'stamp', stamp: 'verified' }], 'Two of three verifiers attested to the exact transaction.', { level: 'ok', text: 'Verifier B: attested (2 of 3). Threshold reached' }),
    ev(10000, [{ type: 'verifier', id: 'C', status: 'attested' }], undefined, { level: 'ok', text: 'Verifier C: attested (3 of 3)' }),
    ev(10800, [{ type: 'phase', phase: 'timelock' }, { type: 'timelock', durationMs: 6000 }], 'High-risk policy starts a timelock. 24 h in production, compressed to 6 s here.', { level: 'warn', text: 'Timelock started (demo: 6 s, production: 24 h)' }),
    ev(16800, [{ type: 'phase', phase: 'executed' }, { type: 'flow', flow: 'flowing' }, { type: 'move', durationMs: 1800, amount: TRANSFER_AMOUNT }], 'Timelock elapsed. The transfer executes.', { level: 'ok', text: 'execute(): 0.1 ETH sent to cold wallet 0x71C7…e4A1' }),
    ev(18800, [{ type: 'flow', flow: 'settled' }], 'Everything matched, so the chain executed. Vault: 2,479.90 ETH.', { level: 'ok', text: 'Vault balance: 2,479.90 ETH' }),
  ],
}

export const SCRIPTS: Record<ScenarioId, ScenarioScript> = { normal, attack, legit }
export const SCENARIO_ORDER: ScenarioId[] = ['normal', 'attack', 'legit']

const IDLE_CAPTION = 'Pick a scenario and press run. Scripted event stream, no chain connected.'
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/** Pure fold: (scenario, elapsed) -> everything the UI shows. Deterministic and replayable. */
export function deriveState(scenario: ScenarioId, elapsedMs: number, status: RunStatus): IntentLockState {
  const script = SCRIPTS[scenario]
  const s: IntentLockState = {
    scenario,
    status,
    elapsedMs,
    durationMs: script.durationMs,
    guardEnabled: script.guardEnabled,
    phase: 'idle',
    signerConfirms: 0,
    decodedLines: 0,
    risk: null,
    verifiers: { A: 'waiting', B: 'waiting', C: 'waiting' },
    attested: 0,
    mismatches: 0,
    thresholdMet: false,
    timelock: { active: false, remainingMs: 0, totalMs: 0 },
    balance: VAULT_TOTAL,
    moved: 0,
    stamp: null,
    flow: 'idle',
    caption: IDLE_CAPTION,
    log: [],
  }
  if (status === 'idle') return s

  let timelockAt = -1
  let timelockMs = 0
  let move: { at: number; dur: number; amount: number } | null = null
  const log: LogEntry[] = []

  for (const e of script.events) {
    if (e.at > elapsedMs) break
    for (const p of e.patches) {
      switch (p.type) {
        case 'phase': s.phase = p.phase; break
        case 'signers': s.signerConfirms = p.count; break
        case 'decode': s.decodedLines = p.lines; break
        case 'risk': s.risk = p.risk; break
        case 'verifier': s.verifiers[p.id as VerifierId] = p.status; break
        case 'timelock': timelockAt = e.at; timelockMs = p.durationMs; break
        case 'move': move = { at: e.at, dur: p.durationMs, amount: p.amount }; break
        case 'stamp': s.stamp = p.stamp; break
        case 'flow': s.flow = p.flow; break
      }
    }
    if (e.caption) s.caption = e.caption
    if (e.log) log.push({ atMs: e.at, ...e.log })
  }

  const values = Object.values(s.verifiers)
  s.attested = values.filter((v) => v === 'attested').length
  s.mismatches = values.filter((v) => v === 'mismatch').length
  s.thresholdMet = s.attested >= 2

  if (timelockAt >= 0) {
    const remaining = Math.max(0, timelockMs - (elapsedMs - timelockAt))
    s.timelock = { active: s.phase === 'timelock', remainingMs: remaining, totalMs: timelockMs }
  }
  if (move) {
    const m = move as { at: number; dur: number; amount: number }
    const t = Math.min(1, Math.max(0, (elapsedMs - m.at) / m.dur))
    s.moved = m.amount * ease(t)
    s.balance = VAULT_TOTAL - s.moved
  }
  s.log = log
  return s
}
