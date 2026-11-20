import type {
  NodeId,
  PayloadFields,
  SceneEvent,
  RevertName,
  StateDiffRow,
  GuardCheck,
} from "../workbench/scenes";
import type { ReplayData, ReplayRunKey, ReplayRunData } from "./types";

export interface ReplaySceneConfig {
  runKey: ReplayRunKey;
  runData: ReplayRunData | null;
  replay: ReplayData | null;
  payload: PayloadFields;
  events: SceneEvent[];
  badges: readonly string[];
  slot0Before: string;
  slot0After: string;
  blockNumber?: number;
  txHash: string;
  reportedLabel: string;
  reportedTag: string;
  gateLaser: boolean;
  gateRevert?: { name: RevertName; selector: string; args: string[] };
}

const NOT_CAPTURED = "not captured";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function eventNode(
  type: string,
  payload: Record<string, unknown>,
  verifierOrdinal: number,
): NodeId {
  if (type === "proposal.created") return "proposal";
  if (type === "decode.started" || type === "decode.completed" || type === "policy.evaluated")
    return "payload";
  if (type === "verifier.responded")
    return (["verifierA", "verifierB", "verifierC"] as const)[verifierOrdinal] ?? "registry";
  if (type === "attestation.threshold_met" || type.startsWith("timelock.")) return "registry";
  if (
    type.startsWith("guard.") ||
    type === "safe.execution_submitted" ||
    type === "safe.execution_failed"
  )
    return "gate";
  if (type === "safe.execution_succeeded") return "vault";
  void payload;
  return "proposal";
}

function eventStatus(type: string, payload: Record<string, unknown>): SceneEvent["status"] {
  if (type === "guard.reverted" || type === "safe.execution_failed" || payload.result === "REFUSED")
    return "bad";
  if (
    type === "safe.execution_succeeded" ||
    type === "attestation.threshold_met" ||
    payload.result === "ATTESTED"
  )
    return "ok";
  if (type === "verifier.responded" && payload.result === "ERROR") return "warn";
  return "active";
}

function eventCaption(
  type: string,
  payload: Record<string, unknown>,
  sequence: number,
  transaction: Record<string, unknown> | null,
): string {
  const decision = asString(payload.decision);
  const revert = asString(payload.observedRevertName);
  const operation =
    transaction?.operation === 1 ? "DELEGATECALL" : transaction?.operation === 0 ? "CALL" : null;
  const data = asString(transaction?.data);
  const selector =
    asString(transaction?.selector) ?? (data && data.length >= 10 ? data.slice(0, 10) : null);
  if (type === "proposal.created") {
    const metadata = payload.declaredMetadata;
    const label =
      metadata && typeof metadata === "object"
        ? asString((metadata as Record<string, unknown>).label)
        : null;
    return label
      ? `Signers were shown: “${label}” · UNTRUSTED label.`
      : "Proposal details loaded from the saved replay.";
  }
  if (type === "decode.started")
    return `Inspecting saved Safe fields${operation ? ` · ${operation}` : ""}${selector ? ` · ${selector}` : ""}.`;
  if (type === "decode.completed") {
    const status = asString(payload.decodeStatus);
    return status && status !== "NOT_CAPTURED"
      ? `Decoder status: ${status}.`
      : "Decoder output was not captured in this artifact.";
  }
  if (type === "policy.evaluated" && decision) {
    const reason = asString(payload.reasonCode);
    return `Policy result: ${decision}${reason ? ` · ${reason}` : ""}.`;
  }
  if ((type === "guard.reverted" || type === "safe.execution_failed") && revert)
    return payload.slot0Preserved === true
      ? `Guard reverted: ${revert}. Slot 0 stayed unchanged.`
      : `Observed guard revert: ${revert}.`;
  if (type === "safe.execution_succeeded") {
    const block = typeof payload.blockNumber === "number" ? ` at block ${payload.blockNumber}` : "";
    return payload.masterCopyReplaced === true
      ? `Recorded execution succeeded${block}; Safe implementation slot changed.`
      : `Recorded Safe execution succeeded${block}.`;
  }
  if (type === "safe.execution_submitted") {
    const signatures =
      typeof payload.ownerSignatureCount === "number" ? payload.ownerSignatureCount : null;
    if (typeof payload.ownerSignatureSource === "string") {
      return `Forensic report: ${signatures ?? "not captured"} Bybit signers approved this Safe transaction.`;
    }
    return `Safe execution submitted${signatures === null ? "" : ` with ${signatures} owner signature${signatures === 1 ? "" : "s"}`}${payload.guardInstalled === false ? " · no guard installed" : ""}.`;
  }
  return `Step ${sequence}: ${type.replace(/\./g, " ")}.`;
}

function eventStage(type: string): SceneEvent["stage"] {
  if (type === "guard.reverted" || type === "safe.execution_failed") return "bounce";
  if (type === "safe.execution_succeeded") return "vault";
  if (type === "safe.execution_submitted") return "gate";
  if (type === "proposal.created") return "home";
  if (
    type.startsWith("decode.") ||
    type === "policy.evaluated" ||
    type === "verifier.responded" ||
    type === "attestation.threshold_met" ||
    type.startsWith("timelock.")
  )
    return "gate";
  return undefined;
}

function toSceneEvents(run: ReplayRunData): SceneEvent[] {
  let verifierOrdinal = 0;
  const proposal = run.events.find((event) => event.type === "proposal.created");
  const rawTransaction = proposal?.payload.rawTransaction;
  const transaction =
    rawTransaction && typeof rawTransaction === "object"
      ? (rawTransaction as Record<string, unknown>)
      : null;
  return (run.events ?? [])
    .slice()
    .sort((left, right) => left.sequence - right.sequence)
    .map((event) => {
      const payload = event.payload ?? {};
      const node = eventNode(event.type, payload, verifierOrdinal);
      if (event.type === "verifier.responded") verifierOrdinal += 1;
      const txHash = asString(event.transactionHash);
      const source =
        event.source === "recorded_chain_observation"
          ? "chain"
          : event.source === "foundry_fork_test"
            ? "simulation"
            : undefined;
      const observedRevert = asString(payload.observedRevertName);
      const revertSelector = asString(payload.revertSelector);
      const guardChecks = Array.isArray(payload.guardChecks)
        ? payload.guardChecks.flatMap((check): GuardCheck[] => {
            if (!check || typeof check !== "object") return [];
            const row = check as { name?: unknown; status?: unknown };
            if (typeof row.name !== "string") return [];
            const status: GuardCheck["status"] =
              row.status === "passed" || row.status === "pass"
                ? "pass"
                : row.status === "failed" || row.status === "fail"
                  ? "fail"
                  : "skipped";
            return [{ name: row.name, status }];
          })
        : undefined;
      const trace = Array.isArray(payload.trace)
        ? payload.trace.flatMap((line) => {
            if (!line || typeof line !== "object") return [];
            const item = line as { depth?: unknown; call?: unknown };
            return typeof item.depth === "number" && typeof item.call === "string"
              ? [{ depth: item.depth, call: item.call }]
              : [];
          })
        : undefined;
      const stateDiff: StateDiffRow[] = [];
      const slot0BeforeValue =
        asString(payload.slot0Before) ??
        (event.type === "guard.reverted" ? asString(run.slot0Before) : null);
      const slot0AfterValue =
        asString(payload.slot0After) ??
        (event.type === "guard.reverted" ? asString(run.slot0After) : null);
      if (slot0BeforeValue !== null || slot0AfterValue !== null) {
        stateDiff.push({
          field: "Storage slot 0 (Safe proxy)",
          before: slot0BeforeValue ?? NOT_CAPTURED,
          after: slot0AfterValue ?? NOT_CAPTURED,
        });
      }
      const revert = observedRevert
        ? {
            name: observedRevert as RevertName,
            selector: revertSelector ?? NOT_CAPTURED,
            args: [],
          }
        : undefined;
      const slot0Before = slot0BeforeValue;
      const slot0After = slot0AfterValue;
      const slot0Changed =
        slot0Before !== null && slot0After !== null && slot0Before !== slot0After;
      return {
        // Source timestamps are not per-event timings. Pace saved order for viewing.
        t: Math.max(0, event.sequence - 1) * REPLAY_STEP_MS,
        eventType: event.type,
        eventSource:
          typeof payload.ownerSignatureSource === "string" ? "forensic_report" : event.source,
        node,
        status: eventStatus(event.type, payload),
        label: eventCaption(event.type, payload, event.sequence, transaction),
        ...(eventStage(event.type) ? { stage: eventStage(event.type) } : {}),
        ...(event.fixtureId ? { fixtureId: event.fixtureId } : {}),
        ...(source ? { source } : {}),
        ...(txHash ? { txHash } : {}),
        ...(typeof payload.blockNumber === "number" ? { blockNumber: payload.blockNumber } : {}),
        ...(typeof payload.gasUsed === "number" ? { gasUsed: payload.gasUsed } : {}),
        ...(revert ? { revert, stamp: "revert" as const, blockOutcome: "reverted" as const } : {}),
        ...(slot0Changed ? { vault: { core: "bad" as const } } : {}),
        ...(event.type === "safe.execution_succeeded" && payload.receiptStatus === "SUCCESS"
          ? { stamp: "ok" as const, blockOutcome: "included" as const }
          : {}),
        ...(guardChecks ? { guardChecks } : {}),
        ...(trace?.length ? { trace } : {}),
        ...(stateDiff.length ? { stateDiff } : {}),
      };
    });
}

export const REPLAY_STEP_MS = 3000;
export const REPLAY_TAIL_MS = 2500;

export function replayDurationMs(events: readonly SceneEvent[]): number {
  return events.length ? events[events.length - 1].t + REPLAY_TAIL_MS : 1200;
}

export function adaptReplayToScene(
  replay: ReplayData | null,
  runKey: ReplayRunKey = "runC",
): ReplaySceneConfig {
  const runData = replay?.runs?.[runKey] ?? null;
  const proposalEvent = runData?.events.find((event) => event.type === "proposal.created");
  const rawTransaction = proposalEvent?.payload.rawTransaction;
  const tx =
    rawTransaction && typeof rawTransaction === "object"
      ? (rawTransaction as Record<string, unknown>)
      : null;
  const reportedMetadata = proposalEvent?.payload.declaredMetadata;
  const reportedLabel =
    reportedMetadata && typeof reportedMetadata === "object"
      ? asString((reportedMetadata as Record<string, unknown>).label)
      : null;
  const operationNumber = typeof tx?.operation === "number" ? tx.operation : null;
  const operation =
    operationNumber === 0 ? "CALL" : operationNumber === 1 ? "DELEGATECALL" : NOT_CAPTURED;
  const data = asString(tx?.data) ?? "";
  const target = asString(tx?.to) ?? NOT_CAPTURED;
  const value = asString(tx?.value) ?? NOT_CAPTURED;
  const selector = data.length >= 10 ? data.slice(0, 10) : NOT_CAPTURED;
  const nonceValue = tx?.safeNonce ?? tx?.nonce;
  const nonce =
    typeof nonceValue === "number"
      ? nonceValue
      : typeof nonceValue === "string" &&
          /^\d+$/.test(nonceValue) &&
          Number.isSafeInteger(Number(nonceValue))
        ? Number(nonceValue)
        : null;
  const payload: PayloadFields = {
    operation: operation === "not captured" ? "not captured" : operation,
    to: target,
    value: value === NOT_CAPTURED ? NOT_CAPTURED : `${value} wei`,
    data: selector !== NOT_CAPTURED ? `${selector} · ${operation}` : NOT_CAPTURED,
    decodedIntent: reportedLabel ? `Reported label (untrusted): ${reportedLabel}` : NOT_CAPTURED,
    raw: {
      toFull: target,
      valueWeiHex: /^\d+$/.test(value) ? `0x${BigInt(value).toString(16)}` : NOT_CAPTURED,
      dataHex: data || NOT_CAPTURED,
      nonce,
    },
  };
  const events = runData ? toSceneEvents(runData) : [];
  const observedRevert = runData?.observedRevertName;
  const revertSelector = runData?.revertSelector;
  return {
    runKey,
    runData,
    replay,
    payload,
    events,
    badges: replay?.disclaimer
      ? [
          replay.disclaimer,
          "PACED WALKTHROUGH · SAVED EVENT ORDER",
          runKey === "runA"
            ? "RECORDED BYBIT TRANSACTION"
            : "FOUNDRY FORK TEST · NO MINED TRANSACTION RECEIPT",
        ]
      : [],
    slot0Before: runData?.slot0Before ?? NOT_CAPTURED,
    slot0After: runData?.slot0After ?? NOT_CAPTURED,
    txHash: events.find((event) => event.txHash)?.txHash ?? NOT_CAPTURED,
    reportedLabel,
    reportedTag:
      reportedMetadata && typeof reportedMetadata === "object"
        ? (asString((reportedMetadata as Record<string, unknown>).tag) ?? "UNTRUSTED")
        : "UNTRUSTED",
    gateLaser: operationNumber === 1,
    ...(observedRevert
      ? {
          gateRevert: {
            name: observedRevert as RevertName,
            selector: revertSelector ?? NOT_CAPTURED,
            args: [],
          },
        }
      : {}),
  };
}
