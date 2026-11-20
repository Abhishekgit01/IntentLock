import { useRef, type KeyboardEvent } from "react";
import { ArrowRight, ChevronLeft, Play, RotateCcw, ShieldCheck, ShieldOff, X } from "lucide-react";
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
  const guarded = wb.mode === "guarded";
  const running = wb.runStatus === "running";
  const pct = wb.runStatus === "idle" ? 0 : Math.min(100, (wb.elapsedMs / wb.durationMs) * 100);
  const activeScenario = wb.ref.kind === "scenario" ? wb.ref.id : null;
  const d = wb.derived;

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
          <button
            type="button"
            onClick={() => {
              void wb.analyzeLive();
            }}
            disabled={wb.liveBackend.connection !== "ready" || wb.liveBackend.submitting}
            className="mt-3 w-full rounded-full border border-[#FF5B14] px-3 py-2 text-sm font-bold text-[#FF5B14] transition-colors hover:bg-[#FF5B14] hover:text-[#120f0c] disabled:cursor-not-allowed disabled:border-[#4a4238] disabled:text-[#8a8071]"
          >
            {wb.liveBackend.submitting ? "Reading live Safe…" : "Analyze selected payload"}
          </button>
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
                  <div className={`rounded-lg border p-2.5 text-[11px] leading-snug ${wb.liveBackend.executionResult.success ? "border-[#7ACB8A]/60 bg-[#7ACB8A]/10 text-[#7ACB8A]" : "border-[#ff6a5e]/60 bg-[#ff6a5e]/10 text-[#ff6a5e]"}`}>
                    <p className="font-bold uppercase tracking-wider">
                      {wb.liveBackend.executionResult.success
                        ? "✓ Verified On-Chain Execution"
                        : `✗ On-Chain Revert: ${wb.liveBackend.executionResult.observedRevert ?? "Reverted"}`}
                    </p>
                    <dl className="mt-1.5 grid gap-1 text-[11px]">
                      {wb.liveBackend.executionResult.transactionHash && (
                        <>
                          <dt className="text-[#a89f90]">Safe Tx Hash</dt>
                          <dd className="break-all font-mono text-[#F5EEDF]">{wb.liveBackend.executionResult.transactionHash}</dd>
                        </>
                      )}
                      {wb.liveBackend.executionResult.blockNumber && (
                        <>
                          <dt className="text-[#a89f90]">Mined at block · Gas used</dt>
                          <dd className="font-mono text-[#F5EEDF]">
                            #{wb.liveBackend.executionResult.blockNumber} · {Number(wb.liveBackend.executionResult.gasUsed).toLocaleString()} gas
                          </dd>
                        </>
                      )}
                      {wb.liveBackend.executionResult.registryTransactionHash && (
                        <>
                          <dt className="text-[#a89f90]">Registry Attestation Tx</dt>
                          <dd className="break-all font-mono text-[#d8cfbf]">{wb.liveBackend.executionResult.registryTransactionHash}</dd>
                        </>
                      )}
                    </dl>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        void wb.executeLive();
                      }}
                      disabled={wb.liveBackend.executing}
                      className="w-full rounded-full bg-[#7ACB8A] px-3 py-2 text-sm font-bold text-[#120f0c] transition-colors hover:bg-[#8ade9c] disabled:cursor-not-allowed disabled:bg-[#4a4238] disabled:text-[#8a8071]"
                    >
                      {wb.liveBackend.executing ? "Submitting on-chain…" : "Submit attestation & execute on Safe"}
                    </button>
                    <p className="mt-1.5 text-center text-[11px] text-[#a89f90]">
                      Submits EIP-712 verifier attestation to Registry and executes via Safe 1.4.1 guard.
                    </p>
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
    </div>
  );
}
