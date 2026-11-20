import type { PolicyDraft, PolicyFile, PolicyTemplateId } from "./types";

export const SAMPLE_RECIPIENT = "0x71c7656ec7ab88b098defb751b7401b5f6d8e4a1";
export const SAMPLE_VERIFIERS = [
  "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
  "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
  "0x15d34aaaf54267db7d7c367839aaf71a00a2c6a65",
] as const;
export const VERIFIER_THRESHOLD = 2;

export function parsePolicyText(text: string): PolicyFile {
  const value: unknown = JSON.parse(text);
  if (
    !value ||
    typeof value !== "object" ||
    !("schema" in value) ||
    value.schema !== "intentlock.policy.v1" ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1 ||
    !("native" in value) ||
    !("erc20" in value)
  ) {
    throw new Error("Invalid policy");
  }
  return value as PolicyFile;
}

export function policyFileFromDraft(draft: PolicyDraft): PolicyFile {
  return {
    schema: draft.schema,
    schemaVersion: draft.schemaVersion,
    native: structuredClone(draft.native),
    erc20: structuredClone(draft.erc20),
  };
}

export const POLICY_TEMPLATES: Record<PolicyTemplateId, PolicyFile> = {
  sample: {
    schema: "intentlock.policy.v1",
    schemaVersion: 1,
    native: {
      maxTransferWei: "1000000000000000000",
      allowedRecipients: [SAMPLE_RECIPIENT],
    },
    erc20: {
      maxTransferBaseUnits: "0",
      allowedRecipients: [],
      tokens: [],
    },
  },
  "deny-all": {
    schema: "intentlock.policy.v1",
    schemaVersion: 1,
    native: { maxTransferWei: "0", allowedRecipients: [] },
    erc20: { maxTransferBaseUnits: "0", allowedRecipients: [], tokens: [] },
  },
  "native-only": {
    schema: "intentlock.policy.v1",
    schemaVersion: 1,
    native: {
      maxTransferWei: "500000000000000000",
      allowedRecipients: [SAMPLE_RECIPIENT],
    },
    erc20: {
      maxTransferBaseUnits: "0",
      allowedRecipients: [],
      tokens: [],
    },
  },
};

export function draftFromPolicy(policy: PolicyFile): PolicyDraft {
  return {
    ...structuredClone(policy),
    rules: [
      {
        id: "native-recipient-cap",
        action: "native.transfer",
        recipient: policy.native.allowedRecipients[0] ?? "*",
        decision: policy.native.allowedRecipients.length ? "ATTEST" : "REFUSE_POLICY",
        maxBaseUnits: policy.native.maxTransferWei,
      },
      {
        id: "erc20-transfer-cap",
        action: "erc20.transfer",
        recipient: policy.erc20.allowedRecipients[0] ?? "*",
        decision: policy.erc20.tokens.length ? "ATTEST" : "REFUSE_POLICY",
        maxBaseUnits: policy.erc20.maxTransferBaseUnits,
      },
      {
        id: "approval-policy",
        action: "erc20.approve",
        decision: "REFUSE_POLICY",
        approvalLimit: "unlimited",
      },
      {
        id: "human-risk-interpretation",
        action: "human.intent-review",
        decision: "NEEDS_HUMAN_DECISION",
      },
    ],
  };
}

export function applyPolicyValue(policy: PolicyFile, key: string, value: string): PolicyFile {
  const next = structuredClone(policy);
  if (key === "native-cap") next.native.maxTransferWei = value;
  else if (key === "native-recipient")
    next.native.allowedRecipients = value.trim() ? [value.trim()] : [];
  else if (key === "erc20-cap") next.erc20.maxTransferBaseUnits = value;
  else if (key === "erc20-recipient")
    next.erc20.allowedRecipients = value.trim() ? [value.trim()] : [];
  return next;
}

export function policyValue(policy: PolicyFile, key: string): string {
  if (key === "native-cap") return policy.native.maxTransferWei;
  if (key === "native-recipient") return policy.native.allowedRecipients.join(", ");
  if (key === "erc20-cap") return policy.erc20.maxTransferBaseUnits;
  if (key === "erc20-recipient") return policy.erc20.allowedRecipients.join(", ");
  if (key === "approval") return "Always refuse";
  if (key === "delegatecall") return "Always refuse";
  return "Needs human decision";
}

export const DRAFT_VALUE_KEYS: Record<string, string> = {
  "native-recipient-cap": "native-cap",
  "erc20-transfer-cap": "erc20-cap",
  "approval-policy": "approval",
  "delegatecall-block": "delegatecall",
  "human-risk-interpretation": "human",
};
