import {
  decodeFunctionData,
  encodeFunctionData,
  hashTypedData,
  keccak256,
  parseAbi,
  stringToHex,
  zeroAddress,
  zeroHash,
} from 'viem';
import { compilePolicyFile } from './policy-format.js';

export const DECODER_VERSION = 'native-erc20-transfer-v1';

const ERC20_ABI = parseAbi([
  'function transfer(address to,uint256 amount) returns (bool)',
  'function approve(address spender,uint256 amount) returns (bool)',
]);
const ERC20_TRANSFER_SELECTOR = '0xa9059cbb';
const ERC20_APPROVE_SELECTOR = '0x095ea7b3';
const UINT256_MAX = (1n << 256n) - 1n;
const SAFE_ADMIN_SELECTORS = new Set([
  '0xe19a9dd9', // setGuard(address)
  '0x610b5925', // enableModule(address)
  '0xe009cfde', // disableModule(address,address)
  '0x694e80c3', // changeThreshold(uint256)
  '0x0d582f13', // addOwnerWithThreshold(address,uint256)
  '0xf8dc5dd9', // removeOwner(address,address,uint256)
  '0xe318b52b', // swapOwner(address,address,address)
  '0xf08a0323', // setFallbackHandler(address)
  '0x7de7edef', // changeMasterCopy(address)
]);

export const INTENT_TYPES = {
  IntentAction: [
    { name: 'kind', type: 'bytes32' },
    { name: 'target', type: 'address' },
    { name: 'asset', type: 'address' },
    { name: 'counterparty', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'effects', type: 'string[]' },
  ],
  IntentV1: [
    { name: 'schemaVersion', type: 'uint32' },
    { name: 'safeNonce', type: 'uint256' },
    { name: 'safeTxHash', type: 'bytes32' },
    { name: 'operation', type: 'uint8' },
    { name: 'policyClass', type: 'uint8' },
    { name: 'targetCodeHash', type: 'bytes32' },
    { name: 'resolvedImplementation', type: 'address' },
    { name: 'implementationCodeHash', type: 'bytes32' },
    { name: 'policyHash', type: 'bytes32' },
    { name: 'actions', type: 'IntentAction[]' },
  ],
};

export function computePolicyHash(config) {
  if (config.maxNativeTransferWei === undefined) return undefined;
  return compilePolicyFile({
    schema: 'intentlock.policy.v1',
    schemaVersion: 1,
    native: {
      maxTransferWei: config.maxNativeTransferWei.toString(),
      allowedRecipients: config.nativeRecipients,
    },
    erc20: {
      maxTransferBaseUnits: (config.maxErc20TransferBaseUnits ?? 0n).toString(),
      allowedRecipients: config.erc20Recipients,
      tokens: config.erc20Tokens.map(({ address, codeHash }) => ({
        address,
        runtimeCodeHash: codeHash,
      })),
    },
  }).policyHash;
}

function buildIntent({
  transaction,
  safeTxHash,
  targetCodeHash,
  policyHash,
  chainId,
  kind,
  target,
  asset,
  counterparty,
  amount,
  effects,
  policyClass = 1,
}) {
  const action = {
    kind: keccak256(stringToHex(kind)),
    target,
    asset,
    counterparty,
    amount,
    effects,
  };
  const intent = {
    schemaVersion: 1,
    safeNonce: BigInt(transaction.safeNonce),
    safeTxHash,
    operation: transaction.operation,
    policyClass,
    targetCodeHash,
    resolvedImplementation: zeroAddress,
    implementationCodeHash: zeroHash,
    policyHash: policyHash ?? zeroHash,
    actions: [action],
  };
  const intentHash = hashTypedData({
    domain: {
      name: 'IntentLockIntent',
      version: '1',
      chainId,
      verifyingContract: transaction.safe,
    },
    types: INTENT_TYPES,
    primaryType: 'IntentV1',
    message: intent,
  });
  const publicIntent = {
    ...intent,
    safeNonce: intent.safeNonce.toString(),
    actions: intent.actions.map((intentAction) => ({
      ...intentAction,
      amount: intentAction.amount.toString(),
    })),
  };
  return { intent: publicIntent, intentHash };
}

function refusal({
  decision,
  workflowStatus,
  decodeStatus,
  policyClass,
  reasonCode,
  summary,
  targetCodeHash,
  source,
  intent = null,
  intentHash = null,
}) {
  return {
    decodeStatus,
    decision,
    workflowStatus,
    policyClass,
    reasonCode,
    summary,
    intent,
    intentHash,
    targetCodeHash,
    source,
  };
}

function decideNativeTransfer({
  config,
  transaction,
  safeTxHash,
  policyHash,
  targetCodeHash,
  source,
}) {
  if (targetCodeHash !== zeroHash) {
    return refusal({
      decodeStatus: 'UNSUPPORTED',
      decision: 'REFUSE_UNSUPPORTED',
      workflowStatus: 'QUARANTINED',
      policyClass: 255,
      reasonCode: 'NATIVE_TRANSFER_TARGET_HAS_CODE',
      summary:
        'Native transfer targets with runtime code are outside the decoder subset.',
      targetCodeHash,
      source,
    });
  }

  const amount = BigInt(transaction.value);
  const recipient = transaction.to.toLowerCase();
  const { intent, intentHash } = buildIntent({
    transaction,
    safeTxHash,
    targetCodeHash,
    policyHash,
    chainId: config.chainId,
    kind: 'native.transfer',
    target: transaction.to,
    asset: zeroAddress,
    counterparty: transaction.to,
    amount,
    effects: [
      `decrease.safe.native:${amount}`,
      `increase.${recipient}.native:${amount}`,
    ],
  });
  const recipientAllowed = config.nativeRecipients.some(
    (address) => address.toLowerCase() === recipient,
  );
  if (
    !policyHash ||
    config.maxNativeTransferWei === undefined ||
    config.nativeRecipients.length === 0
  ) {
    return refusal({
      decodeStatus: 'SUPPORTED',
      decision: 'REFUSE_POLICY',
      workflowStatus: 'REJECTED',
      policyClass: 1,
      reasonCode: 'POLICY_NOT_CONFIGURED',
      summary:
        'Native transfer decoded, but the allowlist/cap policy is not configured.',
      intent,
      intentHash,
      targetCodeHash,
      source,
    });
  }
  if (!recipientAllowed) {
    return refusal({
      decodeStatus: 'SUPPORTED',
      decision: 'REFUSE_POLICY',
      workflowStatus: 'REJECTED',
      policyClass: 1,
      reasonCode: 'RECIPIENT_NOT_ALLOWLISTED',
      summary:
        'Native transfer decoded, but the recipient is not in the active allowlist.',
      intent,
      intentHash,
      targetCodeHash,
      source,
    });
  }
  if (amount > config.maxNativeTransferWei) {
    return refusal({
      decodeStatus: 'SUPPORTED',
      decision: 'REFUSE_POLICY',
      workflowStatus: 'REJECTED',
      policyClass: 1,
      reasonCode: 'NATIVE_TRANSFER_ABOVE_CAP',
      summary:
        'Native transfer decoded, but it exceeds the configured transfer cap.',
      intent,
      intentHash,
      targetCodeHash,
      source,
    });
  }

  return {
    decodeStatus: 'SUPPORTED',
    decision: 'ATTEST',
    workflowStatus: 'AWAITING_THRESHOLD',
    policyClass: 1,
    reasonCode: null,
    summary: `Transfer ${amount} wei of native currency to ${transaction.to}.`,
    intent,
    intentHash,
    targetCodeHash,
    source,
  };
}

function decideErc20Call({
  config,
  transaction,
  safeTxHash,
  policyHash,
  targetCodeHash,
  source,
}) {
  const selector = transaction.data.slice(0, 10).toLowerCase();
  const token = config.erc20Tokens.find(
    ({ address }) => address.toLowerCase() === transaction.to.toLowerCase(),
  );
  if (!token) {
    return refusal({
      decodeStatus: 'UNSUPPORTED',
      decision: 'REFUSE_UNSUPPORTED',
      workflowStatus: 'QUARANTINED',
      policyClass: 255,
      reasonCode: 'ERC20_TOKEN_NOT_ALLOWLISTED',
      summary:
        'Calls to contracts outside the configured ERC-20 token map are unsupported.',
      targetCodeHash,
      source,
    });
  }
  if (token.codeHash.toLowerCase() !== targetCodeHash.toLowerCase()) {
    return refusal({
      decodeStatus: 'SUPPORTED',
      decision: 'REFUSE_POLICY',
      workflowStatus: 'REJECTED',
      policyClass: 1,
      reasonCode: 'ERC20_TOKEN_CODE_HASH_MISMATCH',
      summary:
        'The token runtime code differs from the code hash committed by policy.',
      targetCodeHash,
      source,
    });
  }
  if (
    selector !== ERC20_TRANSFER_SELECTOR &&
    selector !== ERC20_APPROVE_SELECTOR
  ) {
    return refusal({
      decodeStatus: 'UNSUPPORTED',
      decision: 'REFUSE_UNSUPPORTED',
      workflowStatus: 'QUARANTINED',
      policyClass: 255,
      reasonCode: 'UNSUPPORTED_ERC20_SELECTOR',
      summary:
        'Only canonical ERC-20 transfer and approve selectors are known.',
      targetCodeHash,
      source,
    });
  }

  let decoded;
  try {
    decoded = decodeFunctionData({ abi: ERC20_ABI, data: transaction.data });
    const canonicalData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: decoded.functionName,
      args: decoded.args,
    });
    if (canonicalData.toLowerCase() !== transaction.data.toLowerCase()) {
      throw new Error('non-canonical calldata');
    }
  } catch {
    return refusal({
      decodeStatus: 'UNSUPPORTED',
      decision: 'REFUSE_UNSUPPORTED',
      workflowStatus: 'QUARANTINED',
      policyClass: 255,
      reasonCode: 'MALFORMED_ERC20_CALLDATA',
      summary: 'The ERC-20 calldata is malformed or non-canonical.',
      targetCodeHash,
      source,
    });
  }

  if (decoded.functionName === 'approve') {
    const [, allowance] = decoded.args;
    return refusal({
      decodeStatus: 'SUPPORTED',
      decision: 'REFUSE_POLICY',
      workflowStatus: 'REJECTED',
      policyClass: allowance === UINT256_MAX ? 5 : 2,
      reasonCode: 'ERC20_APPROVALS_NOT_ENABLED',
      summary: 'ERC-20 approvals are disabled by the initial policy.',
      targetCodeHash,
      source,
    });
  }

  const [recipient, amount] = decoded.args;
  if (BigInt(transaction.value) !== 0n || amount === 0n) {
    return refusal({
      decodeStatus: 'SUPPORTED',
      decision: 'REFUSE_POLICY',
      workflowStatus: 'REJECTED',
      policyClass: 1,
      reasonCode: 'ERC20_TRANSFER_INVALID_VALUE',
      summary:
        'ERC-20 transfer requires zero native value and a positive amount.',
      targetCodeHash,
      source,
    });
  }
  const { intent, intentHash } = buildIntent({
    transaction,
    safeTxHash,
    targetCodeHash,
    policyHash,
    chainId: config.chainId,
    kind: 'erc20.transfer',
    target: transaction.to,
    asset: transaction.to,
    counterparty: recipient,
    amount,
    effects: [
      `decrease.safe.erc20.${transaction.to.toLowerCase()}:${amount}`,
      `increase.${recipient.toLowerCase()}.erc20.${transaction.to.toLowerCase()}:${amount}`,
    ],
    policyClass: 1,
  });
  const recipientAllowed = config.erc20Recipients.some(
    (address) => address.toLowerCase() === recipient.toLowerCase(),
  );
  if (
    !policyHash ||
    config.maxErc20TransferBaseUnits === undefined ||
    config.erc20Recipients.length === 0
  ) {
    return refusal({
      decodeStatus: 'SUPPORTED',
      decision: 'REFUSE_POLICY',
      workflowStatus: 'REJECTED',
      policyClass: 1,
      reasonCode: 'ERC20_POLICY_NOT_CONFIGURED',
      summary: 'ERC-20 transfer decoded, but its policy is not configured.',
      intent,
      intentHash,
      targetCodeHash,
      source,
    });
  }
  if (!recipientAllowed) {
    return refusal({
      decodeStatus: 'SUPPORTED',
      decision: 'REFUSE_POLICY',
      workflowStatus: 'REJECTED',
      policyClass: 1,
      reasonCode: 'ERC20_RECIPIENT_NOT_ALLOWLISTED',
      summary: 'The ERC-20 recipient is not in the active allowlist.',
      intent,
      intentHash,
      targetCodeHash,
      source,
    });
  }
  if (amount > config.maxErc20TransferBaseUnits) {
    return refusal({
      decodeStatus: 'SUPPORTED',
      decision: 'REFUSE_POLICY',
      workflowStatus: 'REJECTED',
      policyClass: 1,
      reasonCode: 'ERC20_TRANSFER_ABOVE_CAP',
      summary: 'The ERC-20 transfer exceeds the configured base-unit cap.',
      intent,
      intentHash,
      targetCodeHash,
      source,
    });
  }

  return {
    decodeStatus: 'SUPPORTED',
    decision: 'ATTEST',
    workflowStatus: 'AWAITING_THRESHOLD',
    policyClass: 1,
    reasonCode: null,
    summary: `Transfer ${amount} base units of ${transaction.to} to ${recipient}.`,
    intent,
    intentHash,
    targetCodeHash,
    source,
  };
}

export async function decodeAndDecide({
  client,
  config,
  transaction,
  safeTxHash,
  policyHash,
}) {
  const block = await client.getBlock({ blockTag: 'latest' });
  const targetBytecode = await client.getBytecode({
    address: transaction.to,
    blockNumber: block.number,
  });
  const targetCodeHash =
    !targetBytecode || targetBytecode === '0x'
      ? zeroHash
      : keccak256(targetBytecode);
  const source = {
    blockNumber: block.number.toString(),
    blockHash: block.hash,
  };

  if (transaction.operation === 1) {
    return refusal({
      decodeStatus: 'SUPPORTED',
      decision: 'REFUSE_POLICY',
      workflowStatus: 'REJECTED',
      policyClass: 8,
      reasonCode: 'DELEGATECALL_DENIED',
      summary: 'Delegatecall is always denied by the initial policy.',
      targetCodeHash,
      source,
    });
  }

  if (transaction.operation !== 0) {
    return refusal({
      decodeStatus: 'UNSUPPORTED',
      decision: 'REFUSE_UNSUPPORTED',
      workflowStatus: 'QUARANTINED',
      policyClass: 255,
      reasonCode: 'UNSUPPORTED_OPERATION',
      summary: 'Only CALL operations are supported by the decoder.',
      targetCodeHash,
      source,
    });
  }

  if (
    transaction.to.toLowerCase() === transaction.safe.toLowerCase() &&
    transaction.data.length >= 10 &&
    SAFE_ADMIN_SELECTORS.has(transaction.data.slice(0, 10).toLowerCase())
  ) {
    return refusal({
      decodeStatus: 'SUPPORTED',
      decision: 'REFUSE_POLICY',
      workflowStatus: 'REJECTED',
      policyClass: 10,
      reasonCode: 'SAFE_ADMIN_CHANGE_DENIED',
      summary: 'Safe administrative changes are refused by the initial policy.',
      targetCodeHash,
      source,
    });
  }

  if (transaction.data === '0x') {
    if (BigInt(transaction.value) === 0n) {
      return refusal({
        decodeStatus: 'UNSUPPORTED',
        decision: 'REFUSE_UNSUPPORTED',
        workflowStatus: 'QUARANTINED',
        policyClass: 255,
        reasonCode: 'ZERO_VALUE_EMPTY_CALL',
        summary: 'Empty-calldata CALLs with zero value are unsupported.',
        targetCodeHash,
        source,
      });
    }
    return decideNativeTransfer({
      config,
      transaction,
      safeTxHash,
      policyHash,
      targetCodeHash,
      source,
    });
  }

  if (targetCodeHash === zeroHash) {
    return refusal({
      decodeStatus: 'UNSUPPORTED',
      decision: 'REFUSE_UNSUPPORTED',
      workflowStatus: 'QUARANTINED',
      policyClass: 255,
      reasonCode: 'CALL_TARGET_HAS_NO_CODE',
      summary:
        'Calldata calls to an address with no runtime code are unsupported.',
      targetCodeHash,
      source,
    });
  }

  return decideErc20Call({
    config,
    transaction,
    safeTxHash,
    policyHash,
    targetCodeHash,
    source,
  });
}
