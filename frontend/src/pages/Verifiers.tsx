import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { KeyRound } from "lucide-react";
import {
  getBackendConfig,
  getBackendHealth,
  type BackendConfig,
  type BackendHealth,
} from "@/workbench/backend";
import { useTheme } from "@/lib/theme";
import { PageHeader, Reveal } from "@/components/ui";

type NetworkState = "loading" | "ready" | "unavailable";

export default function Verifiers() {
  const [config, setConfig] = useState<BackendConfig | null>(null);
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [networkState, setNetworkState] = useState<NetworkState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([getBackendConfig(), getBackendHealth()])
      .then(([configResult, healthResult]) => {
        if (!active) return;
        if (configResult.status === "rejected") throw configResult.reason;
        setConfig(configResult.value);
        if (healthResult.status === "fulfilled") setHealth(healthResult.value);
        else
          setError(
            healthResult.reason instanceof Error
              ? healthResult.reason.message
              : "Health status unavailable.",
          );
        setNetworkState("ready");
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Verifier registry could not be read.");
        setNetworkState("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

  const addresses = config?.verifierAddresses ?? [];
  const threshold = config?.verifierThreshold ?? null;

  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-10 md:px-10">
      <PageHeader
        index="02"
        label="Verifier panel"
        parts={[{ t: "Verifier set." }, { t: "Registry sourced.", em: true }]}
      >
        This view lists addresses and threshold returned by the configured backend. It does not
        imply that a verifier is online or has attested to a proposal.
      </PageHeader>
      {networkState === "loading" && (
        <p className="mb-5 rounded-2xl border border-edge p-4 font-mono text-sm" role="status">
          Reading verifier configuration…
        </p>
      )}
      {networkState === "unavailable" && (
        <p className="mb-5 rounded-2xl border border-bad p-4 text-bad" role="alert">
          Verifier configuration unavailable: {error}
        </p>
      )}
      {health && (
        <p className="mb-5 rounded-2xl border border-edge p-4 font-mono text-xs uppercase tracking-wider text-soft">
          API {health.api} · RPC {health.rpc} · chain {health.observedChainId ?? "not captured"}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-12">
        <Reveal className="lg:col-span-5">
          <div className="card flex h-full flex-col items-center bg-sand p-8">
            <ThresholdRing threshold={threshold} total={addresses.length} />
          </div>
        </Reveal>
        <ul className="space-y-4 lg:col-span-7" aria-label="Registered verifier addresses">
          {addresses.map((address, index) => (
            <li key={address}>
              <Reveal delay={index * 0.06} y={24}>
                <VerifierCard address={address} index={index} />
              </Reveal>
            </li>
          ))}
          {networkState === "ready" && addresses.length === 0 && (
            <li className="rounded-3xl border-2 border-dashed border-edge px-5 py-6 text-soft">
              No verifier addresses are registered in the returned configuration.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function ThresholdRing({ threshold, total }: { threshold: number | null; total: number }) {
  const { isDark } = useTheme();
  const r = 92;
  const circumference = 2 * Math.PI * r;
  const gap = total > 0 ? Math.min(10, circumference / total / 4) : 0;
  const segment = total > 0 ? circumference / total - gap : 0;
  const stroke = isDark ? "#544a3c" : "#D9CBB0";
  const accessibleValue = threshold === null ? "not captured" : `${threshold} of ${total}`;

  return (
    <>
      <div
        role="img"
        aria-label={`Verifier threshold ${accessibleValue}. Registered members: ${total}. Current attestations not captured.`}
        className="relative size-72"
      >
        <svg viewBox="0 0 240 240" className="size-full -rotate-90" aria-hidden>
          {Array.from({ length: total }, (_, index) => (
            <circle
              key={index}
              cx="120"
              cy="120"
              r={r}
              fill="none"
              strokeWidth="20"
              strokeLinecap="round"
              stroke={stroke}
              strokeDasharray={`${segment} ${circumference - segment}`}
              strokeDashoffset={-(index * (circumference / total) + gap / 2)}
            />
          ))}
          {total === 0 && (
            <circle cx="120" cy="120" r={r} fill="none" strokeWidth="20" stroke={stroke} />
          )}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <motion.p className="font-display text-7xl font-extrabold leading-none tabular-nums">
            {threshold ?? "—"}
            <span className="text-ink/35"> / {total}</span>
          </motion.p>
          <p className="mt-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-soft">
            required / registered
          </p>
        </div>
      </div>
      <p className="mt-4 font-display text-xl font-extrabold uppercase text-soft">
        Current quorum not captured
      </p>
      <p className="mt-2 text-center text-sm text-soft">
        Configuration is not proof of an attestation.
      </p>
    </>
  );
}

function VerifierCard({ address, index }: { address: string; index: number }) {
  return (
    <article className="card grid grid-cols-[auto_1fr] items-center gap-4 p-5">
      <span
        className="grid size-14 place-items-center rounded-full border-2 border-edge bg-sand font-mono text-lg font-bold text-soft"
        aria-hidden
      >
        {index + 1}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-xl font-extrabold uppercase">
            Registered verifier {index + 1}
          </h2>
          <span className="rounded-full border border-edge px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-soft">
            Status not captured
          </span>
        </div>
        <p className="mt-2 flex items-center gap-2 break-all font-mono text-sm text-soft">
          <KeyRound className="size-3.5 shrink-0" aria-hidden />
          {address}
        </p>
      </div>
    </article>
  );
}
