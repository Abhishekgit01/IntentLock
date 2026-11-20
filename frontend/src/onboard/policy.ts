import type { PolicyDraft, PolicyFile, PolicyTemplateId } from "./types";

export const VERIFIER_THRESHOLD = 2;

export function parsePolicyText(text: string): PolicyFile {
  const value: unknown = JSON.parse(text);
  const fail = (path: string): never => {
    throw new Error(`Invalid policy field: ${path}`);
  };
  const object = (input: unknown, path: string): Record<string, unknown> => {
    if (!input || typeof input !== "object" || Array.isArray(input)) fail(path);
    return input as Record<string, unknown>;
  };
  const array = (input: unknown, path: string): unknown[] => {
    if (!Array.isArray(input)) fail(path);
    return input as unknown[];
  };
  const exactKeys = (input: Record<string, unknown>, keys: string[], path: string) => {
    if (Object.keys(input).some((key) => !keys.includes(key)))
      fail(`${path} has an unexpected field`);
    if (keys.some((key) => !(key in input))) fail(`${path} is missing a required field`);
  };
  const uint = (input: unknown, path: string) => {
    if (
      typeof input !== "string" ||
      !/^(0|[1-9][0-9]*)$/.test(input) ||
      BigInt(input) >= 2n ** 256n
    )
      fail(path);
  };
  const address = (input: unknown, path: string) => {
    if (typeof input !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(input)) fail(path);
  };
  const addresses = (input: unknown, path: string) => {
    const entries = array(input, path);
    entries.forEach((item: unknown, index: number) => address(item, `${path}[${index}]`));
    const normalized = entries.map((item: unknown) => String(item).toLowerCase());
    if (new Set(normalized).size !== normalized.length) fail(`${path} contains duplicates`);
  };
  const root = object(value, "policy");
  exactKeys(root, ["schema", "schemaVersion", "native", "erc20"], "policy");
  if (root.schema !== "intentlock.policy.v1" || root.schemaVersion !== 1)
    fail("schema/schemaVersion");
  const native = object(root.native, "native");
  exactKeys(native, ["maxTransferWei", "allowedRecipients"], "native");
  uint(native.maxTransferWei, "native.maxTransferWei");
  addresses(native.allowedRecipients, "native.allowedRecipients");
  const erc20 = object(root.erc20, "erc20");
  exactKeys(erc20, ["maxTransferBaseUnits", "allowedRecipients", "tokens"], "erc20");
  uint(erc20.maxTransferBaseUnits, "erc20.maxTransferBaseUnits");
  addresses(erc20.allowedRecipients, "erc20.allowedRecipients");
  const tokens = array(erc20.tokens, "erc20.tokens");
  const tokenAddresses: string[] = [];
  tokens.forEach((entry: unknown, index: number) => {
    const token = object(entry, `erc20.tokens[${index}]`);
    exactKeys(token, ["address", "runtimeCodeHash"], `erc20.tokens[${index}]`);
    address(token.address, `erc20.tokens[${index}].address`);
    if (
      typeof token.runtimeCodeHash !== "string" ||
      !/^0x[0-9a-fA-F]{64}$/.test(token.runtimeCodeHash)
    ) {
      fail(`erc20.tokens[${index}].runtimeCodeHash`);
    }
    tokenAddresses.push(String(token.address).toLowerCase());
  });
  if (new Set(tokenAddresses).size !== tokenAddresses.length)
    fail("erc20.tokens contains duplicate addresses");
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
  // This is a schema-valid deny-all starting point. It contains no asserted on-chain facts.
  sample: {
    schema: "intentlock.policy.v1",
    schemaVersion: 1,
    native: {
      maxTransferWei: "0",
      allowedRecipients: [],
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
