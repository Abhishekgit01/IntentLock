import { BREAKS, CHAIN, SCENARIOS, mockHash, mockSelector, type Attestation, type GuardCheck, type PayloadFields, type RunRef, type SceneEvent, type TraceLine } from './scenes'
import type { Receipt } from './engine'

/* ---------- checks ---------- */

export type CheckView = { name: string; status: 'pass' | 'fail' | 'skipped' | 'pending' }

/** Enforces short-circuit: nothing after the first failure counts as run. */
export function normalizeChecks(checks: GuardCheck[]): CheckView[] {
  let failed = false
  return checks.map((c) => {
    if (failed) return { name: c.name, status: 'skipped' }
    if (c.status === 'fail') failed = true
    return { name: c.name, status: c.status }
  })
}

/* ---------- calldata ---------- */

export interface CalldataSegment {
  label: string
  hex: string
  kind: 'selector' | 'arg' | 'operation'
}
export interface CalldataView {
  segments: CalldataSegment[]
  plain: string
  bytes: number
}

const pad64 = (h: string) => h.toLowerCase().padStart(64, '0')
const padRight64 = (h: string) => h.padEnd(Math.ceil(h.length / 64) * 64, '0')

export function buildCalldata(p: PayloadFields): CalldataView {
  const dataBytes = p.raw.dataHex.length / 2
  const op = p.operation === 'DELEGATECALL' ? '01' : '00'
  const segments: CalldataSegment[] = [
    { label: 'function selector', hex: CHAIN.calldataSelector, kind: 'selector' },
    { label: 'to', hex: pad64(p.raw.toFull.slice(2)), kind: 'arg' },
    { label: 'value (wei)', hex: pad64(p.raw.valueWeiHex), kind: 'arg' },
    { label: 'data offset', hex: pad64('80'), kind: 'arg' },
    { label: 'operation', hex: pad64(op), kind: 'operation' },
    { label: 'data length', hex: pad64(dataBytes.toString(16)), kind: 'arg' },
  ]
  if (p.raw.dataHex) segments.push({ label: 'data', hex: padRight64(p.raw.dataHex), kind: 'arg' })
  const plain =
    p.operation === 'DELEGATECALL'
      ? `Operation ${op} means DELEGATECALL: the code at ${p.to} runs with this vault's storage, so it can rewrite the vault.`
      : `Operation ${op} means CALL: a plain call to ${p.to} carrying ${p.value}. It cannot touch the vault's own code.`
  return { segments, plain, bytes: segments.reduce((n, s) => n + (s.hex.length - (s.kind === 'selector' ? 2 : 0)) / 2, 0) }
}

/* ---------- digest ---------- */

export interface DigestFields {
  operation: string
  to: string
  value: string
  data: string
  nonce: string
}
export const digestFields = (p: PayloadFields): DigestFields => ({
  operation: p.operation,
  to: p.raw.toFull,
  value: p.raw.valueWeiHex,
  data: p.raw.dataHex,
  nonce: String(p.raw.nonce),
})
/** Mock stand-in for the Safe tx digest. Recomputed from the fields, so any change moves every character. */
export const safeTxDigest = (f: DigestFields) => mockHash(`safeTx|${f.operation}|${f.to}|${f.value}|${f.data}|${f.nonce}`)

export const MUTABLE_FIELDS = ['to', 'value', 'operation', 'data', 'nonce'] as const
export type MutableField = (typeof MUTABLE_FIELDS)[number]

export function mutateField(f: DigestFields, which: MutableField): { fields: DigestFields; from: string; to: string } {
  const next = { ...f }
  switch (which) {
    case 'to':
      next.to = f.to.slice(0, -4) + 'dEaD'
      break
    case 'value':
      next.value = f.value === '0' ? '1' : f.value + '1'
      break
    case 'operation':
      next.operation = f.operation === 'CALL' ? 'DELEGATECALL' : 'CALL'
      break
    case 'data':
      next.data = f.data + '00'
      break
    case 'nonce':
      next.nonce = String(Number(f.nonce) + 1)
      break
  }
  const short = (s: string) => (s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s || '(empty)')
  return { fields: next, from: short(f[which]), to: short(next[which]) }
}

export interface DigestView {
  fields: DigestFields
  digest: string
  approvedDigest: string
  attestation: (Attestation & { digest: string }) | null
  matches: boolean
}

export function digestView(ref: RunRef): DigestView {
  const def = ref.kind === 'scenario' ? SCENARIOS.find((s) => s.id === ref.id)! : BREAKS.find((b) => b.id === ref.id)!
  const fields = digestFields(def.payload)
  const digest = safeTxDigest(fields)
  const approvedDigest = safeTxDigest(digestFields(def.approved ?? def.payload))
  return {
    fields,
    digest,
    approvedDigest,
    attestation: def.attestation ? { ...def.attestation, digest: approvedDigest } : null,
    matches: digest === approvedDigest,
  }
}

export const mismatchSelector = () => mockSelector('DigestMismatch')

/* ---------- trace ---------- */

const lastTrace = (events: SceneEvent[] | undefined): TraceLine[] | null => [...(events ?? [])].reverse().find((e) => e.trace)?.trace ?? null

export function traceCompare(ref: RunRef): { guarded: TraceLine[] | null; unguarded: TraceLine[] | null } {
  if (ref.kind === 'scenario') {
    const def = SCENARIOS.find((s) => s.id === ref.id)!
    return { guarded: lastTrace(def.guarded), unguarded: lastTrace(def.unguarded) }
  }
  const def = BREAKS.find((b) => b.id === ref.id)!
  return { guarded: lastTrace(def.events), unguarded: lastTrace(def.unguarded) }
}

/* ---------- reproduce ---------- */

export interface CastCommand {
  label: string
  cmd: string
}
export function castCommands(r: Receipt): CastCommand[] {
  if (r.source !== 'chain' || !r.txHash || r.blockNumber === undefined) return []
  const tx = r.txHash
  const rpc = `--rpc-url ${CHAIN.rpcUrl}`
  return [
    { label: 'Receipt', cmd: `cast receipt ${tx} ${rpc}` },
    { label: 'Re-run the trace', cmd: `cast run ${tx} ${rpc}` },
    { label: 'Read storage slot 0', cmd: `cast storage ${CHAIN.vaultAddress} ${CHAIN.slotZero} --block ${r.blockNumber} ${rpc}` },
  ]
}
