export function getApiRoot(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const queryApi = params.get("api");
    if (queryApi) {
      try {
        window.localStorage?.setItem("INTENTLOCK_API_URL", queryApi);
      } catch {}
      return queryApi.replace(/\/$/, "");
    }
    try {
      const stored = window.localStorage?.getItem("INTENTLOCK_API_URL");
      if (stored) return stored.replace(/\/$/, "");
    } catch {}
  }
  return (import.meta.env.VITE_INTENTLOCK_API_URL || "/api").replace(/\/$/, "");
}

export interface BackendHealth {
  status: string;
  api: string;
  rpc: string;
  configuredChainId: number;
  observedChainId?: number;
  safeConfigured: boolean;
  policyConfigured?: boolean;
  registrySubmissionAvailable: boolean;
  executionAvailable: boolean;
  relayerConfigured: boolean;
}

export interface BackendConfig {
  chainId: number;
  safeVersion: string;
  safeAddress: string | null;
  policyConfigured: boolean;
  policyHash: string | null;
  maxNativeTransferWei: string | null;
  nativeRecipients: string[];
  verifierAddresses: string[];
  verifierThreshold: number;
  supportedActions: string[];
  registryConfigured: boolean;
  registrySubmissionAvailable: boolean;
  registryAddress: string | null;
  verifierSetId: string | null;
  maxAttestationSeconds: number;
  relayerConfigured: boolean;
  safeExecutionAvailable: boolean;
}

export interface ChainContext {
  ready: boolean;
  chainId: number;
  observedAtBlock?: string;
  timestamp?: string;
  blockHash?: string;
  safeVersion: string;
  safeAddress: string | null;
  safeNonce: string | null;
  safeBalanceWei: string | null;
  safeCodeHash: string | null;
  guardAddress: string | null;
  enabledModules: number | null;
  owners?: string[] | null;
  threshold?: string | null;
  source: "rpc_read";
  error?: string;
}

export interface ApiEvent {
  sequence: number;
  type: string;
  occurredAt: string;
  source: "api";
  safeTxHash: string | null;
  payload: Record<string, unknown>;
}

export interface LiveProposal {
  proposalId: string;
  scenarioId: string;
  transaction: {
    chainId: number;
    safe: string;
    safeNonce: string;
    to: string;
    value: string;
    data: string;
    operation: number;
  };
  safeTxHash: string;
  decision: "ATTEST" | "ATTEST_WITH_TIMELOCK" | "REFUSE_UNSUPPORTED" | "REFUSE_POLICY";
  workflowStatus: string;
  decoded: {
    decodeStatus: string;
    decision: string;
    policyClass: number;
    reasonCode: string | null;
    summary: string;
    intentHash: string | null;
    targetCodeHash: string | null;
    source: { blockNumber: string; blockHash: string };
  };
  verifier: {
    threshold: number;
    validSignerCount: number;
    thresholdMet: boolean;
    state: string;
  };
  execution: {
    attemptedOnchain: boolean;
    readyForExecution: boolean;
    gate: string;
    transactionHash: string | null;
    observedRevert: unknown;
  };
  source: { kind: string; blockNumber: string; blockHash: string };
  eventsUrl: string;
  explanation?: {
    summary: string;
    riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";
    verdict: "BLOCKED_MALICIOUS" | "POLICY_VIOLATION" | "UNSUPPORTED_REJECTED" | "SAFE_TO_EXECUTE";
    intentVsCalldata: string;
    bulletPoints: string[];
    aiModel: string | null;
    source: "ollama" | "deterministic_guard_engine";
  } | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiRoot()}${path}`, {
    ...init,
    headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message || `Backend request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

export const getBackendHealth = () => api<BackendHealth>("/health");
export const getBackendConfig = () => api<BackendConfig>("/v1/config");
export const getChainContext = () => api<ChainContext>("/v1/context");

export async function createLiveProposal(
  transaction: Record<string, unknown>,
) {
  return api<LiveProposal>("/v1/proposals", {
    method: "POST",
    body: JSON.stringify({ transaction }),
  });
}

export function subscribeToProposal(
  proposal: LiveProposal,
  onEvent: (event: ApiEvent) => void,
  onError: () => void,
) {
  const url = `${getApiRoot()}${proposal.eventsUrl}`;
  const stream = new EventSource(url);
  const names = [
    "proposal.created",
    "decode.started",
    "decode.completed",
    "policy.evaluated",
    "attestation.submitted_onchain",
    "execution.submitted",
    "execution.succeeded",
    "execution.failed",
  ];
  for (const name of names) {
    stream.addEventListener(name, (message) => {
      try {
        onEvent(JSON.parse((message as MessageEvent<string>).data) as ApiEvent);
      } catch {
        onError();
      }
    });
  }
  stream.onerror = onError;
  return () => stream.close();
}

export interface LiveExecutionResult {
  status: string;
  success: boolean;
  transactionHash?: string;
  blockNumber?: string;
  gasUsed?: string;
  observedRevert?: string;
  error?: string;
  registryTransactionHash?: string;
}

export async function executeLiveProposal(
  proposalId: string,
  safeSignatures: string,
): Promise<LiveExecutionResult> {
  return api<LiveExecutionResult>(`/v1/proposals/${proposalId}/execute`, {
    method: "POST",
    body: JSON.stringify({ safeSignatures }),
  });
}
