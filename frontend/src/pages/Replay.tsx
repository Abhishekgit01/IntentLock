import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { ReplayData } from "@/replay/types";
import { loadEvidence } from "@/network/evidence";
type Manifest = Record<string, unknown>;

export default function Replay() {
  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    loadEvidence()
      .then(({ run, manifest: loadedManifest, runError }) => {
        if (!active) return;
        if (runError) throw new Error(runError);
        setReplay((run?.replay as ReplayData | undefined) ?? null);
        setManifest(loadedManifest as Manifest | null);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "Evidence could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function copyReproduce() {
    if (!replay?.reproduceScript) return;
    await navigator.clipboard.writeText(replay.reproduceScript);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1280px] px-5 pb-16 pt-32 text-ink md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="font-mono text-sm font-bold uppercase tracking-[0.18em] text-flame-deep">
            Replay Lab
          </p>
          <h1 className="mt-3 font-display text-5xl font-extrabold uppercase tracking-tight md:text-7xl">
            Saved run evidence
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-soft">
            Values below are loaded from the public evidence files. Missing fields are shown as not
            captured.
          </p>
        </div>
        <Link
          to="/evidence"
          className="rounded-full border-2 border-edge px-5 py-3 font-display font-bold uppercase hover:border-flame"
        >
          Evidence index
        </Link>
      </div>

      {loading && (
        <p className="mt-10 rounded-2xl border border-edge p-5" role="status">
          Loading saved evidence…
        </p>
      )}
      {error && (
        <p className="mt-10 rounded-2xl border border-bad p-5 text-bad" role="alert">
          Evidence unavailable: {error}
        </p>
      )}
      {!loading && !error && !replay && (
        <p className="mt-10 rounded-2xl border border-edge p-5">
          Replay section not captured in `/evidence/run.json`.
        </p>
      )}
      {!loading && !error && !manifest && (
        <p className="mt-4 rounded-2xl border border-edge p-5">
          Deployment manifest not captured at `/evidence/manifest.json`.
        </p>
      )}

      {replay && (
        <>
          <section
            className="mt-10 grid gap-4 rounded-3xl border-2 border-edge bg-paper p-6 md:grid-cols-2"
            aria-label="Replay source details"
          >
            <Field label="Replay scope" value={replay.disclaimer} />
            <Field label="Source" value={replay.source} />
            <Field label="Transaction hash" value={replay.txHash} mono />
            <Field label="Transaction block" value={replay.txBlockNumber} mono />
            <Field label="Fork block" value={replay.forkBlock?.number} mono />
            <Field label="Safe" value={replay.safe?.address} mono />
            <Field label="Safe version" value={replay.safe?.version} />
            <Field label="Reported signer label" value={replay.payload?.reportedSignerLabel} />
            <Field label="Signer label status" value={replay.payload?.reportedSignerTag} />
            <Field label="Decoded operation" value={replay.payload?.operationName} mono />
            <Field label="Selector" value={replay.payload?.innerSelector} mono />
            <Field label="Raw calldata" value={replay.payload?.data} mono />
            <Field label="Raw Safe transaction input" value={replay.payload?.rawInput} mono />
            <Field label="Target" value={replay.payload?.to} mono />
            <Field label="Slot 0 before" value={replay.safe?.slot0Before} mono />
            <Field label="Slot 0 after" value={replay.safe?.slot0AfterExploit} mono />
          </section>

          <section className="mt-8 rounded-3xl border-2 border-edge bg-paper p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-3xl font-extrabold uppercase">
                Recorded scenario events
              </h2>
              <a
                className="rounded-full border border-edge px-4 py-2 font-mono text-sm underline decoration-flame underline-offset-4"
                href={replay.etherscanUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open referenced transaction
              </a>
            </div>
            <div className="mt-5 grid gap-5">
              {Object.entries(replay.runs ?? {}).map(([key, run]) => (
                <article key={key} className="rounded-2xl border border-edge p-4">
                  <h3 className="font-display text-xl font-bold uppercase">{run.name || key}</h3>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Fixture" value={run.fixtureId} />
                    <Field label="Outcome" value={run.outcome} />
                    <Field label="Observed revert" value={run.observedRevertName} />
                    <Field label="Gas used" value={run.gasUsed} mono />
                    <Field label="Safe address" value={run.targetSafe} mono />
                    <Field label="Storage slot 0 before" value={run.slot0Before} mono />
                    <Field label="Storage slot 0 after" value={run.slot0After} mono />
                  </dl>
                  {run.events?.length ? (
                    <ol className="mt-4 space-y-3 border-l-2 border-edge pl-4">
                      {run.events
                        .slice()
                        .sort((a, b) => a.sequence - b.sequence)
                        .map((event) => (
                          <li key={event.eventId} className="min-w-0">
                            <p className="font-mono text-xs font-bold uppercase text-flame-deep">
                              {event.sequence} · {event.type} · {event.source}
                            </p>
                            <p className="mt-1 break-all text-xs text-soft">
                              {JSON.stringify(event.payload)}
                            </p>
                            {event.transactionHash && (
                              <p className="mt-1 break-all font-mono text-xs">
                                tx {event.transactionHash}
                              </p>
                            )}
                          </li>
                        ))}
                    </ol>
                  ) : (
                    <p className="mt-4 text-sm text-soft">Event stream not captured.</p>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-3xl border-2 border-edge bg-paper p-6">
            <h2 className="font-display text-2xl font-extrabold uppercase">Reproduce command</h2>
            {replay.reproduceScript ? (
              <>
                <pre className="mt-3 overflow-x-auto rounded-xl bg-contrast p-4 font-mono text-sm text-on-contrast">
                  {replay.reproduceScript}
                </pre>
                <button
                  type="button"
                  onClick={() => void copyReproduce()}
                  className="mt-3 rounded-full border-2 border-edge px-4 py-2 font-display font-bold uppercase"
                >
                  {copied ? "Copied" : "Copy command"}
                </button>
              </>
            ) : (
              <p className="mt-3 text-soft">Reproduce command not captured.</p>
            )}
            <p className="mt-4 text-sm text-soft">
              Client-side digest and checksum verification are unavailable until a verified manifest
              and matching verifier implementation are provided.
            </p>
          </section>
        </>
      )}
      {manifest && (
        <details className="mt-8 rounded-2xl border border-edge p-5">
          <summary className="cursor-pointer font-mono text-sm font-bold uppercase">
            Loaded deployment manifest
          </summary>
          <pre className="mt-4 overflow-auto text-xs">{JSON.stringify(manifest, null, 2)}</pre>
        </details>
      )}
    </main>
  );
}

function Field({ label, value, mono = false }: { label: string; value: unknown; mono?: boolean }) {
  const shown =
    value === null || value === undefined || value === "" ? "not captured" : String(value);
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[11px] font-bold uppercase tracking-wider text-soft">
        {label}
      </dt>
      <dd className={`mt-1 break-all ${mono ? "font-mono text-sm" : "text-sm"}`}>{shown}</dd>
    </div>
  );
}
