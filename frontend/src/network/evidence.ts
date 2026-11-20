export interface EvidenceEnvelope {
  measuredGas?: Record<string, { fixtureId?: string; test: string; gas: number; status: string }>;
  replay?: unknown;
  [key: string]: unknown;
}

export type DeploymentManifest = Record<string, unknown>;

export interface EvidenceLoadResult {
  run: EvidenceEnvelope | null;
  manifest: DeploymentManifest | null;
  runError: string | null;
  manifestError: string | null;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export async function loadEvidence(): Promise<EvidenceLoadResult> {
  const [runResult, manifestResult] = await Promise.allSettled([
    getJson<EvidenceEnvelope>("/evidence/run.json"),
    getJson<DeploymentManifest>("/evidence/manifest.json"),
  ]);
  return {
    run: runResult.status === "fulfilled" ? runResult.value : null,
    manifest: manifestResult.status === "fulfilled" ? manifestResult.value : null,
    runError: runResult.status === "rejected" ? String(runResult.reason) : null,
    manifestError: manifestResult.status === "rejected" ? String(manifestResult.reason) : null,
  };
}
