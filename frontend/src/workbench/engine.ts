import {
  BREAKS,
  GUARD_NODES,
  IDLE_CAPTION,
  REGISTRY,
  SCENARIOS,
  VAULT,
  type BlockOutcome,
  type GuardCheck,
  type Mode,
  type NodeId,
  type PayloadFields,
  type PayloadStage,
  type RevertInfo,
  type RevertName,
  type RunRef,
  type SceneEvent,
  type Source,
  type StampKind,
  type StateDiffRow,
  type Status,
  type TraceLine,
  type VaultCore,
  DEFAULT_SOURCE,
} from "./scenes";

const NODE_IDS: NodeId[] = [
  "proposal",
  "payload",
  "verifierA",
  "verifierB",
  "verifierC",
  "registry",
  "gate",
  "vault",
];
export const VERIFIER_IDS: NodeId[] = ["verifierA", "verifierB", "verifierC"];

export interface ResolvedRun {
  payload: PayloadFields;
  events: SceneEvent[];
  durationMs: number;
  label: string;
}

export function resolveRun(ref: RunRef, mode: Mode): ResolvedRun {
  if (ref.kind === "scenario") {
    const def = SCENARIOS.find((s) => s.id === ref.id)!;
    const events = mode === "guarded" ? def.guarded : def.unguarded;
    return { payload: def.payload, events, durationMs: endOf(events), label: def.label };
  }
  const def = BREAKS.find((b) => b.id === ref.id)!;
  return {
    payload: def.payload,
    events: def.events,
    durationMs: endOf(def.events),
    label: def.label,
  };
}

const endOf = (events: SceneEvent[]) => (events.length ? events[events.length - 1].t + 1500 : 0);

/** The revert name and fixture badge a run will end with, read straight from the data. */
export function outcomeOf(ref: RunRef, mode: Mode): { revert?: RevertName; fixtureId?: string } {
  const last = [...resolveRun(ref, mode).events].reverse().find((ev) => ev.revert || ev.fixtureId);
  return { revert: last?.revert?.name, fixtureId: last?.fixtureId };
}

/** Everything the chain reports about the transaction once it has landed in a block. */
export interface Receipt {
  landed: boolean;
  source: Source;
  txHash?: string;
  blockNumber?: number;
  gasUsed?: number;
  outcome: BlockOutcome | null;
  revert?: RevertInfo;
  checks: GuardCheck[] | null;
  trace: TraceLine[] | null;
  stateDiff: StateDiffRow[] | null;
}

export interface Derived {
  status: Record<NodeId, Status>;
  caption: string;
  stage: PayloadStage;
  vault: { balance: number | null; core: VaultCore };
  stamp: StampKind | null;
  result: { revert?: RevertName; fixtureId?: string } | null;
  receipt: Receipt;
  attested: number;
  needed: number;
}

interface Anim {
  from: number;
  to: number;
  start: number;
  ms: number;
}
const valueAt = (a: Anim, t: number) =>
  a.ms <= 0 ? a.to : a.from + (a.to - a.from) * Math.min(1, Math.max(0, (t - a.start) / a.ms));

/** Pure: (run, mode, elapsed) -> everything the scene shows. elapsed < 0 means "not started". */
export function deriveRun(ref: RunRef, mode: Mode, elapsedMs: number): Derived {
  const run = resolveRun(ref, mode);
  const status = Object.fromEntries(NODE_IDS.map((n) => [n, "idle"])) as Record<NodeId, Status>;
  if (mode === "unguarded" && ref.kind === "scenario")
    for (const n of GUARD_NODES) status[n] = "off";

  let caption = IDLE_CAPTION;
  let stage: PayloadStage = "home";
  let core: VaultCore = "good";
  let stamp: StampKind | null = null;
  let result: Derived["result"] = null;
  let bal: number | null = VAULT.startBalance;
  let anim: Anim | null = null;
  const receipt: Receipt = {
    landed: false,
    source: DEFAULT_SOURCE,
    outcome: null,
    checks: null,
    trace: null,
    stateDiff: null,
  };

  if (elapsedMs >= 0) {
    for (const ev of run.events) {
      if (ev.t > elapsedMs) break;
      status[ev.node] = ev.status;
      caption = ev.label;
      if (ev.stage) stage = ev.stage;
      if (ev.stamp) stamp = ev.stamp;
      if (ev.revert || ev.fixtureId) result = { revert: ev.revert?.name, fixtureId: ev.fixtureId };
      if (ev.txHash) {
        receipt.landed = true;
        receipt.txHash = ev.txHash;
        receipt.blockNumber = ev.blockNumber;
        receipt.gasUsed = ev.gasUsed;
        receipt.source = ev.source ?? DEFAULT_SOURCE;
        receipt.outcome = ev.blockOutcome ?? null;
        receipt.revert = ev.revert;
        receipt.checks = ev.guardChecks ?? null;
        receipt.trace = ev.trace ?? null;
        receipt.stateDiff = ev.stateDiff ?? null;
      }
      if (ev.vault) {
        if (anim && bal !== null) bal = valueAt(anim, ev.t);
        if (ev.vault.balance !== undefined) {
          const from: number = bal ?? ev.vault.balance;
          anim = { from, to: ev.vault.balance, start: ev.t, ms: ev.vault.ms ?? 0 };
          bal = from;
        }
        if (ev.vault.core) core = ev.vault.core;
      }
    }
  }
  const balance = anim ? valueAt(anim, elapsedMs) : bal;
  const attested = VERIFIER_IDS.filter((v) => status[v] === "ok").length;
  return {
    status,
    caption,
    stage,
    vault: { balance: balance === null ? null : Math.max(0, balance), core },
    stamp,
    result,
    receipt,
    attested,
    needed: REGISTRY.needed,
  };
}

export function deriveCustomRun(events: SceneEvent[], mode: Mode, elapsedMs: number): Derived {
  const status = Object.fromEntries(NODE_IDS.map((n) => [n, "idle"])) as Record<NodeId, Status>;
  if (mode === "unguarded") for (const n of GUARD_NODES) status[n] = "off";

  let caption = IDLE_CAPTION;
  let stage: PayloadStage = "home";
  let core: VaultCore = "good";
  let stamp: StampKind | null = null;
  let result: Derived["result"] = null;
  let bal: number | null = null;
  let anim: Anim | null = null;
  const receipt: Receipt = {
    landed: false,
    source: DEFAULT_SOURCE,
    outcome: null,
    checks: null,
    trace: null,
    stateDiff: null,
  };

  if (elapsedMs >= 0) {
    for (const ev of events) {
      if (ev.t > elapsedMs) break;
      status[ev.node] = ev.status;
      caption = ev.label;
      if (ev.stage) stage = ev.stage;
      if (ev.stamp) stamp = ev.stamp;
      if (ev.revert || ev.fixtureId) result = { revert: ev.revert?.name, fixtureId: ev.fixtureId };
      if (ev.txHash) {
        receipt.landed = true;
        receipt.txHash = ev.txHash;
        receipt.blockNumber = ev.blockNumber;
        receipt.gasUsed = ev.gasUsed;
        receipt.source = ev.source ?? receipt.source;
        receipt.outcome = ev.blockOutcome ?? null;
        receipt.revert = ev.revert;
        receipt.checks = ev.guardChecks ?? null;
        receipt.trace = ev.trace ?? null;
        receipt.stateDiff = ev.stateDiff ?? null;
      }
      if (ev.source) receipt.source = ev.source;
      if (ev.blockOutcome) receipt.outcome = ev.blockOutcome;
      if (ev.revert) receipt.revert = ev.revert;
      if (ev.guardChecks) receipt.checks = ev.guardChecks;
      if (ev.trace) receipt.trace = ev.trace;
      if (ev.stateDiff) receipt.stateDiff = ev.stateDiff;
      if (ev.vault) {
        if (anim && bal !== null) bal = valueAt(anim, ev.t);
        if (ev.vault.balance !== undefined) {
          const from: number = bal ?? ev.vault.balance;
          anim = { from, to: ev.vault.balance, start: ev.t, ms: ev.vault.ms ?? 0 };
          bal = from;
        }
        if (ev.vault.core) core = ev.vault.core;
      }
    }
  }
  const balance = anim ? valueAt(anim, elapsedMs) : bal;
  const attested = VERIFIER_IDS.filter((v) => status[v] === "ok").length;
  return {
    status,
    caption,
    stage,
    vault: { balance: balance === null ? null : Math.max(0, balance), core },
    stamp,
    result,
    receipt,
    attested,
    needed: REGISTRY.needed,
  };
}
