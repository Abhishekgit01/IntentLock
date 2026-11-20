import { useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Copy,
  Download,
  ExternalLink,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  X,
} from "lucide-react";
import { outcomeOf } from "./engine";
import {
  BREAKS,
  INFO_HINT,
  NODE_INFO,
  SCENARIOS,
  STAMP_TEXT,
  TOUR,
  type BreakId,
  type NodeId,
  type ScenarioId,
} from "./scenes";
import type { Workbench } from "./useWorkbench";
import type { ReplayRunKey } from "../replay";

const NODE_ORDER: NodeId[] = [
  "proposal",
  "payload",
  "verifierA",
  "verifierB",
  "verifierC",
  "registry",
  "gate",
  "vault",
];

const eyebrow = "font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#a89f90]";
const chip = "rounded border px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider";

function formatWei(value: string | null) {
  if (value === null) return "—";
  const wei = BigInt(value);
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""} ETH`;
}

function shortHash(value: string | null | undefined) {
  return value ? `${value.slice(0, 10)}…${value.slice(-8)}` : "—";
}

export function Panel({ wb }: { wb: Workbench }) {
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedRpcIndex, setCopiedRpcIndex] = useState<number | null>(null);
  const [safeSignatures, setSafeSignatures] = useState("");
  const [rawTransactionJson, setRawTransactionJson] = useState("");
  const [liveInputError, setLiveInputError] = useState<string | null>(null);
  const guarded = wb.mode === "guarded";
  const running = wb.runStatus === "running";
  const pct = wb.runStatus === "idle" ? 0 : Math.min(100, (wb.elapsedMs / wb.durationMs) * 100);
  const activeScenario = wb.ref.kind === "scenario" ? wb.ref.id : null;
  const d = wb.derived;

  function handleDownloadRunJson() {
    window.open("/run.json", "_blank");
  }

  function handleAnalyzeLive() {
    try {
      const parsed: unknown = JSON.parse(rawTransactionJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Paste a JSON object containing raw Safe transaction fields.");
      }
      const record = parsed as Record<string, unknown>;
      const transaction =
        record.transaction && typeof record.transaction === "object"
          ? (record.transaction as Record<string, unknown>)
          : record;
      setLiveInputError(null);
      void wb.analyzeLive(transaction);
    } catch (error) {
      setLiveInputError(error instanceof Error ? error.message : "Invalid transaction JSON.");
    }
  }

  function handleCopyScript() {
    const cmd =
      wb.replayData?.reproduceScript ||
      "export $(cat .env.local | xargs) && forge test --match-contract BybitReplaySliceTest -vvv";
    navigator.clipboard.writeText(cmd);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  }

  function handleCopyRpc(idx: number, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedRpcIndex(idx);
    setTimeout(() => setCopiedRpcIndex(null), 2000);
  }

  function onTabKey(e: KeyboardEvent, i: number) {
    const last = SCENARIOS.length - 1;
    const next =
      e.key === "ArrowRight"
        ? i === last
          ? 0
          : i + 1
        : e.key === "ArrowLeft"
          ? i === 0
            ? last
            : i - 1
          : null;
    if (next === null) return;
    e.preventDefault();
    const id = SCENARIOS[next].id;
    wb.chooseScenario(id);
    tabs.current[id]?.focus();
  }

  const info = wb.selected ? NODE_INFO[wb.selected] : null;

  return (
    <div className="flex flex-col gap-7 p-5 pb-10 text-[#F5EEDF] lg:p-6">
      <header>
        <p className={eyebrow}>Deep dive</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold uppercase leading-none tracking-tight">
          Intent workbench
        </h1>
        <p className="mt-2 text-sm text-[#a89f90]">
          Same payload, two wallets. Flip the guard and watch what changes.
        </p>
      </header>

      {/* Bybit Exploit Replay Run Switcher */}
      <section aria-labelledby="wb-replay-runs">
        <div className="flex items-center justify-between">
          <h2 id="wb-replay-runs" className={eyebrow}>
            Replay · Mainnet fork
          </h2>
          <span className="rounded border border-[#7ACB8A]/40 bg-[#7ACB8A]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-[#7ACB8A]">
            {wb.replayData?.forkBlock.number
              ? `LOCAL FORK · BLOCK #${wb.replayData.forkBlock.number.toLocaleString("en-US")}`
              : "FORK BLOCK NOT CAPTURED"}
          </span>
        </div>
        <p className="mt-1 text-xs text-[#a89f90]">
          Bybit Safe exploit transaction replayed on local Anvil fork.
        </p>

        <div role="radiogroup" aria-label="Replay run switcher" className="mt-3 grid gap-2">
          {[
            {
              key: "runA" as ReplayRunKey,
              label: "Run A · Real Bybit Safe",
              sub: "Unguarded Safe 1.1.1 · slot 0 hijacked to malicious impl",
              outcome: "DRAINED",
            },
            {
              key: "runB" as ReplayRunKey,
              label: "Run B · Our Safe 1.4.1 (unguarded)",
              sub: "Same payload shape · slot 0 hijacked without guard",
              outcome: "DRAINED",
            },
            {
              key: "runC" as ReplayRunKey,
              label: "Run C · Our Safe + IntentLock",
              sub: "same payload shape blocked on a guard-capable Safe",
              outcome: "BLOCKED",
            },
          ].map((r) => {
            const active = wb.activeReplayRun === r.key;
            return (
              <button
                key={r.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => wb.chooseReplayRun(r.key)}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                  active
                    ? "border-[#FF5B14] bg-[#FF5B14]/12 shadow-[0_0_12px_rgba(255,91,20,0.15)]"
                    : "border-[#2f2922] bg-[#14110e] hover:border-[#5a4d3f]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-bold uppercase tracking-tight text-[#F5EEDF]">
                    {r.label}
                  </span>
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                      r.outcome === "BLOCKED"
                        ? "border-[#7ACB8A] text-[#7ACB8A]"
                        : "border-[#ff6a5e] text-[#ff6a5e]"
                    }`}
                  >
                    {r.outcome}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#a89f90]">{r.sub}</p>
              </button>
            );
          })}
        </div>

        {/* Play/pause and Step scrubber */}
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-[#2f2922] bg-[#14110e] p-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={wb.togglePlayPause}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#FF5B14] px-4 py-1.5 text-xs font-bold text-[#120f0c] transition-colors hover:bg-[#ff7a3a]"
            >
              {running ? (
                <Pause className="size-3.5" />
              ) : (
                <Play className="size-3.5 fill-current" />
              )}
              {running ? "Pause" : "Play Run"}
            </button>
            <span className="font-mono text-xs text-[#a89f90]">
              {(wb.elapsedMs / 1000).toFixed(2)}s / {(wb.durationMs / 1000).toFixed(2)}s
            </span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="range"
              min={0}
              max={wb.durationMs}
              value={wb.elapsedMs}
              onChange={(e) => wb.scrubElapsed(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#2a241d] accent-[#FF5B14]"
              aria-label="Replay step scrubber"
            />
          </div>
        </div>

        {wb.replayEvents.length > 0 && (
          <div className="mt-3 rounded-xl border border-[#2f2922] bg-[#14110e] p-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className={eyebrow}>Saved event sequence</h3>
              <span className="font-mono text-[10px] text-[#8a8071]">
                {wb.replayEvents.filter((event) => event.t <= wb.elapsedMs).length}/
                {wb.replayEvents.length} reached
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[#8a8071]">
              Playback is paced for viewing. Row order and source labels come from the saved
              artifact.
            </p>
            <ol className="mt-3 space-y-2">
              {wb.replayEvents.map((event, index) => {
                const reached = event.t <= wb.elapsedMs;
                const current =
                  reached &&
                  !wb.replayEvents.slice(index + 1).some((next) => next.t <= wb.elapsedMs);
                const tone =
                  event.status === "bad"
                    ? "border-[#FF3B30] bg-[#FF3B30]/10 text-[#ff6a5e]"
                    : event.status === "ok"
                      ? "border-[#7ACB8A] bg-[#7ACB8A]/10 text-[#7ACB8A]"
                      : current
                        ? "border-[#FF5B14] bg-[#FF5B14]/10 text-[#FF5B14]"
                        : reached
                          ? "border-[#5a4d3f] text-[#c9c0b0]"
                          : "border-[#2f2922] text-[#8a8071]";
                const source =
                  event.eventSource === "recorded_chain_observation"
                    ? "RECORDED CHAIN OBSERVATION"
                    : event.eventSource === "foundry_fork_test"
                      ? "FOUNDRY FORK TEST"
                      : event.eventSource === "replay_metadata"
                        ? "REPLAY METADATA"
                        : (event.eventSource ?? "SOURCE NOT CAPTURED");
                return (
                  <li key={`${event.eventType ?? "event"}-${index}`}>
                    <button
                      type="button"
                      onClick={() => wb.scrubElapsed(event.t)}
                      aria-current={current ? "step" : undefined}
                      className={`w-full rounded-lg border px-2.5 py-2 text-left ${tone}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider">
                          {String(index + 1).padStart(2, "0")} · {event.eventType ?? "event"}
                        </span>
                        <span className="shrink-0 font-mono text-[9px] font-bold tracking-wide">
                          {reached ? (event.status === "bad" ? "REVERT" : "REACHED") : "UP NEXT"}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs leading-snug text-[#F5EEDF]">
                        {event.label}
                      </span>
                      <span className="mt-1 block font-mono text-[9px] font-bold tracking-wider text-[#a89f90]">
                        {source}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>

      {/* 1. guard toggle */}
      <section aria-labelledby="wb-guard">
        <h2 id="wb-guard" className={eyebrow}>
          1 · Guard
        </h2>
        <div
          role="radiogroup"
          aria-label="Guard mode"
          className="mt-2 grid grid-cols-2 gap-1 rounded-full border border-[#3a332b] bg-[#14110e] p-1"
        >
          {(
            [
              ["unguarded", "Unguarded", ShieldOff],
              ["guarded", "Guarded", ShieldCheck],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={wb.mode === m}
              onClick={() => wb.setMode(m)}
              className={`flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-colors ${
                wb.mode === m
                  ? "bg-[#FF5B14] text-[#120f0c]"
                  : "text-[#c9c0b0] hover:text-[#F5EEDF]"
              }`}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-[#a89f90]">
          {guarded
            ? "Verifiers and the gate check every payload."
            : "No checks. Quorum alone moves funds."}
        </p>
      </section>

      {/* 2. scenarios */}
      <section aria-labelledby="wb-scn">
        <h2 id="wb-scn" className={eyebrow}>
          2 · Scenario
        </h2>
        <div role="tablist" aria-label="Scenario" className="mt-2 grid gap-2">
          {SCENARIOS.map((s, i) => {
            const sel = activeScenario === s.id;
            return (
              <button
                key={s.id}
                ref={(el) => {
                  tabs.current[s.id] = el;
                }}
                role="tab"
                aria-selected={sel}
                tabIndex={sel || (!activeScenario && i === 0) ? 0 : -1}
                onClick={() => wb.chooseScenario(s.id as ScenarioId)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  sel
                    ? "border-[#FF5B14] bg-[#FF5B14]/12"
                    : "border-[#2f2922] bg-[#14110e] hover:border-[#5a4d3f]"
                }`}
              >
                <span className="block font-display text-base font-extrabold uppercase tracking-tight">
                  {s.label}
                </span>
                <span className="block text-sm text-[#a89f90]">{s.blurb}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={wb.replay}
            className="inline-flex items-center gap-2 rounded-full bg-[#FF5B14] px-5 py-2.5 text-sm font-bold text-[#120f0c] transition-colors hover:bg-[#ff7a3a]"
          >
            {running || wb.runStatus === "done" ? (
              <RotateCcw className="size-4" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden fill="currentColor" />
            )}
            {running || wb.runStatus === "done" ? "Replay" : "Play"}
          </button>
          <div
            role="progressbar"
            aria-label="Run progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#2a241d]"
          >
            <div
              className="h-full bg-[#FF5B14] transition-[width] duration-100 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </section>

      {/* outcome */}
      <section aria-live="polite" aria-label="Outcome" className="min-h-[3.5rem]">
        {d.stamp ? (
          <div
            className={`rounded-xl border px-4 py-3 ${d.stamp === "ok" ? "border-[#7ACB8A] bg-[#7ACB8A]/10" : "border-[#FF3B30] bg-[#FF3B30]/10"}`}
          >
            <p
              className={`font-display text-2xl font-extrabold uppercase leading-none ${d.stamp === "ok" ? "text-[#7ACB8A]" : "text-[#ff6a5e]"}`}
            >
              {STAMP_TEXT[d.stamp].title}
            </p>
            <p className="mt-1 text-sm text-[#d8cfbf]">{STAMP_TEXT[d.stamp].sub}</p>
            {d.result?.revert && (
              <p className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`${chip} border-[#ff6a5e] text-[#ff6a5e]`}>{d.result.revert}</span>
                {d.result.fixtureId && (
                  <span className={`${chip} border-[#E3A73B] uppercase text-[#E3A73B]`}>
                    {d.result.fixtureId}
                  </span>
                )}
              </p>
            )}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-[#3a332b] px-4 py-3 text-sm text-[#a89f90]">
            No result yet. Press play.
          </p>
        )}
      </section>

      {/* live backend bridge; its RPC/API values are kept separate from scripted scene receipts */}
      <section aria-labelledby="wb-live">
        <h2 id="wb-live" className={eyebrow}>
          Live backend
        </h2>
        <div className="mt-2 rounded-xl border border-[#2f2922] bg-[#100e0b] p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold">
              {wb.liveBackend.connection === "ready"
                ? "Anvil connected"
                : wb.liveBackend.connection === "loading"
                  ? "Connecting…"
                  : "Backend unavailable"}
            </span>
            <span
              className={`${chip} ${wb.liveBackend.connection === "ready" ? "border-[#7ACB8A] text-[#7ACB8A]" : "border-[#E3A73B] text-[#E3A73B]"}`}
            >
              {wb.liveBackend.context?.chainId
                ? `CHAIN ${wb.liveBackend.context.chainId}`
                : "NO CHAIN"}
            </span>
          </div>
          {wb.liveBackend.context?.ready && (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
              <dt className="text-[#a89f90]">Safe balance</dt>
              <dd className="text-right font-mono">
                {formatWei(wb.liveBackend.context.safeBalanceWei)}
              </dd>
              <dt className="text-[#a89f90]">Safe nonce</dt>
              <dd className="text-right font-mono">{wb.liveBackend.context.safeNonce}</dd>
              <dt className="text-[#a89f90]">Observed block</dt>
              <dd className="text-right font-mono">{wb.liveBackend.context.observedAtBlock}</dd>
              <dt className="text-[#a89f90]">Enabled modules</dt>
              <dd className="text-right font-mono">
                {wb.liveBackend.context.enabledModules ?? "unknown"}
              </dd>
            </dl>
          )}
          <label className="mt-3 block text-[11px] font-semibold text-[#d8cfbf]">
            Raw Safe transaction JSON
            <textarea
              value={rawTransactionJson}
              onChange={(event) => setRawTransactionJson(event.target.value)}
              spellCheck={false}
              className="mt-1.5 block min-h-28 w-full resize-y rounded-lg border border-[#3a332b] bg-[#100e0b] p-2 font-mono text-[10px] text-[#F5EEDF] outline-none focus:border-[#FF5B14]"
              placeholder={
                '{\n  "chainId": 31337,\n  "safe": "0x…",\n  "safeNonce": "…",\n  "to": "0x…",\n  "value": "0",\n  "data": "0x",\n  "operation": 0,\n  "safeTxGas": "0",\n  "baseGas": "0",\n  "gasPrice": "0",\n  "gasToken": "0x…",\n  "refundReceiver": "0x…"\n}'
              }
            />
          </label>
          <button
            type="button"
            onClick={handleAnalyzeLive}
            disabled={
              wb.liveBackend.connection !== "ready" ||
              wb.liveBackend.submitting ||
              !rawTransactionJson.trim()
            }
            className="mt-3 w-full rounded-full border border-[#FF5B14] px-3 py-2 text-sm font-bold text-[#FF5B14] transition-colors hover:bg-[#FF5B14] hover:text-[#120f0c] disabled:cursor-not-allowed disabled:border-[#4a4238] disabled:text-[#8a8071]"
          >
            {wb.liveBackend.submitting ? "Checking raw transaction…" : "Analyze raw transaction"}
          </button>
          {liveInputError && (
            <p role="alert" className="mt-2 text-[12px] text-[#ff6a5e]">
              {liveInputError}
            </p>
          )}
          {wb.liveBackend.error && (
            <p role="status" className="mt-2 text-[12px] text-[#E3A73B]">
              {wb.liveBackend.error}
            </p>
          )}
          {wb.liveBackend.proposal && (
            <div className="mt-3 border-t border-[#2f2922] pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#a89f90]">
                  Backend decision
                </span>
                <span
                  className={`${chip} ${wb.liveBackend.proposal.decision.startsWith("REFUSE") ? "border-[#ff6a5e] text-[#ff6a5e]" : "border-[#7ACB8A] text-[#7ACB8A]"}`}
                >
                  {wb.liveBackend.proposal.decision}
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-snug text-[#F5EEDF]">
                {wb.liveBackend.proposal.decoded.summary}
              </p>
              <dl className="mt-2 grid gap-1.5 text-[11px]">
                <dt className="text-[#a89f90]">Safe transaction hash · API computed</dt>
                <dd className="break-all font-mono text-[#d8cfbf]">
                  {wb.liveBackend.proposal.safeTxHash}
                </dd>
                <dt className="text-[#a89f90]">RPC source block</dt>
                <dd className="font-mono text-[#d8cfbf]">
                  {wb.liveBackend.proposal.source.blockNumber} ·{" "}
                  {shortHash(wb.liveBackend.proposal.source.blockHash)}
                </dd>
                <dt className="text-[#a89f90]">Target · value</dt>
                <dd className="break-all font-mono text-[#d8cfbf]">
                  {wb.liveBackend.proposal.transaction.to} ·{" "}
                  {wb.liveBackend.proposal.transaction.value} wei
                </dd>
                <dt className="text-[#a89f90]">Verifier threshold</dt>
                <dd className="font-mono text-[#d8cfbf]">
                  {wb.liveBackend.proposal.verifier.validSignerCount}/
                  {wb.liveBackend.proposal.verifier.threshold} ·{" "}
                  {wb.liveBackend.proposal.verifier.state}
                </dd>
              </dl>
              <div className="mt-3">
                {wb.liveBackend.executionResult ? (
                  <div
                    className={`rounded-lg border p-2.5 text-[11px] leading-snug ${wb.liveBackend.executionResult.success ? "border-[#7ACB8A]/60 bg-[#7ACB8A]/10 text-[#7ACB8A]" : "border-[#ff6a5e]/60 bg-[#ff6a5e]/10 text-[#ff6a5e]"}`}
                  >
                    <p className="font-bold uppercase tracking-wider">
                      {wb.liveBackend.executionResult.success
                        ? "✓ Verified On-Chain Execution"
                        : `✗ On-Chain Revert: ${wb.liveBackend.executionResult.observedRevert ?? "Reverted"}`}
                    </p>
                    <dl className="mt-1.5 grid gap-1 text-[11px]">
                      {wb.liveBackend.executionResult.transactionHash && (
                        <>
                          <dt className="text-[#a89f90]">Safe Tx Hash</dt>
                          <dd className="break-all font-mono text-[#F5EEDF]">
                            {wb.liveBackend.executionResult.transactionHash}
                          </dd>
                        </>
                      )}
                      {wb.liveBackend.executionResult.blockNumber && (
                        <>
                          <dt className="text-[#a89f90]">Mined at block · Gas used</dt>
                          <dd className="font-mono text-[#F5EEDF]">
                            #{wb.liveBackend.executionResult.blockNumber} ·{" "}
                            {Number(wb.liveBackend.executionResult.gasUsed).toLocaleString()} gas
                          </dd>
                        </>
                      )}
                      {wb.liveBackend.executionResult.registryTransactionHash && (
                        <>
                          <dt className="text-[#a89f90]">Registry Attestation Tx</dt>
                          <dd className="break-all font-mono text-[#d8cfbf]">
                            {wb.liveBackend.executionResult.registryTransactionHash}
                          </dd>
                        </>
                      )}
                    </dl>
                  </div>
                ) : (
                  <>
                    <label className="mb-2 block text-[11px] font-semibold text-[#d8cfbf]">
                      Safe owner signature bytes (signed offline)
                      <textarea
                        value={safeSignatures}
                        onChange={(event) => setSafeSignatures(event.target.value.trim())}
                        spellCheck={false}
                        autoComplete="off"
                        className="mt-1.5 block min-h-20 w-full resize-y rounded-lg border border-[#3a332b] bg-[#100e0b] p-2 font-mono text-[10px] text-[#F5EEDF] outline-none focus:border-[#FF5B14]"
                        placeholder="0x… 65-byte Safe signature (never paste a private key)"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        void wb.executeLive(safeSignatures);
                      }}
                      disabled={
                        wb.liveBackend.executing ||
                        !wb.liveBackend.config?.safeExecutionAvailable ||
                        wb.liveBackend.proposal.decision !== "ATTEST" ||
                        !wb.liveBackend.proposal.verifier.thresholdMet ||
                        !/^0x(?:[0-9a-fA-F]{2}){65,}$/.test(safeSignatures)
                      }
                      className="w-full rounded-full bg-[#7ACB8A] px-3 py-2 text-sm font-bold text-[#120f0c] transition-colors hover:bg-[#8ade9c] disabled:cursor-not-allowed disabled:bg-[#4a4238] disabled:text-[#8a8071]"
                    >
                      {wb.liveBackend.executing
                        ? "Submitting on-chain…"
                        : "Submit attestations & execute Safe"}
                    </button>
                    <p className="mt-1.5 text-center text-[11px] text-[#a89f90]">
                      Requires threshold verifier signatures and a valid Safe owner signature. The
                      backend never creates either signature.
                    </p>
                    {!wb.liveBackend.config?.safeExecutionAvailable && (
                      <p className="mt-1 text-center text-[11px] text-[#E3A73B]">
                        Local relayer is not configured; execution is unavailable.
                      </p>
                    )}
                  </>
                )}
              </div>
              {wb.liveBackend.events.length > 0 && (
                <ol aria-label="Backend API events" className="mt-2 grid gap-1">
                  {wb.liveBackend.events.map((event) => (
                    <li key={event.sequence} className="flex items-start gap-2 text-[11px]">
                      <span className="font-mono text-[#8a8071]">
                        {String(event.sequence).padStart(2, "0")}
                      </span>
                      <span className="font-mono text-[#d8cfbf]">{event.type}</span>
                      <span className="ml-auto text-[#8a8071]">API</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 3. break it */}
      <section aria-labelledby="wb-break">
        <h2 id="wb-break" className={eyebrow}>
          3 · Break it
        </h2>
        <p className="mt-1 text-sm text-[#a89f90]">
          Each tweak runs with the guard on and names the revert.
        </p>
        <ul className="mt-2 grid gap-2">
          {BREAKS.map((b) => {
            const o = outcomeOf({ kind: "break", id: b.id }, "guarded");
            const sel = wb.ref.kind === "break" && wb.ref.id === b.id;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => wb.breakIt(b.id as BreakId)}
                  aria-pressed={sel}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${sel ? "border-[#FF5B14] bg-[#FF5B14]/12" : "border-[#2f2922] bg-[#14110e] hover:border-[#5a4d3f]"}`}
                >
                  <span className="block text-[15px] font-bold">{b.label}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-2">
                    {o.revert && (
                      <span className={`${chip} border-[#ff6a5e] text-[#ff6a5e]`}>{o.revert}</span>
                    )}
                    {o.fixtureId && (
                      <span className={`${chip} border-[#E3A73B] uppercase text-[#E3A73B]`}>
                        {o.fixtureId}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 4. inspect */}
      <section aria-labelledby="wb-inspect">
        <h2 id="wb-inspect" className={eyebrow}>
          4 · Inspect
        </h2>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {NODE_ORDER.map((n) => (
            <li key={n}>
              <button
                type="button"
                onClick={() => wb.focusNode(n)}
                aria-pressed={wb.selected === n}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${wb.selected === n ? "border-[#FF5B14] bg-[#FF5B14] text-[#120f0c]" : "border-[#3a332b] text-[#d8cfbf] hover:border-[#8a7a66]"}`}
              >
                {NODE_INFO[n].short}
              </button>
            </li>
          ))}
        </ul>
        <div
          className="mt-3 rounded-xl border border-[#2f2922] bg-[#14110e] p-4"
          aria-live="polite"
        >
          {info ? (
            <dl>
              <dt className="font-display text-lg font-extrabold uppercase">{info.title}</dt>
              <dd className="mt-3">
                <span className={eyebrow}>What it is</span>
                <span className="mt-0.5 block text-[15px]">{info.what}</span>
              </dd>
              <dd className="mt-3">
                <span className={eyebrow}>What it checks</span>
                <span className="mt-0.5 block text-[15px]">{info.checks}</span>
              </dd>
              {wb.selected === "payload" && (
                <dd className="mt-3">
                  <button
                    type="button"
                    onClick={wb.toggleCrate}
                    className="rounded-full border border-[#FF5B14] px-4 py-1.5 text-sm font-bold text-[#FF5B14] hover:bg-[#FF5B14] hover:text-[#120f0c]"
                  >
                    {wb.crateOpen ? "Close the crate" : "Crack the crate open"}
                  </button>
                </dd>
              )}
            </dl>
          ) : (
            <p className="text-sm text-[#a89f90]">{INFO_HINT}</p>
          )}
        </div>
      </section>

      {/* 5. tour */}
      <section aria-labelledby="wb-tour">
        <h2 id="wb-tour" className={eyebrow}>
          5 · Tour
        </h2>
        {wb.tourStep === null ? (
          <button
            type="button"
            onClick={wb.startTour}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#FF5B14] px-5 py-2.5 text-sm font-bold text-[#FF5B14] transition-colors hover:bg-[#FF5B14] hover:text-[#120f0c]"
          >
            <Play className="size-4" aria-hidden fill="currentColor" />
            Start tour
          </button>
        ) : (
          <div className="mt-2 rounded-xl border border-[#FF5B14] bg-[#FF5B14]/10 p-4">
            <p className="font-mono text-xs font-bold uppercase tracking-wider text-[#FF5B14]">
              Step {wb.tourStep + 1} of {TOUR.length}
            </p>
            <p className="mt-1.5 text-[15px]" aria-live="polite">
              {TOUR[wb.tourStep].caption}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={wb.tourBack}
                disabled={wb.tourStep === 0}
                aria-label="Previous step"
                className="grid size-9 place-items-center rounded-full border border-[#5a4d3f] disabled:opacity-35"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={wb.tourNext}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#FF5B14] px-4 py-2 text-sm font-bold text-[#120f0c]"
              >
                {wb.tourStep === TOUR.length - 1 ? "Finish" : "Next"}
                <ArrowRight className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={wb.endTour}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[#5a4d3f] px-3 py-2 text-sm font-medium text-[#d8cfbf] hover:border-[#F5EEDF]"
              >
                <X className="size-4" aria-hidden />
                Skip tour
              </button>
            </div>
          </div>
        )}
      </section>
      {/* 7. RPC method log */}
      <section aria-labelledby="wb-rpc-log">
        <div className="flex items-center justify-between">
          <h2 id="wb-rpc-log" className={eyebrow}>
            7 · RPC transcript
          </h2>
          <a
            href="https://etherscan.io/tx/0x46deef0f52e3a983b67abf4714448a41dd7ffd6d32d32da69d62081c68ad7882"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-[#FF5B14] hover:underline"
          >
            Historical transaction
            <ExternalLink className="size-3" />
          </a>
        </div>
        <p className="mt-1 text-xs text-[#a89f90]">
          The Bybit source transaction is recorded. Raw RPC request and response logs were not
          saved.
        </p>

        <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-[#2f2922] bg-[#14110e] p-2.5 [scrollbar-width:thin]">
          {wb.replayData?.rpcMethodLog?.length ? (
            <ul className="grid gap-2">
              {wb.replayData.rpcMethodLog.map((log, idx) => {
                const isCopied = copiedRpcIndex === idx;
                const copyText = `${log.method}(${JSON.stringify(log.params)})\nResponse Hash: ${log.responseHash}`;
                return (
                  <li
                    key={idx}
                    className="flex flex-col gap-1 rounded-lg border border-[#26201a] bg-[#0c0a08] p-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-bold text-[#F5EEDF]">
                        {log.method}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyRpc(idx, copyText)}
                        className="inline-flex items-center gap-1 font-mono text-[10px] text-[#a89f90] hover:text-[#FF5B14]"
                      >
                        {isCopied ? (
                          <Check className="size-3 text-[#7ACB8A]" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                        {isCopied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <span className="font-mono text-[10px] text-[#8a8071] break-all">
                      Hash: {log.responseHash}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-[#8a8071]">
              No raw RPC transcript was captured for this replay.
            </p>
          )}
        </div>
      </section>

      {/* 8. export & reproduce */}
      <section aria-labelledby="wb-reproduce">
        <h2 id="wb-reproduce" className={eyebrow}>
          8 · Export & reproduce
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleDownloadRunJson}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#3a332b] bg-[#14110e] px-3 py-2.5 text-xs font-bold text-[#F5EEDF] transition-colors hover:border-[#FF5B14]"
          >
            <Download className="size-3.5" />
            run.json
          </button>
          <button
            type="button"
            onClick={handleCopyScript}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#3a332b] bg-[#14110e] px-3 py-2.5 text-xs font-bold text-[#F5EEDF] transition-colors hover:border-[#FF5B14]"
          >
            {copiedScript ? (
              <Check className="size-3.5 text-[#7ACB8A]" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copiedScript ? "Copied script" : "Reproduce script"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-[#8a8071]">
          Run locally:{" "}
          <code className="rounded bg-[#1a1510] px-1 py-0.5 font-mono text-[10px] text-[#d8cfbf]">
            forge test --match-contract BybitReplaySliceTest
          </code>
        </p>
      </section>
    </div>
  );
}
