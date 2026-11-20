import { FIXTURES } from "./fixtures";
import { SAMPLE_RECIPIENT } from "./policy";
import type {
  ApiResult,
  CompileResult,
  ConformanceResult,
  DecodeResult,
  HealthResult,
  LintIssue,
  PolicyDecision,
  PolicyDraft,
  PolicyFile,
  RawTransaction,
} from "./types";

const API_ROOT = (import.meta.env.VITE_INTENTLOCK_API_URL || "/api").replace(/\/$/, "");
const ZERO_HASH = `0x${"00".repeat(32)}`;
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";
const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
const UINT256_MAX = ((1n << 256n) - 1n).toString();

class ApiResponseError extends Error {}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const responseBody = await response.json().catch(() => null);
  if (!response.ok && response.status !== 503) {
    throw new ApiResponseError(
      responseBody?.error?.message || `Onboarding API returned ${response.status}`,
    );
  }
  return responseBody as T;
}

function previewCompile(policy: PolicyFile): CompileResult {
  return {
    policy: structuredClone(policy),
    canonicalBytes: "PREVIEW_ONLY_NO_CANONICAL_BYTES",
    policyHash: ZERO_HASH,
  };
}

function previewLint(draft: PolicyDraft): LintIssue[] {
  const issues: LintIssue[] = [];
  const seen = new Map<string, string | undefined>();
  for (const [index, rule] of draft.rules.entries()) {
    const key = [rule.action, rule.asset ?? "*", rule.recipient ?? "*"].join(":");
    const previous = seen.get(key);
    if (previous !== undefined && previous !== rule.decision) {
      issues.push({
        severity: "error",
        code: "CONFLICTING_RULES",
        message: `Conflicting preview rules at ${key}.`,
      });
    }
    seen.set(key, rule.decision);
    const approval = rule.action.toLowerCase().includes("approve");
    if (
      approval &&
      rule.decision !== "REFUSE_POLICY" &&
      (rule.approvalLimit === "unlimited" || (rule.decision === "ATTEST" && !rule.maxBaseUnits))
    ) {
      issues.push({
        severity: "error",
        code: "UNLIMITED_APPROVAL",
        message: `Approval rule ${rule.id || index} is not permitted by policy v1.`,
      });
    }
    if ((rule.currency === "USD" || rule.unit === "USD") && !rule.fixedBaseUnits) {
      issues.push({
        severity: "error",
        code: "USD_WITHOUT_BASE_UNITS",
        message: `Rule ${rule.id || index} has no fixed base-unit amount.`,
      });
    }
  }
  if (!draft.native.maxTransferWei) {
    issues.push({
      severity: "error",
      code: "NATIVE_CAP_MISSING",
      message: "Native transfer cap is required.",
    });
  }
  if (
    draft.erc20.tokens.length > 0 &&
    (!draft.erc20.allowedRecipients.length || draft.erc20.maxTransferBaseUnits === "0")
  ) {
    issues.push({
      severity: "warning",
      code: "ERC20_CONFIG_INCOMPLETE",
      message: "ERC-20 transfers remain denied until recipients and a positive cap are configured.",
    });
  }
  return issues;
}

function previewHealth(): HealthResult {
  return {
    status: "preview",
    signerAddress: null,
    policyHash: ZERO_HASH,
    decoderVersion: "native-erc20-transfer-v1-preview",
    configuredChainId: 31337,
    observedChainId: 31337,
    safeAddress: null,
    safeNonce: null,
    nativeRecipients: [SAMPLE_RECIPIENT],
    maxNativeTransferWei: "1000000000000000000",
    verifierAddresses: [
      "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
      "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
      "0x15d34aaaf54267db7d7c367839aaf71a00a2c6a65",
    ],
  };
}

async function withPreview<T>(remote: () => Promise<T>, preview: () => T): Promise<ApiResult<T>> {
  try {
    return { source: "backend", data: await remote() };
  } catch (error) {
    if (error instanceof ApiResponseError) throw error;
    return { source: "preview", data: preview() };
  }
}

export async function getHealth(): Promise<ApiResult<HealthResult>> {
  return withPreview(() => request<HealthResult>("/health"), mockAdapter.getHealth);
}

export async function compilePolicy(policy: PolicyFile): Promise<ApiResult<CompileResult>> {
  return withPreview(
    () => request<CompileResult>("/v1/policy/compile", policy),
    () => mockAdapter.compilePolicy(policy),
  );
}

export async function lintPolicy(draft: PolicyDraft): Promise<ApiResult<{ issues: LintIssue[] }>> {
  return withPreview(
    () => request<{ issues: LintIssue[] }>("/v1/policy/lint", draft),
    () => mockAdapter.lintPolicy(draft),
  );
}

function rawEnvelope(
  health: HealthResult,
  tx: { to: string; value: string; data: string; operation: number },
): RawTransaction | null {
  const safe = health.safeAddress;
  const chainId = health.observedChainId ?? health.configuredChainId;
  const nonce = health.safeNonce;
  if (!safe || !chainId || nonce === null || nonce === undefined) return null;
  return {
    chainId,
    safe,
    safeNonce: nonce,
    to: tx.to,
    value: tx.value,
    data: tx.data,
    operation: tx.operation,
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken: "0x0000000000000000000000000000000000000000",
    refundReceiver: "0x0000000000000000000000000000000000000000",
  };
}

function previewDecode(
  sample: (typeof import("./content"))["TRANSACTION_COPY"][number],
): DecodeResult {
  return {
    decision: sample.expectedPreview as PolicyDecision,
    decodeStatus: sample.expectedPreview === "REFUSE_UNSUPPORTED" ? "UNSUPPORTED" : "PREVIEW",
    reasonCode: "PREVIEW_ONLY",
    intent: null,
    intentHash: null,
    safeTxHash: "PREVIEW_ONLY",
    policyHash: null,
    decoderVersion: "native-erc20-transfer-v1-preview",
    source: { blockNumber: "0", blockHash: "PREVIEW_ONLY" },
    signingPerformed: false,
    highlightedRuleId: sample.matchingRuleId,
  };
}

export const mockAdapter = {
  compilePolicy: previewCompile,
  lintPolicy: (draft: PolicyDraft) => ({ issues: previewLint(draft) }),
  getHealth: previewHealth,
  decodeSample: previewDecode,
  runConformance: (): ConformanceResult => ({
    passed: FIXTURES.length,
    total: FIXTURES.length,
    executed: false,
    message: "Preview fixture mapping only; no verifier endpoint was called.",
    fixtureResults: FIXTURES.map(({ id }) => ({ id, pass: true })),
  }),
  checkVerifierHashes: (addresses: string[]) =>
    addresses.map((address) => ({ address, match: "match" as const })),
};

export async function decodeSample(
  sample: (typeof import("./content"))["TRANSACTION_COPY"][number],
): Promise<ApiResult<DecodeResult>> {
  const health = await getHealth();
  const allowedRecipient = health.data.nativeRecipients?.[0] ?? SAMPLE_RECIPIENT;
  const recipient = sample.toKind === "allowed" ? allowedRecipient : DEAD_ADDRESS;
  const transaction = rawEnvelope(health.data, {
    to: recipient,
    value: sample.valueWei,
    data: sample.data,
    operation: sample.operation,
  });
  if (!transaction || health.source === "preview") {
    return { source: "preview", data: mockAdapter.decodeSample(sample) };
  }
  const decoded = await request<DecodeResult>("/decode", transaction);
  return {
    source: "backend",
    data: { ...decoded, highlightedRuleId: sample.matchingRuleId },
  };
}

function fixtureTransaction(
  id: string,
  decision: PolicyDecision,
  kind: string,
  health: HealthResult,
): RawTransaction | null {
  const recipient = health.nativeRecipients?.[0] ?? SAMPLE_RECIPIENT;
  let to = recipient;
  let value = "1";
  let data = "0x";
  let operation = 0;
  if (kind === "unsupported") data = id === "D02" ? "0x1234" : "0xdeadbeef";
  if (kind === "policy") {
    if (id === "A01" || id === "A06") operation = 1;
    else if (id === "A02" || id === "P03") to = DEAD_ADDRESS;
    else if (id === "P04") {
      value = health.maxNativeTransferWei
        ? (BigInt(health.maxNativeTransferWei) + 1n).toString()
        : "1";
    } else if (id === "P01" || id === "P02") {
      const token = health.erc20Tokens?.[0]?.address;
      if (!token) to = DEAD_ADDRESS;
      else {
        to = token;
        value = "0";
        data = `${ERC20_APPROVE_SELECTOR}${DEAD_ADDRESS.slice(2).padStart(64, "0")}${UINT256_MAX.slice(2).padStart(64, "0")}`;
      }
    } else if (id.startsWith("H")) {
      to = health.safeAddress ?? DEAD_ADDRESS;
      value = "0";
      data = `0xe19a9dd9${"000000000000000000000000000000000000cafe".padStart(64, "0")}`;
    } else operation = 1;
  }
  if (decision === "ATTEST_WITH_TIMELOCK") {
    to = health.safeAddress ?? DEAD_ADDRESS;
    value = "0";
    data = `0xe19a9dd9${"000000000000000000000000000000000000cafe".padStart(64, "0")}`;
  }
  return rawEnvelope(health, { to, value, data, operation });
}

export async function runConformance(): Promise<ApiResult<ConformanceResult>> {
  const health = await getHealth();
  if (health.source === "preview") {
    return {
      source: "preview",
      data: mockAdapter.runConformance(),
    };
  }
  const results: Array<{ id: string; pass: boolean }> = [];
  for (const fixture of FIXTURES) {
    const transaction = fixtureTransaction(fixture.id, fixture.decision, fixture.kind, health.data);
    if (!transaction) {
      results.push({ id: fixture.id, pass: false });
      continue;
    }
    try {
      const decoded = await request<DecodeResult>("/decode", transaction);
      results.push({ id: fixture.id, pass: decoded.decision === fixture.decision });
    } catch {
      results.push({ id: fixture.id, pass: false });
    }
  }
  return {
    source: "backend",
    data: {
      passed: results.filter(({ pass }) => pass).length,
      total: results.length,
      executed: true,
      message:
        "Raw transactions were sent to the configured verifier decoder. No signatures or Safe executions were requested.",
      fixtureResults: results,
    },
  };
}

export async function checkVerifierHashes(
  policyHash: string | null,
  addresses: string[],
): Promise<ApiResult<Array<{ address: string; match: "match" | "mismatch" | "not-checked" }>>> {
  const health = await getHealth();
  if (health.source === "preview") {
    return {
      source: "preview",
      data: mockAdapter.checkVerifierHashes(addresses),
    };
  }
  return {
    source: "backend",
    data: addresses.map((address) => {
      const independentStatus = (
        health.data as HealthResult & {
          verifierHealth?: Array<{
            address: string;
            policyHash: string;
            healthy: boolean;
          }>;
        }
      ).verifierHealth?.find(
        (candidate) => candidate.address.toLowerCase() === address.toLowerCase(),
      );
      if (!independentStatus || !policyHash) {
        return { address, match: "not-checked" };
      }
      return {
        address,
        match:
          independentStatus.healthy &&
          independentStatus.policyHash.toLowerCase() === policyHash.toLowerCase()
            ? "match"
            : "mismatch",
      };
    }),
  };
}
