/**
 * All copy and scene parameters for the act-switcher, Act 1 (Attack) and Act 3 (Proof).
 * Components render this file; they hold no content of their own.
 * Captions in Act 1 are capped at 12 words (checked by scripts/check-workbench.mjs).
 */

import type { FixtureKind, Outcome } from './fixtureTypes'

export type ActId = 'attack' | 'defense' | 'proof' | 'future'

export const SHELL = {
  tablistLabel: 'Workbench acts',
  backLabel: 'Back to demo',
  badges: ['SYNTHETIC SCENE', 'MOCK DATA · NO TRANSACTIONS SENT'],
  acts: [
    { id: 'attack', label: '1 Attack' },
    { id: 'defense', label: '2 Defense' },
    { id: 'proof', label: '3 Proof' },
    { id: 'future', label: '4 Future' },
  ] as { id: ActId; label: string }[],
  /** acts that show the persistent data-notice strip (Act 2 carries its own badges) */
  noticeActs: ['attack', 'proof'] as ActId[],
  loading: 'Loading…',
}

/* ---------- Act 1: Attack ---------- */

const pad64 = (h: string) => h.padStart(64, '0')

export interface AttackScene {
  /** parcel position on the belt, in scene units */
  parcelX: number
  parcelOpacity: number
  /** shell turns transparent under the X-ray */
  xray: boolean
  /** scanner beam sweeping */
  scanning: boolean
  crowbar: boolean
  hex: boolean
  pointer: 'home' | 'attacker'
  balance: number
  /** viewport window used on narrow screens: { x, w } in scene units */
  focus: { x: number; w: number }
}

export const ATTACK = {
  eyebrow: 'Act 1 · Attack',
  title: 'Customs for transactions',
  intro: 'A parcel that looks harmless gets waved through. Watch what it carries.',
  stageLabel: 'Animated scene: a parcel is scanned and then drains a vault.',
  scene: { w: 1280, h: 560, view: { y: 40, h: 470 } },
  parcel: {
    labelLines: ['Transfer 0.1 ETH', 'to cold wallet'],
    label: 'Transfer 0.1 ETH to cold wallet',
    tag: 'UNTRUSTED',
  },
  scanner: { label: 'X-RAY' },
  crowbar: { label: 'DELEGATECALL', arrow: '→', target: '0xBAD0…5e1c' },
  hex: {
    title: 'Raw payload',
    placeholder: 'The hex strip appears once the parcel is scanned.',
    segments: [
      { label: 'selector', hex: 'a9059cbb', kind: 'selector' },
      { label: 'to', hex: pad64('bad0c0de5a7e1f3b9d2c48e6a07f19d3bc905e1c'), kind: 'arg' },
      { label: 'value', hex: pad64('016345785d8a0000'), kind: 'arg' },
      { label: 'operation', hex: pad64('01'), kind: 'operation' },
    ] as { label: string; hex: string; kind: 'selector' | 'arg' | 'operation' }[],
    callouts: [
      { kind: 'selector', term: 'selector a9059cbb', note: 'looks like ERC-20 transfer()' },
      { kind: 'operation', term: 'operation = 1', note: 'DELEGATECALL: attacker code runs inside the vault' },
    ] as { kind: 'selector' | 'operation'; term: string; note: string }[],
  },
  vault: {
    title: 'VAULT',
    noGuard: 'NO GUARD',
    brainLabel: 'implementation pointer',
    logic: { label: 'vault logic', value: '0x1A2B…c0de' },
    attacker: { label: 'attacker', value: '0xBAD0…5e1c' },
    balanceLabel: 'vault balance',
    unit: 'ETH',
    synthetic: 'SYNTHETIC SCENE',
    drainMs: 2600,
  },
  controls: {
    group: 'Act 1 controls',
    next: 'Next',
    back: 'Back',
    replay: 'Replay',
    toDefense: 'See the Defense',
    step: 'Step {n} of {d}',
  },
  steps: [
    {
      caption: 'A parcel arrives. Its label says: transfer 0.1 ETH.',
      scene: { parcelX: 130, parcelOpacity: 1, xray: false, scanning: false, crowbar: false, hex: false, pointer: 'home', balance: 10, focus: { x: 0, w: 660 } },
    },
    {
      caption: 'The X-ray scanner opens the parcel. Something is inside.',
      scene: { parcelX: 440, parcelOpacity: 1, xray: true, scanning: true, crowbar: true, hex: false, pointer: 'home', balance: 10, focus: { x: 120, w: 640 } },
    },
    {
      caption: 'Inside: a DELEGATECALL to an unknown contract, disguised as transfer().',
      scene: { parcelX: 440, parcelOpacity: 1, xray: true, scanning: false, crowbar: true, hex: true, pointer: 'home', balance: 10, focus: { x: 120, w: 640 } },
    },
    {
      caption: "Nothing stops it. The vault's implementation pointer is rewired.",
      scene: { parcelX: 760, parcelOpacity: 0, xray: true, scanning: false, crowbar: true, hex: true, pointer: 'attacker', balance: 10, focus: { x: 700, w: 580 } },
    },
    {
      caption: 'Balance falls from 10.000 to 0.000 ETH. The screen lied.',
      scene: { parcelX: 760, parcelOpacity: 0, xray: true, scanning: false, crowbar: true, hex: true, pointer: 'attacker', balance: 0, focus: { x: 700, w: 580 } },
    },
  ] as { caption: string; scene: AttackScene }[],
}

export const fill = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))

/* ---------- Act 3: Proof ---------- */


export type OutcomeIcon = 'circle-check' | 'octagon-x' | 'triangle-alert' | 'hourglass' | 'timer' | 'lock'

/**
 * One map controls tile color and shape. Icons differ in silhouette, so color is never the only signal.
 * Note: PENDING and TIMELOCKED use warm neutral and rose to stay inside the app's no-blue, no-purple palette.
 * To use blue and purple instead, change only the two `color` values below.
 */
export const OUTCOME_STYLE: Record<Outcome, { label: string; color: string; icon: OutcomeIcon }> = {
  EXECUTED: { label: 'Executed', color: '#7ACB8A', icon: 'circle-check' },
  BLOCKED: { label: 'Blocked', color: '#FF3B30', icon: 'octagon-x' },
  QUARANTINED: { label: 'Quarantined', color: '#E3A73B', icon: 'triangle-alert' },
  PENDING: { label: 'Pending', color: '#E8DCC4', icon: 'hourglass' },
  TIMELOCKED: { label: 'Timelocked', color: '#E58AA8', icon: 'timer' },
  FAIL_CLOSED: { label: 'Fail closed', color: '#9a9082', icon: 'lock' },
}

export interface CounterDef {
  kind: FixtureKind
  outcomes: Outcome[]
  template: string
}
export interface FilterDef {
  id: string
  label: string
  critical?: boolean
  kind?: FixtureKind
}

export const PROOF = {
  eyebrow: 'Act 3 · Proof',
  title: 'The fixture wall',
  intro: 'Every tile is one test case. Color and shape both show what the guard did.',
  countersLabel: 'Computed counts',
  counters: [
    { kind: 'attack', outcomes: ['BLOCKED'], template: '{n} of {d} attack fixtures blocked' },
    { kind: 'benign', outcomes: ['EXECUTED'], template: '{n} of {d} benign fixtures executed' },
    { kind: 'unknown', outcomes: ['QUARANTINED', 'PENDING', 'TIMELOCKED', 'FAIL_CLOSED'], template: '{n} of {d} unknown fixtures held, not executed' },
    { kind: 'availability', outcomes: ['FAIL_CLOSED'], template: '{n} of {d} availability fixtures fail closed' },
  ] as CounterDef[],
  totalTemplate: '{d} fixtures in the wall, {c} marked critical',
  filtersLabel: 'Filter fixtures',
  filters: [
    { id: 'all', label: 'All' },
    { id: 'critical', label: 'Critical', critical: true },
    { id: 'attack', label: 'Attacks', kind: 'attack' },
    { id: 'benign', label: 'Benign', kind: 'benign' },
    { id: 'unknown', label: 'Unknown', kind: 'unknown' },
  ] as FilterDef[],
  wallLabel: 'Fixture wall',
  empty: 'No fixtures match this filter.',
  criticalTag: 'CRITICAL',
  criticalNote: 'A ring marks a critical fixture.',
  legendTitle: 'Outcome key',
  drawer: {
    close: 'Close details',
    kind: 'Kind',
    category: 'Category',
    outcome: 'Outcome',
    execution: 'Execution',
    executionYes: 'Succeeds',
    executionNo: 'Does not execute',
    setup: 'Setup',
    action: 'Action',
    decision: 'Decision',
    workflowStatus: 'Workflow status',
    expectedRevert: 'Expected revert (proposed)',
    noRevert: 'None. This fixture is not expected to revert.',
    assertions: 'Assertions',
  },
  footer: 'Illustrative scenarios only. Fixture outcomes are not execution evidence.',
  fits: {
    title: 'Where IntentLock fits',
    intro: 'Four approaches, grouped by what they do at signing or execution time.',
    footnote: 'Categories, not product claims.',
    columns: [
      { id: 'warn', title: 'Warn', line: 'Adds a risk label or plain-language summary before an owner signs.' },
      { id: 'simulate', title: 'Simulate', line: 'Predicts the effects of a transaction off-chain before it is signed.' },
      { id: 'single', title: 'Single-party enforce', line: 'One service or key can approve or stop a transaction at execution time.' },
      {
        id: 'intentlock',
        title: 'IntentLock',
        line: 'Enforcement at execution time, with these properties:',
        points: ['k-of-n independent verifiers', 'Open attestation schema', 'On-chain binding', 'Reproducible evidence'],
        highlight: true,
      },
    ] as { id: string; title: string; line: string; points?: string[]; highlight?: boolean }[],
  },
}
