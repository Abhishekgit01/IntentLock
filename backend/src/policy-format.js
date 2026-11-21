import { encodeAbiParameters, keccak256, stringToHex } from 'viem';

export const POLICY_SCHEMA = 'intentlock.policy.v1';
export const POLICY_TYPEHASH = keccak256(
  stringToHex(
    'PolicyV1(uint32 schemaVersion,uint256 maxNativeTransferWei,bytes32 nativeRecipientSetHash,bytes32 erc20TokenMapHash,bytes32 erc20RecipientSetHash,uint256 maxErc20TransferBaseUnits)',
  ),
);
const UINT256_MAX = (1n << 256n) - 1n;
const UINT256_PATTERN = /^(0|[1-9][0-9]*)$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

function fail(message, code = 'INVALID_POLICY') {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 400;
  throw error;
}

function assertObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${name} must be an object`);
  }
}

function assertKeys(value, allowed, required, name) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${name} has unexpected field: ${key}`);
  }
  for (const key of required) {
    if (!(key in value)) fail(`${name}.${key} is required`);
  }
}

function uint256(value, name) {
  if (typeof value !== 'string' || !UINT256_PATTERN.test(value)) {
    fail(`${name} must be a canonical unsigned decimal string`);
  }
  const parsed = BigInt(value);
  if (parsed > UINT256_MAX) fail(`${name} exceeds uint256`);
  return parsed;
}

function address(value, name) {
  if (typeof value !== 'string' || !ADDRESS_PATTERN.test(value)) {
    fail(`${name} must be a 20-byte EVM address`);
  }
  return value.toLowerCase();
}

function bytes32(value, name) {
  if (typeof value !== 'string' || !BYTES32_PATTERN.test(value)) {
    fail(`${name} must be a 32-byte hex value`);
  }
  return value.toLowerCase();
}

function addresses(values, name) {
  if (!Array.isArray(values)) fail(`${name} must be an array`);
  const normalized = values.map((value, index) =>
    address(value, `${name}[${index}]`),
  );
  if (new Set(normalized).size !== normalized.length) {
    fail(`${name} must not contain duplicate addresses`);
  }
  return normalized.sort();
}

export function normalizePolicyFile(input) {
  assertObject(input, 'policy');
  assertKeys(
    input,
    ['schema', 'schemaVersion', 'native', 'erc20'],
    ['schema', 'schemaVersion', 'native', 'erc20'],
    'policy',
  );
  if (input.schema !== POLICY_SCHEMA || input.schemaVersion !== 1) {
    fail('Only intentlock.policy.v1 schemaVersion 1 is supported');
  }

  assertObject(input.native, 'native');
  assertKeys(
    input.native,
    ['maxTransferWei', 'allowedRecipients'],
    ['maxTransferWei', 'allowedRecipients'],
    'native',
  );
  assertObject(input.erc20, 'erc20');
  assertKeys(
    input.erc20,
    ['maxTransferBaseUnits', 'allowedRecipients', 'tokens'],
    ['maxTransferBaseUnits', 'allowedRecipients', 'tokens'],
    'erc20',
  );
  if (!Array.isArray(input.erc20.tokens)) fail('erc20.tokens must be an array');

  const tokens = input.erc20.tokens.map((token, index) => {
    assertObject(token, `erc20.tokens[${index}]`);
    assertKeys(
      token,
      ['address', 'runtimeCodeHash'],
      ['address', 'runtimeCodeHash'],
      `erc20.tokens[${index}]`,
    );
    return {
      address: address(token.address, `erc20.tokens[${index}].address`),
      runtimeCodeHash: bytes32(
        token.runtimeCodeHash,
        `erc20.tokens[${index}].runtimeCodeHash`,
      ),
    };
  });
  tokens.sort((left, right) => left.address.localeCompare(right.address));
  if (
    new Set(tokens.map(({ address: tokenAddress }) => tokenAddress)).size !==
    tokens.length
  ) {
    fail('erc20.tokens must not contain duplicate addresses');
  }

  const normalized = {
    schema: POLICY_SCHEMA,
    schemaVersion: 1,
    native: {
      maxTransferWei: uint256(
        input.native.maxTransferWei,
        'native.maxTransferWei',
      ).toString(),
      allowedRecipients: addresses(
        input.native.allowedRecipients,
        'native.allowedRecipients',
      ),
    },
    erc20: {
      maxTransferBaseUnits: uint256(
        input.erc20.maxTransferBaseUnits,
        'erc20.maxTransferBaseUnits',
      ).toString(),
      allowedRecipients: addresses(
        input.erc20.allowedRecipients,
        'erc20.allowedRecipients',
      ),
      tokens,
    },
  };
  return normalized;
}

export function compilePolicyFile(input) {
  const policy = normalizePolicyFile(input);
  const nativeRecipientSetHash = keccak256(
    encodeAbiParameters(
      [{ type: 'address[]' }],
      [policy.native.allowedRecipients],
    ),
  );
  const erc20RecipientSetHash = keccak256(
    encodeAbiParameters(
      [{ type: 'address[]' }],
      [policy.erc20.allowedRecipients],
    ),
  );
  const erc20TokenMapHash = keccak256(
    encodeAbiParameters(
      [{ type: 'address[]' }, { type: 'bytes32[]' }],
      [
        policy.erc20.tokens.map(({ address: tokenAddress }) => tokenAddress),
        policy.erc20.tokens.map(({ runtimeCodeHash }) => runtimeCodeHash),
      ],
    ),
  );
  const canonicalBytes = encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'uint32' },
      { type: 'uint256' },
      { type: 'bytes32' },
      { type: 'bytes32' },
      { type: 'bytes32' },
      { type: 'uint256' },
    ],
    [
      POLICY_TYPEHASH,
      1,
      BigInt(policy.native.maxTransferWei),
      nativeRecipientSetHash,
      erc20TokenMapHash,
      erc20RecipientSetHash,
      BigInt(policy.erc20.maxTransferBaseUnits),
    ],
  );
  return {
    policy,
    canonicalPolicyJson: `${JSON.stringify(policy, null, 2)}\n`,
    canonicalBytes,
    policyHash: keccak256(canonicalBytes),
  };
}

export function lintPolicyDraft(input) {
  const issues = [];
  let policy;
  if (!input?.native?.maxTransferWei) {
    issues.push({
      severity: 'error',
      code: 'NATIVE_CAP_MISSING',
      message: 'Native transfer cap is required.',
    });
  }
  if (
    Array.isArray(input?.erc20?.tokens) &&
    input.erc20.tokens.length > 0 &&
    !input.erc20.maxTransferBaseUnits
  ) {
    issues.push({
      severity: 'error',
      code: 'ERC20_CAP_MISSING',
      message: 'ERC-20 transfer cap is required when tokens are configured.',
    });
  }
  try {
    const policyInput = { ...(input ?? {}) };
    delete policyInput.rules;
    policy = normalizePolicyFile(policyInput);
  } catch (error) {
    issues.push({
      severity: 'error',
      code: error.code ?? 'INVALID_POLICY',
      message: error.message,
    });
  }
  if (policy && policy.erc20.tokens.length > 0) {
    if (policy.erc20.allowedRecipients.length === 0) {
      issues.push({
        severity: 'warning',
        code: 'ERC20_RECIPIENTS_EMPTY',
        message:
          'ERC-20 transfers remain denied until a recipient is configured.',
      });
    }
    if (BigInt(policy.erc20.maxTransferBaseUnits) === 0n) {
      issues.push({
        severity: 'warning',
        code: 'ERC20_CAP_ZERO',
        message: 'ERC-20 transfers remain denied while the cap is zero.',
      });
    }
  }
  if (policy && policy.native.allowedRecipients.length === 0) {
    issues.push({
      severity: 'warning',
      code: 'NATIVE_RECIPIENTS_EMPTY',
      message:
        'Native transfers remain denied until a recipient is configured.',
    });
  }
  const rules = Array.isArray(input?.rules) ? input.rules : [];
  const seen = new Map();
  for (const [index, rule] of rules.entries()) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) continue;
    const key = [rule.action, rule.asset ?? '*', rule.recipient ?? '*'].join(
      ':',
    );
    if (seen.has(key) && seen.get(key) !== rule.decision) {
      issues.push({
        severity: 'error',
        code: 'CONFLICTING_RULES',
        message: `Rules ${seen.get(`${key}:id`)} and ${rule.id ?? index} conflict for ${key}.`,
      });
    } else {
      seen.set(key, rule.decision);
      seen.set(`${key}:id`, rule.id ?? index);
    }
    const action = String(rule.action ?? '').toLowerCase();
    const approval = action.includes('approval') || action.includes('approve');
    const unlimited =
      rule.amount === 'unlimited' || rule.approvalLimit === 'unlimited';
    if (
      approval &&
      rule.decision !== 'REFUSE_POLICY' &&
      (unlimited || (rule.decision === 'ATTEST' && !rule.maxBaseUnits))
    ) {
      issues.push({
        severity: 'error',
        code: 'UNLIMITED_APPROVAL',
        message: `Rule ${rule.id ?? index} describes an unlimited or uncapped approval; v1 refuses approvals.`,
      });
    }
    if (
      (rule.currency === 'USD' || rule.unit === 'USD') &&
      !rule.fixedBaseUnits
    ) {
      issues.push({
        severity: 'error',
        code: 'USD_WITHOUT_BASE_UNITS',
        message: `Rule ${rule.id ?? index} uses USD without fixed token base units.`,
      });
    }
    if (approval && rule.maxBaseUnits === undefined && !unlimited) {
      issues.push({
        severity: 'warning',
        code: 'APPROVAL_CAP_MISSING',
        message: `Rule ${rule.id ?? index} has no approval cap.`,
      });
    }
  }
  return issues;
}

export async function comparePolicyWithRegistry(policyInput, client, registryAddress) {
  const { policyHash } = compilePolicyFile(policyInput);
  const onChainPolicyHash = await client.readContract({
    address: registryAddress,
    abi: [{
      type: 'function',
      name: 'currentPolicyHash',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'bytes32' }],
    }],
    functionName: 'currentPolicyHash',
  });
  const block = await client.getBlock({ blockTag: 'latest' });
  const matches = policyHash.toLowerCase() === onChainPolicyHash.toLowerCase();
  return {
    matches,
    localPolicyHash: policyHash,
    onChainPolicyHash,
    registryAddress,
    blockNumber: block.number.toString(),
    blockHash: block.hash,
    timestamp: Number(block.timestamp),
  };
}
