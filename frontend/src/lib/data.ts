import type { ScenarioId, VerifierId } from './types'

export const VAULT_TOTAL = 2480
export const TRANSFER_AMOUNT = 0.1

/* Deterministic mock hashes: synthetic values, not real keccak output. */
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

export function fakeHex(seed: string, bytes: number): string {
  const next = xmur3(seed)
  let out = ''
  while (out.length < bytes * 2) out += next().toString(16).padStart(8, '0')
  return out.slice(0, bytes * 2)
}
export const fakeHash = (seed: string) => `0x${fakeHex(seed, 32)}`

/** 0x4A9c3f…71B2 style truncation. */
export function short(hash: string, head = 6, tail = 4) {
  return `${hash.slice(0, 2 + head)}…${hash.slice(-tail)}`
}

const word = (hex: string) => hex.replace(/^0x/, '').padStart(64, '0')
const addr = (hex: string) => hex.replace(/^0x/, '').padStart(64, '0')
const padRight = (hex: string) => hex.padEnd(Math.ceil(hex.length / 64) * 64, '0')

export const ADDRESSES = {
  vault: '0x4A9c3f81d2E07b6c95A14d03Fe28b7C0a1D971B2',
  coldWallet: '0x71C7656EC7ab88b098defB751B7401B5f6d8e4A1',
  malicious: '0xBAD0c0de5a7e1f3b9d2c48E6a07f19d3bC905e1c',
  attacker: '0x9f3A22b7d41cE05a8Bb6D3c9017e5fA2c4D0c1d0',
  mixer: '0xD00D5eAf19c3B2e7a840F6cC31b9d2E04a7F4e21',
}

const SAFE_EXEC = '6a761202'

function buildCalldata(opts: { to: string; valueHex: string; operation: 0 | 1; data: string; seed: string }) {
  const dataBytes = opts.data.replace(/^0x/, '')
  const dataLen = dataBytes.length / 2
  const dataPadded = padRight(dataBytes)
  const sigOffset = 0x140 + 32 + dataPadded.length / 2
  const sigs = fakeHex(opts.seed + '-sigs', 65) + fakeHex(opts.seed + '-sigs2', 65)
  const words = [
    addr(opts.to),
    word(opts.valueHex),
    word('140'),
    word(opts.operation.toString(16)),
    word('0'),
    word('0'),
    word('0'),
    word('0'),
    word('0'),
    word(sigOffset.toString(16)),
    word(dataLen.toString(16)),
  ]
  const tail = [dataPadded, word((130).toString(16)), padRight(sigs)]
  const body = words.join('') + tail.join('')
  const chunks = body.match(/.{1,64}/g) ?? []
  return { selector: `0x${SAFE_EXEC}`, words: chunks, hex: `0x${SAFE_EXEC}${body}` }
}

export interface TxFixture {
  id: string
  label: string
  to: string
  toLabel: string
  valueEth: number
  operation: 'CALL' | 'DELEGATECALL'
  signature: string
  args: string
  effects: string[]
  calldata: { selector: string; words: string[]; hex: string }
  txHash: string
  claimedIntentHash: string
  computedIntentHash: string
}

const attackCalldata = buildCalldata({
  to: ADDRESSES.malicious,
  valueHex: '0',
  operation: 1,
  data: `0x3659cfe6${addr(ADDRESSES.malicious)}`,
  seed: 'attack',
})
const legitCalldata = buildCalldata({
  to: ADDRESSES.coldWallet,
  valueHex: '16345785d8a0000',
  operation: 0,
  data: '0x',
  seed: 'legit',
})

const claimed = fakeHash('intent:transfer-0.1-eth-cold-wallet')
// Same prefix, different tail: the point of the diff view is that near-matches are still mismatches.
const attackComputed = claimed.slice(0, 18) + fakeHash('intent:delegatecall-upgrade').slice(18)

export const TX: Record<'attack' | 'legit', TxFixture> = {
  attack: {
    id: 'proposal #0412',
    label: 'Proposal #0412',
    to: ADDRESSES.malicious,
    toLabel: 'unknown contract, unverified source',
    valueEth: 0,
    operation: 'DELEGATECALL',
    signature: 'upgradeTo(address newImplementation)',
    args: `newImplementation = ${ADDRESSES.malicious}`,
    effects: [
      'storage write: EIP-1967 implementation slot (0x3608…2bbc)',
      'storage write: owner set replaced, 3 signers to 1',
      'sweep(address) becomes callable by 0x9f3A…c1d0',
    ],
    calldata: attackCalldata,
    txHash: fakeHash('tx:attack'),
    claimedIntentHash: claimed,
    computedIntentHash: attackComputed,
  },
  legit: {
    id: 'proposal #0413',
    label: 'Proposal #0413',
    to: ADDRESSES.coldWallet,
    toLabel: 'cold wallet, on allowlist',
    valueEth: TRANSFER_AMOUNT,
    operation: 'CALL',
    signature: '(plain value transfer, empty calldata)',
    args: 'value = 0.1 ETH',
    effects: ['balance: vault -0.1 ETH, cold wallet +0.1 ETH', 'storage writes: none', 'delegatecall: none'],
    calldata: legitCalldata,
    txHash: fakeHash('tx:legit'),
    claimedIntentHash: claimed,
    computedIntentHash: claimed,
  },
}

export const txFor = (scenario: ScenarioId): TxFixture => (scenario === 'legit' ? TX.legit : TX.attack)

export interface VerifierProfile {
  id: VerifierId
  name: string
  device: string
  operator: string
  city: string
  keyFingerprint: string
  decoder: string
}

export const VERIFIERS: VerifierProfile[] = [
  {
    id: 'A',
    name: 'Verifier A',
    device: 'Air-gapped laptop',
    operator: 'Independent auditor',
    city: 'Zürich',
    keyFingerprint: 'SHA256:9fK2vQ…Lq4w',
    decoder: 'Raw calldata, local ABI decoder',
  },
  {
    id: 'B',
    name: 'Verifier B',
    device: 'Hardware security token',
    operator: 'Custody partner',
    city: 'Singapore',
    keyFingerprint: 'SHA256:T7mXa0…c9Rb',
    decoder: 'Raw calldata, local fork simulation',
  },
  {
    id: 'C',
    name: 'Verifier C',
    device: 'Cloud enclave (TEE)',
    operator: 'Protocol team',
    city: 'São Paulo',
    keyFingerprint: 'SHA256:hB3eWp…2YdN',
    decoder: 'Raw calldata, hosted decoder',
  },
]

export const attestationHash = (id: VerifierId, scenario: ScenarioId) => fakeHash(`att:${id}:${scenario}`)

export const mismatchHash = (id: VerifierId) => fakeHash(`computed:${id}:attack`)

/* ---------- Evidence (synthetic) ---------- */

export type FixtureCategory = 'UI spoof' | 'Signer device' | 'Verifier set' | 'Guard logic' | 'Legitimate'
export interface EvidenceRow {
  id: string
  name: string
  category: FixtureCategory
  expected: 'Revert' | 'Execute'
  result: 'Pass' | 'Fail'
  note?: string
}

export const EVIDENCE: EvidenceRow[] = [
  { id: 'FX-001', name: 'Delegatecall hidden behind "Transfer 0.1 ETH"', category: 'UI spoof', expected: 'Revert', result: 'Pass' },
  { id: 'FX-002', name: 'Proxy upgrade disguised as token approval', category: 'UI spoof', expected: 'Revert', result: 'Pass' },
  { id: 'FX-003', name: 'Owner swap inside batched multicall', category: 'UI spoof', expected: 'Revert', result: 'Pass' },
  { id: 'FX-004', name: 'Signer device renders stale calldata', category: 'Signer device', expected: 'Revert', result: 'Pass' },
  { id: 'FX-005', name: 'Blind-signed hash replayed on second wallet', category: 'Signer device', expected: 'Revert', result: 'Pass' },
  { id: 'FX-006', name: 'One verifier compromised, two honest', category: 'Verifier set', expected: 'Revert', result: 'Pass' },
  { id: 'FX-007', name: 'Two verifiers collude on a malicious intent', category: 'Verifier set', expected: 'Revert', result: 'Fail', note: 'Accepted risk, see threat model' },
  { id: 'FX-008', name: 'Attestation submitted after expiry window', category: 'Verifier set', expected: 'Revert', result: 'Pass' },
  { id: 'FX-009', name: 'Direct execute() call that skips the timelock', category: 'Guard logic', expected: 'Revert', result: 'Pass' },
  { id: 'FX-010', name: 'Truncated intentHash collision attempt', category: 'Guard logic', expected: 'Revert', result: 'Pass' },
  { id: 'FX-011', name: '0.1 ETH to allowlisted cold wallet', category: 'Legitimate', expected: 'Execute', result: 'Pass' },
  { id: 'FX-012', name: 'Owner rotation with 3 of 3 attestations', category: 'Legitimate', expected: 'Execute', result: 'Pass' },
  { id: 'FX-013', name: 'Batched payroll, 12 recipients', category: 'Legitimate', expected: 'Execute', result: 'Pass' },
]

export const SYNTHETIC_LABEL = 'SYNTHETIC DEMO DATA - replace with real test output'

/* ---------- Threat model ---------- */

export interface ThreatRow {
  id: string
  title: string
  vector: string
  prevented?: string
  detected?: string
  accepted?: string
}

export const THREATS: ThreatRow[] = [
  {
    id: 'ui',
    title: 'UI',
    vector: 'Front-end or browser extension shows a harmless summary of a malicious transaction.',
    prevented: 'Verifiers decode raw calldata and refuse to attest to a different intent.',
    detected: 'Every mismatch is logged with both hashes for offline review.',
  },
  {
    id: 'signer',
    title: 'Signer device',
    vector: 'A signer approves on a compromised or blind-signing device.',
    prevented: 'One bad approval cannot execute without 2 of 3 independent attestations.',
    accepted: 'A signer who knowingly approves a harmful intent is out of scope.',
  },
  {
    id: 'verifier',
    title: 'Verifier set',
    vector: 'One or more verifier keys or decoders are compromised.',
    prevented: 'A single compromised verifier cannot reach the 2-of-3 threshold.',
    detected: 'Disagreement between verifiers is public and triggers the timelock.',
    accepted: 'Collusion of two or more verifiers defeats the guard.',
  },
  {
    id: 'guard',
    title: 'Guard bug',
    vector: 'A flaw in the guard contract or its intentHash logic.',
    detected: 'The timelock gives owners a window to pause and review high-risk calls.',
    accepted: 'Residual smart-contract risk until an external audit is complete.',
  },
]
