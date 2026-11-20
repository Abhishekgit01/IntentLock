import type {
  ApiResult,
  CompileResult,
  ConformanceResult,
  DecodeResult,
  HealthResult,
  LintIssue,
  PolicyDraft,
  PolicyFile,
  RawTransaction,
} from "./types";

const API_ROOT = (import.meta.env.VITE_INTENTLOCK_API_URL || "/api").replace(/\/$/, "");
const ZERO_ADDRESS = `0x${"00".repeat(20)}`;

async function request<T>(path: string, body?: unknown, allowUnavailable = false): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok && !(allowUnavailable && response.status === 503)) {
    throw new Error(payload?.error?.message || `API ${path} returned ${response.status}`);
  }
  return payload as T;
}

function fromBackend<T>(data: T): ApiResult<T> {
  return { source: "backend", data };
}

export async function getHealth(): Promise<ApiResult<HealthResult>> {
  return fromBackend(await request<HealthResult>("/health", undefined, true));
}

export async function compilePolicy(policy: PolicyFile): Promise<ApiResult<CompileResult>> {
  return fromBackend(await request<CompileResult>("/v1/policy/compile", policy));
}

export async function lintPolicy(draft: PolicyDraft): Promise<ApiResult<{ issues: LintIssue[] }>> {
  return fromBackend(await request<{ issues: LintIssue[] }>("/v1/policy/lint", draft));
}

function rawTransaction(
  health: HealthResult,
  sample: (typeof import("./content"))["TRANSACTION_COPY"][number],
): RawTransaction {
  const safe = health.safeAddress;
  const chainId = health.observedChainId ?? health.configuredChainId;
  const safeNonce = health.safeNonce;
  const allowed = health.nativeRecipients?.[0];
  if (!safe || !chainId || safeNonce === null || safeNonce === undefined || !allowed) {
    throw new Error(
      "Live Safe, chain, nonce, and recipient configuration are required for dry-run.",
    );
  }
  return {
    chainId,
    safe,
    safeNonce,
    to: sample.toKind === "allowed" ? allowed : ZERO_ADDRESS,
    value: sample.valueWei,
    data: sample.data,
    operation: sample.operation,
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken: ZERO_ADDRESS,
    refundReceiver: ZERO_ADDRESS,
  };
}

export async function decodeSample(
  sample: (typeof import("./content"))["TRANSACTION_COPY"][number],
): Promise<ApiResult<DecodeResult>> {
  const { data: health } = await getHealth();
  const decoded = await request<DecodeResult>("/decode", rawTransaction(health, sample));
  return fromBackend(decoded);
}

export async function checkVerifierHashes(
  policyHash: string | null,
  addresses: string[],
): Promise<ApiResult<Array<{ address: string; match: "match" | "mismatch" | "not-checked" }>>> {
  const { data: health } = await getHealth();
  const reported =
    (
      health as HealthResult & {
        verifierHealth?: Array<{ address: string; policyHash: string; healthy: boolean }>;
      }
    ).verifierHealth ?? [];
  return fromBackend(
    addresses.map((address) => {
      const status = reported.find(
        (candidate) => candidate.address.toLowerCase() === address.toLowerCase(),
      );
      if (!status || !policyHash) return { address, match: "not-checked" };
      return {
        address,
        match:
          status.healthy && status.policyHash.toLowerCase() === policyHash.toLowerCase()
            ? "match"
            : "mismatch",
      };
    }),
  );
}

export async function runConformance(): Promise<ApiResult<ConformanceResult>> {
  const { data: health } = await getHealth();
  const safe = health.safeAddress;
  const chainId = health.observedChainId ?? health.configuredChainId;
  const safeNonce = health.safeNonce;
  const recipient = health.nativeRecipients?.[0];
  if (!safe || !chainId || safeNonce === null || safeNonce === undefined || !recipient) {
    throw new Error(
      "Verifier health must provide a configured Safe, chain, nonce, and native recipient.",
    );
  }

  const vectors = [
    {
      id: "DECODE_VALID_NATIVE_TRANSFER",
      expectedDecision: "ATTEST",
      value: "1",
      data: "0x",
      operation: 0,
    },
    {
      id: "DECODE_DELEGATECALL_REFUSED",
      expectedDecision: "REFUSE_POLICY",
      value: "0",
      data: "0x",
      operation: 1,
    },
    {
      id: "DECODE_UNKNOWN_SELECTOR_UNSUPPORTED",
      expectedDecision: "REFUSE_UNSUPPORTED",
      value: "0",
      data: "0xdeadbeef",
      operation: 0,
    },
  ] as const;
  const fixtureResults: Array<{ id: string; pass: boolean }> = [];
  for (const vector of vectors) {
    try {
      const result = await request<DecodeResult>("/decode", {
        chainId,
        safe,
        safeNonce: String(safeNonce),
        to: recipient,
        value: vector.value,
        data: vector.data,
        operation: vector.operation,
        safeTxGas: "0",
        baseGas: "0",
        gasPrice: "0",
        gasToken: ZERO_ADDRESS,
        refundReceiver: ZERO_ADDRESS,
      });
      fixtureResults.push({ id: vector.id, pass: result.decision === vector.expectedDecision });
    } catch {
      fixtureResults.push({ id: vector.id, pass: false });
    }
  }
  const passed = fixtureResults.filter((fixture) => fixture.pass).length;
  return fromBackend({
    passed,
    total: fixtureResults.length,
    executed: true,
    message:
      "Three checked-in decoder vectors were sent to the configured verifier API. Catalog execution fixtures were not run.",
    fixtureResults,
  });
}
