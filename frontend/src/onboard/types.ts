export type PolicyDecision =
  | "ATTEST"
  | "ATTEST_WITH_TIMELOCK"
  | "REFUSE_UNSUPPORTED"
  | "REFUSE_POLICY";

export type RuleTag = "ENFORCEABLE" | "PARTIAL" | "NOT_ENFORCEABLE";
export type DataSource = "backend";
export type PolicyTemplateId = "sample";

export interface PolicyFile {
  schema: "intentlock.policy.v1";
  schemaVersion: 1;
  native: {
    maxTransferWei: string;
    allowedRecipients: string[];
  };
  erc20: {
    maxTransferBaseUnits: string;
    allowedRecipients: string[];
    tokens: Array<{ address: string; runtimeCodeHash: string }>;
  };
}

export interface DraftRule {
  id: string;
  action: string;
  asset?: string;
  recipient?: string;
  decision?: string;
  amount?: string;
  approvalLimit?: string;
  maxBaseUnits?: string;
  currency?: string;
  unit?: string;
  fixedBaseUnits?: string;
}

export interface PolicyDraft extends PolicyFile {
  rules: DraftRule[];
}

export interface ApiResult<T> {
  source: DataSource;
  data: T;
}

export interface CompileResult {
  policy: PolicyFile;
  canonicalPolicyJson?: string;
  canonicalBytes: string;
  policyHash: string;
}

export interface LintIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface HealthResult {
  status: string;
  signerAddress: string | null;
  policyHash: string | null;
  decoderVersion: string;
  configuredChainId?: number;
  observedChainId?: number;
  safeAddress?: string | null;
  safeNonce?: string | null;
  nativeRecipients?: string[];
  maxNativeTransferWei?: string | null;
  erc20Recipients?: string[];
  erc20Tokens?: Array<{ address: string; codeHash: string }>;
  verifierAddresses?: string[];
}

export interface RawTransaction {
  chainId: number;
  safe: string;
  safeNonce: string;
  to: string;
  value: string;
  data: string;
  operation: number;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: string;
  refundReceiver: string;
}

export interface DecodeResult {
  decision: PolicyDecision;
  decodeStatus: string;
  reasonCode: string | null;
  intent: Record<string, unknown> | null;
  intentHash: string | null;
  safeTxHash: string;
  policyHash: string | null;
  decoderVersion: string;
  source: { blockNumber: string; blockHash: string };
  signingPerformed: false;
  highlightedRuleId?: string;
}

export interface ConformanceResult {
  passed: number;
  total: number;
  executed: boolean;
  message: string;
  fixtureResults?: Array<{ id: string; pass: boolean }>;
}
