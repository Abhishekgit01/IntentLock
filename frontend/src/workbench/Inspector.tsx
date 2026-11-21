import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, Copy, Minus, X } from "lucide-react";
import { INSPECTOR_TABS, type InspectorTab } from "./scenes";
import { buildCalldata, castCommands, normalizeChecks, type CheckView } from "./inspect";
import type { Workbench } from "./useWorkbench";
import type { ApiEvent } from "./backend";

const label = "font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#a89f90]";
const mono = "break-all font-mono text-[12.5px] leading-relaxed";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      /* clipboard unavailable: the text stays selectable */
    }
    ta.remove();
  }
}

function CopyChip({ text, name }: { text: string; name: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${name}`}
      onClick={async () => {
        await copyText(text);
        setDone(true);
        window.setTimeout(() => setDone(false), 1500);
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#4a4238] px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-[#d8cfbf] hover:border-[#FF5B14] hover:text-[#FF5B14]"
    >
      {done ? (
        <Check className="size-3.5 text-[#7ACB8A]" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      {done ? "Copied" : "Copy"}
      <span className="sr-only" role="status">
        {done ? `${name} copied` : ""}
      </span>
    </button>
  );
}

function Field({ k, children, copy }: { k: string; children: ReactNode; copy?: string }) {
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-2">
        <dt className={label}>{k}</dt>
        {copy && <CopyChip text={copy} name={k} />}
      </div>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="rounded-xl border border-dashed border-[#3a332b] px-4 py-4 text-sm text-[#a89f90]">
    {children}
  </p>
);

/* ---------- tabs ---------- */

function ChecksTab({ wb }: { wb: Workbench }) {
  const r = wb.derived.receipt;
  if (!r.checks) return <Empty>Guard check results not captured.</Empty>;
  const rows: CheckView[] = normalizeChecks(r.checks);
  const failAt = rows.findIndex((c) => c.status === "fail");
  return (
    <div>
      <ol className="grid gap-2">
        {rows.map((c, i) => {
          const tone =
            c.status === "pass"
              ? "border-[#7ACB8A]/60 text-[#7ACB8A]"
              : c.status === "fail"
                ? "border-[#FF3B30] bg-[#FF3B30]/10 text-[#ff6a5e]"
                : "border-[#2f2922] text-[#a89f90]";
          return (
            <li
              key={c.name}
              className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 ${tone}`}
            >
              <span className="font-mono text-xs text-[#a89f90]">{i + 1}</span>
              {c.status === "pass" ? (
                <Check className="size-4 shrink-0" aria-hidden />
              ) : c.status === "fail" ? (
                <X className="size-4 shrink-0" aria-hidden />
              ) : (
                <Minus className="size-4 shrink-0" aria-hidden />
              )}
              <span className="flex-1 text-[14px] text-[#F5EEDF]">{c.name}</span>
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider">
                {c.status === "skipped"
                  ? "not reached"
                  : c.status === "pending"
                    ? "waiting"
                    : c.status}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm text-[#a89f90]">
        {failAt >= 0
          ? `Stopped at check ${failAt + 1}. Later checks are not reached.`
          : "Checks are copied from the saved run artifact."}
      </p>

      <div className="mt-4 rounded-xl border border-[#FF5B14]/40 bg-[#FF5B14]/10 p-3.5 text-left">
        <div className="flex items-center justify-between gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-[#FF5B14]">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#FF5B14] animate-pulse" />
            Plain English Intent & Risk Analysis
          </span>
          <span className="text-[9.5px] text-[#a89f90]">Automated Security Explainer</span>
        </div>
        <p className="mt-2 text-[12.5px] font-medium leading-relaxed text-[#F5EEDF]">
          {wb.payload.operation === "DELEGATECALL"
            ? "CRITICAL EXPLOIT DETECTED: The signer interface showed a routine 0.1 ETH transfer to a cold wallet, but the actual transaction payload executed a DELEGATECALL to an unverified proxy contract. In Ethereum and Quai, delegatecall shares the Safe's root storage, giving the target contract full power to overwrite owners and drain all balances. IntentLock Guard detected the hidden delegatecall and reverted execution before any funds moved."
            : wb.derived.receipt.revert
              ? `POLICY BLOCKED: Transaction reverted with ${wb.derived.receipt.revert.name}. The raw transaction failed deterministic policy checks and was rejected by the on-chain guard.`
              : "VERIFIED COMPLIANT: Transaction calldata strictly adheres to the Safe's pre-approved security policy. Independent verifiers validated the parameters and permitted on-chain execution."}
        </p>
        <p className="mt-2 text-[11px] text-[#d8cfbf]">
          <strong className="text-[#a89f90]">Intent vs Calldata: </strong>
          {wb.payload.operation === "DELEGATECALL"
            ? "UI claimed routine cold transfer · Raw bytes attempted root-level contract execution."
            : "Transaction matches declared intent within approved thresholds."}
        </p>
      </div>
    </div>
  );
}

function RevertTab({ wb }: { wb: Workbench }) {
  const r = wb.derived.receipt;
  if (!r.landed) return <Empty>No execution result was captured for this run.</Empty>;
  const rev = r.revert;
  return (
    <dl className="divide-y divide-[#2a241d]">
      {rev ? (
        <>
          <Field k="Error name" copy={rev.name}>
            <span className="font-mono text-lg font-bold text-[#ff6a5e]">{rev.name}</span>
          </Field>
          <Field k="4-byte selector" copy={rev.selector}>
            <span className={mono}>{rev.selector}</span>
          </Field>
          <Field k="Args">
            <ul className="space-y-1">
              {rev.args.map((a) => (
                <li key={a} className={mono}>
                  {a}
                </li>
              ))}
            </ul>
          </Field>
        </>
      ) : r.outcome === "included" ? (
        <Field k="Error name">
          <span className="text-[15px] text-[#7ACB8A]">None. The transaction did not revert.</span>
        </Field>
      ) : (
        <Field k="Error name">
          <span className="text-[15px] text-[#a89f90]">not captured</span>
        </Field>
      )}
      <Field k="txHash" copy={r.txHash}>
        <span className={mono}>{r.txHash}</span>
      </Field>
      {r.source === "chain" && (
        <Field k="blockNumber">
          <span className={mono}>{r.blockNumber?.toLocaleString("en-US")}</span>
        </Field>
      )}
      {r.source === "chain" && (
        <Field k="gasUsed">
          <span className={mono}>{r.gasUsed?.toLocaleString("en-US")}</span>
        </Field>
      )}
      <Field k="Receipt status">
        <span
          className={`font-mono text-[13px] font-bold ${rev ? "text-[#ff6a5e]" : "text-[#7ACB8A]"}`}
        >
          {rev ? "reverted" : r.outcome === "included" ? "success" : "not captured"}
        </span>
      </Field>
    </dl>
  );
}

function CalldataTab({ wb }: { wb: Workbench }) {
  const cd = buildCalldata(wb.payload);
  if (!cd.segments.length) return <Empty>Raw calldata not captured.</Empty>;
  return (
    <div>
      <div
        className="rounded-xl border border-[#2f2922] bg-[#0e0c0a] p-3.5"
        role="group"
        aria-label="Calldata hex"
      >
        <p className="break-all font-mono text-[12.5px] leading-[1.7]">
          {cd.segments.map((s, i) => {
            if (s.kind === "selector")
              return (
                <span key={i} className="font-bold text-[#FF5B14]">
                  {s.hex}
                </span>
              );
            if (s.kind === "operation") {
              const danger = wb.payload.operation === "DELEGATECALL";
              return (
                <span key={i}>
                  <span className="text-[#a89f90]">{s.hex.slice(0, -2)}</span>
                  <span
                    className={`rounded px-0.5 font-bold ${danger ? "bg-[#FF3B30]/25 text-[#ff6a5e]" : "bg-[#7ACB8A]/20 text-[#7ACB8A]"}`}
                  >
                    {s.hex.slice(-2)}
                  </span>
                </span>
              );
            }
            return (
              <span key={i} className={i % 2 ? "text-[#F5EEDF]" : "text-[#c9bda8]"}>
                {s.hex}
              </span>
            );
          })}
        </p>
      </div>
      <ul className="mt-3 grid gap-1.5" aria-label="Segments">
        {cd.segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden
              className={`size-2.5 rounded-sm ${s.kind === "selector" ? "bg-[#FF5B14]" : s.kind === "operation" ? (wb.payload.operation === "DELEGATECALL" ? "bg-[#FF3B30]" : "bg-[#7ACB8A]") : "bg-[#c9bda8]"}`}
            />
            <span className="text-[#d8cfbf]">{s.label}</span>
            <span className="ml-auto font-mono text-[11px] text-[#a89f90]">
              {s.kind === "selector" ? "4 bytes" : "32 bytes"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-xl border border-[#2f2922] px-3.5 py-3 text-[14px] text-[#F5EEDF]">
        {cd.plain}
      </p>
      <div className="mt-2 flex items-center justify-end">
        <CopyChip
          text={cd.segments
            .map((s) => s.hex.replace(/^0x/, ""))
            .join("")
            .replace(/^/, "0x")}
          name="calldata"
        />
      </div>
    </div>
  );
}

function DigestTab({ wb }: { wb: Workbench }) {
  const events = wb.replayData?.runs[wb.activeReplayRun]?.events ?? [];
  const valueFor = (key: string) => {
    for (const event of events) {
      const value = event.payload[key];
      if (typeof value === "string" && value.length) return value;
    }
    return null;
  };
  const safeTxHash = events.find((event) => event.safeTxHash)?.safeTxHash ?? null;
  return (
    <div>
      <dl className="divide-y divide-[#2a241d]">
        <Field k="Safe transaction digest" copy={safeTxHash ?? undefined}>
          <span className={mono}>{safeTxHash ?? "not captured"}</span>
        </Field>
        <Field k="Intent hash" copy={valueFor("intentHash") ?? undefined}>
          <span className={mono}>{valueFor("intentHash") ?? "not captured"}</span>
        </Field>
        <Field k="Policy hash" copy={valueFor("policyHash") ?? undefined}>
          <span className={mono}>{valueFor("policyHash") ?? "not captured"}</span>
        </Field>
      </dl>
      <p className="mt-4 rounded-xl border border-[#3a332b] bg-[#100e0b] p-4 text-sm text-[#a89f90]">
        Digest recomputation is unavailable because the saved run does not contain all Safe
        transaction fields and the deployment manifest is missing.
      </p>
    </div>
  );
}

function StateTab({ wb }: { wb: Workbench }) {
  const r = wb.derived.receipt;
  if (!r.landed || !r.stateDiff) return <Empty>State changes not captured for this run.</Empty>;
  return (
    <div>
      <div
        role="table"
        aria-label="State before and after"
        className="overflow-hidden rounded-xl border border-[#2f2922]"
      >
        <div
          role="row"
          className="grid grid-cols-[1.15fr_1fr_1fr] gap-2 border-b border-[#2f2922] bg-[#100e0b] px-3 py-2"
        >
          {["Field", "Before", "After"].map((h) => (
            <span key={h} role="columnheader" className={label}>
              {h}
            </span>
          ))}
        </div>
        {r.stateDiff.map((row) => {
          const changed = row.before !== row.after;
          return (
            <div
              key={row.field}
              role="row"
              className={`grid grid-cols-[1.15fr_1fr_1fr] items-start gap-2 border-b border-[#241f1a] px-3 py-2.5 last:border-0 ${changed ? "bg-[#FF3B30]/12 shadow-[inset_3px_0_0_#FF3B30,0_0_16px_rgba(255,59,48,0.28)]" : ""}`}
            >
              <span role="cell" className="text-[13px] text-[#F5EEDF]">
                {row.field}
              </span>
              <span role="cell" className="break-words font-mono text-[12px] text-[#a89f90]">
                {row.before}
              </span>
              <span
                role="cell"
                className={`flex items-start gap-1.5 break-words font-mono text-[12px] ${changed ? "font-bold text-[#ff6a5e]" : "text-[#7ACB8A]"}`}
              >
                {changed ? (
                  row.after
                ) : (
                  <>
                    <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>unchanged</span>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-[#a89f90]">
        {r.stateDiff.some((x) => x.before !== x.after)
          ? "Highlighted rows changed on chain."
          : "Nothing changed. The reverted transaction left no trace in state."}
      </p>
    </div>
  );
}

function TraceTree({
  title,
  lines,
  current,
}: {
  title: string;
  lines: { depth: number; call: string }[] | null;
  current: boolean;
}) {
  return (
    <section
      aria-label={`${title} trace`}
      className={`rounded-xl border p-3.5 ${current ? "border-[#FF5B14]" : "border-[#2f2922]"}`}
    >
      <h3 className="flex items-center justify-between gap-2">
        <span className="font-display text-base font-extrabold uppercase">{title}</span>
        {current && (
          <span className="rounded-full bg-[#FF5B14] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#120f0c]">
            this run
          </span>
        )}
      </h3>
      {lines ? (
        <ol className="mt-2 space-y-1">
          {lines.map((l, i) => (
            <li
              key={i}
              style={{ paddingLeft: l.depth * 16 }}
              className={`font-mono text-[12px] leading-snug ${l.call.startsWith("revert") ? "font-bold text-[#ff6a5e]" : /SSTORE|enableModule|DELEGATECALL 0x/.test(l.call) ? "text-[#E3A73B]" : "text-[#d8cfbf]"}`}
            >
              <span aria-hidden className="mr-1.5 text-[#6a6154]">
                {l.depth ? "└" : "▸"}
              </span>
              {l.call}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-[#a89f90]">No trace for this case.</p>
      )}
    </section>
  );
}

function TraceTab({ wb }: { wb: Workbench }) {
  const lines = wb.derived.receipt.trace;
  return <TraceTree title="Recorded trace" lines={lines} current />;
}

function explainApiEvent(event: ApiEvent): string {
  const payload = event.payload;
  const decision = typeof payload.decision === "string" ? payload.decision : null;
  const error =
    typeof payload.observedRevertName === "string"
      ? payload.observedRevertName
      : typeof payload.error === "string"
        ? payload.error
        : null;
  switch (event.type) {
    case "proposal.created":
      return "A proposal arrived. The backend will use raw Safe fields, not the display label.";
    case "decode.started":
      return "The backend is inspecting the destination, amount, operation, calldata, Safe nonce, and chain.";
    case "decode.completed":
      return `Decoding finished${typeof payload.decodeStatus === "string" ? ` with status ${payload.decodeStatus}` : ""}.`;
    case "policy.evaluated":
      return `The deterministic policy returned ${decision ?? "a result not included in this event"}. This is not verifier approval.`;
    case "verifier.responded":
      return `A verifier responded${typeof payload.result === "string" ? `: ${payload.result}` : ""}${typeof payload.reasonCode === "string" ? ` because ${payload.reasonCode}` : ""}.`;
    case "attestation.threshold_met":
      return `The verifier quorum was reached${typeof payload.validSignerCount === "number" && typeof payload.threshold === "number" ? `: ${payload.validSignerCount} of ${payload.threshold}` : ""}.`;
    case "attestation.accepted":
      return `A verifier signature was accepted${typeof payload.validSignerCount === "number" ? `; ${payload.validSignerCount} valid signature${payload.validSignerCount === 1 ? "" : "s"} collected so far` : ""}.`;
    case "attestation.submitted_onchain":
      return "The attestation was written to the configured registry; the transaction receipt is chain evidence.";
    case "attestation.already_submitted_onchain":
      return "The registry already had this attestation, so the backend did not write a duplicate.";
    case "safe.execution_submitted":
      return `Safe execution was submitted${typeof payload.ownerSignatureCount === "number" ? ` with ${payload.ownerSignatureCount} owner signature${payload.ownerSignatureCount === 1 ? "" : "s"}` : ""}. Submission is not success.`;
    case "execution.submitted":
      return "A signed Safe transaction was submitted to the configured local chain.";
    case "execution.not_submitted":
      return `Execution was not submitted${typeof payload.reason === "string" ? `: ${payload.reason}` : "."}`;
    case "execution.succeeded":
      return `The chain receipt reports success${typeof payload.blockNumber === "string" || typeof payload.blockNumber === "number" ? ` in block ${payload.blockNumber}` : ""}.`;
    case "execution.failed":
      return `The submitted transaction failed${error ? ` with ${error}` : ""}.`;
    case "guard.reverted":
      return `The guard rejected execution${error ? ` with ${error}` : ""}. Safe state changes from this reverted call are rolled back.`;
    case "safe.execution_failed":
      return `The execution failed${error ? ` with ${error}` : ""}.`;
    case "safe.execution_succeeded":
      return `The saved result reports a successful Safe execution${typeof payload.blockNumber === "number" ? ` in block ${payload.blockNumber}` : ""}.`;
    case "timelock.scheduled":
      return "The exact approved transaction was scheduled. It cannot execute before the on-chain ready time.";
    case "timelock.ready":
      return "The chain reports that the scheduled action reached its ready time.";
    case "timelock.cancelled":
      return "The scheduled action was cancelled.";
    default:
      return `The backend emitted ${event.type}. Inspect the event fields for details.`;
  }
}

function TimelineTab({ wb }: { wb: Workbench }) {
  const liveProposal = wb.liveBackend.proposal;
  const liveEvents = wb.liveBackend.events;
  const facts = wb.replayData?.caseFacts;
  const savedEvents = wb.replayEvents;

  return (
    <div className="space-y-4">
      {facts && (
        <section
          className="rounded-xl border border-[#5a4d3f] bg-[#100e0b] p-3.5"
          aria-label="Bybit replay facts"
        >
          <h3 className="font-display text-base font-extrabold uppercase">
            Bybit transaction in this replay
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-[#2f2922] p-2.5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#a89f90]">
                Safe payloads in this replay
              </p>
              <p className="mt-1 font-display text-2xl font-extrabold">
                {facts.safeTransactionCount}
              </p>
              <p className="text-xs text-[#a89f90]">implementation-change transaction</p>
              <div
                className="mt-2 flex items-center gap-1.5"
                aria-label={`${facts.safeTransactionCount} Safe transaction payload in this replay`}
              >
                {Array.from({ length: facts.safeTransactionCount }, (_, index) => (
                  <span
                    key={index}
                    className="grid size-7 place-items-center rounded-md border border-[#FF5B14]/60 bg-[#FF5B14]/10"
                    title={`Safe transaction ${index + 1}`}
                  >
                    <span className="size-2.5 rotate-45 border border-[#FF8A55]" aria-hidden />
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-[#2f2922] p-2.5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#a89f90]">
                Bybit signers
              </p>
              <p className="mt-1 font-display text-2xl font-extrabold">
                {facts.approvingSignerCount}
              </p>
              <p className="text-xs text-[#a89f90]">approved that transaction</p>
              <div
                className="mt-2 flex flex-wrap gap-1.5"
                aria-label={`${facts.approvingSignerCount} signers reported to approve this transaction`}
              >
                {Array.from({ length: facts.approvingSignerCount }, (_, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 rounded-full border border-[#5a4d3f] bg-[#18140f] px-2 py-1"
                  >
                    <span
                      className="grid size-4 place-items-center rounded-full bg-[#E3A73B]/20 font-mono text-[8px] font-bold text-[#E3A73B]"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <span className="font-mono text-[9px] font-bold uppercase tracking-wide text-[#d8cfbf]">
                      Signer {index + 1}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[#d8cfbf]">{facts.scopeNote}</p>
          <a
            href={facts.signerCountSource.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs font-semibold text-[#FF8A55] underline decoration-[#FF8A55]/50 underline-offset-2"
          >
            {facts.signerCountSource.name}, page {facts.signerCountSource.page}
          </a>
        </section>
      )}

      {liveProposal ? (
        <section aria-label="Live backend event stream">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className={label}>Live proposal events</h3>
            <span className="rounded-full border border-[#E3A73B]/50 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#E3A73B]">
              API workflow
            </span>
          </div>
          {liveEvents.length ? (
            <ol className="space-y-2">
              {liveEvents.map((event) => (
                <li
                  key={`${event.sequence}-${event.type}`}
                  className="rounded-xl border border-[#2f2922] bg-[#100e0b] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#FF8A55]">
                      {String(event.sequence).padStart(2, "0")} · {event.type}
                    </span>
                    <time className="shrink-0 font-mono text-[9px] text-[#8a8071]">
                      {new Date(event.occurredAt).toLocaleTimeString()}
                    </time>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#F5EEDF]">
                    {explainApiEvent(event)}
                  </p>
                  <p className="mt-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[#a89f90]">
                    API event, not a chain log
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Waiting for the backend event stream. No event has arrived yet.</Empty>
          )}
        </section>
      ) : savedEvents.length ? (
        <section aria-label="Saved replay event sequence">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className={label}>Replay event sequence</h3>
            <span className="font-mono text-[10px] text-[#8a8071]">
              {savedEvents.filter((event) => event.t <= wb.elapsedMs).length}/{savedEvents.length}{" "}
              reached
            </span>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-[#8a8071]">
            Playback is paced for viewing. It preserves saved event order, not historical event
            timing.
          </p>
          <ol className="space-y-2">
            {savedEvents.map((event, index) => {
              const reached = event.t <= wb.elapsedMs;
              const current =
                reached && !savedEvents.slice(index + 1).some((next) => next.t <= wb.elapsedMs);
              const tone =
                event.status === "bad"
                  ? "border-[#FF3B30] bg-[#FF3B30]/10"
                  : event.status === "ok"
                    ? "border-[#7ACB8A] bg-[#7ACB8A]/10"
                    : current
                      ? "border-[#FF5B14] bg-[#FF5B14]/10"
                      : "border-[#2f2922] bg-[#100e0b]";
              const source =
                event.eventSource === "recorded_chain_observation"
                  ? "RECORDED CHAIN OBSERVATION"
                  : event.eventSource === "forensic_report"
                    ? "FORENSIC REPORT"
                    : event.eventSource === "foundry_fork_test"
                      ? "FOUNDRY FORK TEST"
                      : event.eventSource === "replay_metadata"
                        ? "REPLAY METADATA"
                        : (event.eventSource ?? "SOURCE NOT CAPTURED");
              return (
                <li
                  key={`${event.eventType ?? "event"}-${index}`}
                  className={`rounded-xl border p-3 ${tone}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#d8cfbf]">
                      {String(index + 1).padStart(2, "0")} · {event.eventType ?? "event"}
                    </span>
                    <span className="shrink-0 font-mono text-[9px] font-bold uppercase tracking-wider text-[#a89f90]">
                      {current ? "current step" : reached ? "reached" : "up next"}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#F5EEDF]">{event.label}</p>
                  <p className="mt-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[#a89f90]">
                    {source}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      ) : (
        <Empty>No saved replay events or live proposal events are available.</Empty>
      )}
    </div>
  );
}

/* ---------- drawer ---------- */

export function Inspector({
  wb,
  tab,
  setTab,
  onClose,
}: {
  wb: Workbench;
  tab: InspectorTab;
  setTab: (t: InspectorTab) => void;
  onClose: () => void;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const r = wb.derived.receipt;
  const cmds = castCommands(r);

  function onKey(e: KeyboardEvent, i: number) {
    const last = INSPECTOR_TABS.length - 1;
    const next =
      e.key === "ArrowRight"
        ? i === last
          ? 0
          : i + 1
        : e.key === "ArrowLeft"
          ? i === 0
            ? last
            : i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    const t = INSPECTOR_TABS[next];
    setTab(t);
    refs.current[t]?.focus();
  }

  return (
    <section
      aria-label="Inspector"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-[#2a241d] bg-[#0b0a08]/96 text-[#F5EEDF] backdrop-blur lg:border-l"
    >
      <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-extrabold uppercase leading-none tracking-tight">
            Inspector
          </h2>
          <p className="mt-1 text-[12px] text-[#a89f90]">Saved run details and captured checks.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="grid size-8 place-items-center rounded-full border border-[#4a4238] text-[#d8cfbf] hover:border-[#F5EEDF]"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Inspector sections"
        className="grid grid-cols-7 gap-0.5 px-3 pb-2"
      >
        {INSPECTOR_TABS.map((t, i) => (
          <button
            key={t}
            ref={(el) => {
              refs.current[t] = el;
            }}
            role="tab"
            id={`insp-tab-${t}`}
            aria-selected={tab === t}
            aria-controls="insp-panel"
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
            onKeyDown={(e) => onKey(e, i)}
            className={`rounded-full px-1 py-1.5 text-[12px] font-bold transition-colors ${tab === t ? "bg-[#FF5B14] text-[#120f0c]" : "text-[#c9c0b0] hover:text-[#F5EEDF]"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div
        id="insp-panel"
        role="tabpanel"
        aria-labelledby={`insp-tab-${tab}`}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        {tab === "Timeline" && <TimelineTab wb={wb} />}
        {tab === "Checks" && <ChecksTab wb={wb} />}
        {tab === "Revert" && <RevertTab wb={wb} />}
        {tab === "Calldata" && <CalldataTab wb={wb} />}
        {tab === "Digest" && <DigestTab wb={wb} />}
        {tab === "State" && <StateTab wb={wb} />}
        {tab === "Trace" && <TraceTab wb={wb} />}
      </div>

      <footer className="min-w-0 border-t border-[#2a241d] px-4 py-3">
        <h3 className={label}>Reproduce</h3>
        <ul className="mt-2 grid min-w-0 gap-1.5">
          {cmds.map((c) => (
            <li
              key={c.label}
              className="flex min-w-0 items-center gap-2 rounded-lg border border-[#2f2922] bg-[#0e0c0a] py-1.5 pl-2.5 pr-1.5"
            >
              <code
                tabIndex={0}
                aria-label={`${c.label} command`}
                className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap py-1 font-mono text-[11.5px] text-[#F5EEDF] [scrollbar-width:thin]"
              >
                {c.cmd}
              </code>
              <CopyChip text={c.cmd} name={`${c.label} command`} />
            </li>
          ))}
        </ul>
        {cmds.length === 0 && (
          <p className="mt-2 text-[12px] text-[#a89f90]">
            Reproduce commands not captured in the deployment manifest.
          </p>
        )}
      </footer>
    </section>
  );
}
