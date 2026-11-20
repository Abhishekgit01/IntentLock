import type { PayloadFields, RunRef } from "./scenes";

const API_ROOT = (import.meta.env.VITE_INTENTLOCK_API_URL || "/api").replace(/\/$/, "");

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
  safeExecutionAvailable: boolean;
}

export interface ChainContext {
  ready: boolean;
  chainId: number;
  observedAtBlock?: string;
  blockHash?: string;
  safeVersion: string;
  safeAddress: string | null;
  safeNonce: string | null;
  safeBalanceWei: string | null;
  safeCodeHash: string | null;
  guardAddress: string | null;
  enabledModules: number | null;
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
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
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
  ref: RunRef,
  payload: PayloadFields,
  context: ChainContext,
  config: BackendConfig,
) {
  if (!context.ready || !context.safeAddress || context.safeNonce === null) {
    throw new Error(context.error ?? "A live Safe context is not available");
  }

  const isLegitimate = ref.kind === "scenario" && ref.id === "legit";
  const recipient = isLegitimate ? config.nativeRecipients[0] : undefined;
  const to = (recipient ?? payload.raw.toFull).toLowerCase();
  const operation = payload.operation === "DELEGATECALL" ? 1 : 0;
  const rawData = payload.raw.dataHex.replace(/^0x/i, "");
  const data =
    /^[\da-f]*$/i.test(rawData) && rawData.length % 2 === 0
      ? `0x${rawData}`
      : `0x3659cfe6${to.slice(2).toLowerCase().padStart(64, "0")}`;
  const value = payload.raw.valueWeiHex
    ? BigInt(`0x${payload.raw.valueWeiHex.replace(/^0x/i, "")}`).toString()
    : "0";

  return api<LiveProposal>("/v1/proposals", {
    method: "POST",
    body: JSON.stringify({
      scenarioId: `workbench-${ref.kind}-${ref.id}`,
      declaredMetadata: { label: payload.decodedIntent },
      transaction: {
        chainId: context.chainId,
        safe: context.safeAddress,
        safeNonce: context.safeNonce,
        to,
        value,
        data,
        operation,
        safeTxGas: "0",
        baseGas: "0",
        gasPrice: "0",
        gasToken: "0x0000000000000000000000000000000000000000",
        refundReceiver: "0x0000000000000000000000000000000000000000",
      },
    }),
  });
}

export function subscribeToProposal(
  proposal: LiveProposal,
  onEvent: (event: ApiEvent) => void,
  onError: () => void,
) {
  const url = `${API_ROOT}${proposal.eventsUrl}`;
  const stream = new EventSource(url);
  const names = ["proposal.created", "decode.started", "decode.completed", "policy.evaluated"];
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
