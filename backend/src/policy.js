import {
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  stringToHex,
  zeroAddress,
  zeroHash,
} from 'viem';

const POLICY_TYPEHASH = keccak256(
  stringToHex(
    'PolicyV1(uint32 schemaVersion,uint256 maxNativeTransferWei,bytes32 recipientSetHash)',
  ),
);

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
  if (
    config.maxNativeTransferWei === undefined ||
    config.nativeRecipients.length === 0
  ) {
    return undefined;
  }
  const recipients = [...config.nativeRecipients]
    .map((address) => address.toLowerCase())
    .sort();
  const recipientSetHash = keccak256(
    encodeAbiParameters([{ type: 'address[]' }], [recipients]),
  );
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'uint32' },
        { type: 'uint256' },
        { type: 'bytes32' },
      ],
      [POLICY_TYPEHASH, 1, config.maxNativeTransferWei, recipientSetHash],
    ),
  );
}

function buildNativeTransferIntent({
  transaction,
  safeTxHash,
  targetCodeHash,
  policyHash,
  chainId,
}) {
  const amount = BigInt(transaction.value);
  const recipient = transaction.to.toLowerCase();
  const action = {
    kind: keccak256(stringToHex('native.transfer')),
    target: transaction.to,
    asset: zeroAddress,
    counterparty: transaction.to,
    amount,
    effects: [
      `decrease.safe.native:${amount}`,
      `increase.${recipient}.native:${amount}`,
    ],
  };
  const intent = {
    schemaVersion: 1,
    safeNonce: BigInt(transaction.safeNonce),
    safeTxHash,
    operation: transaction.operation,
    policyClass: 1,
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
    actions: intent.actions.map((action) => ({
      ...action,
      amount: action.amount.toString(),
    })),
  };
  return { intent: publicIntent, intentHash };
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
    return {
      decodeStatus: 'SUPPORTED',
      decision: 'REFUSE_POLICY',
      workflowStatus: 'REJECTED',
      policyClass: 8,
      reasonCode: 'DELEGATECALL_DENIED',
      summary: 'Delegatecall is always denied by the initial policy.',
      intent: null,
      intentHash: null,
      targetCodeHash,
      source,
    };
  }

  if (
    transaction.operation !== 0 ||
    transaction.data !== '0x' ||
    BigInt(transaction.value) === 0n
  ) {
    return {
      decodeStatus: 'UNSUPPORTED',
      decision: 'REFUSE_UNSUPPORTED',
      workflowStatus: 'QUARANTINED',
      policyClass: 255,
      reasonCode: 'UNSUPPORTED_TRANSACTION_SHAPE',
      summary:
        'The backend currently decodes only native CALL transfers with empty calldata.',
      intent: null,
      intentHash: null,
      targetCodeHash,
      source,
    };
  }

  if (targetCodeHash !== zeroHash) {
    return {
      decodeStatus: 'UNSUPPORTED',
      decision: 'REFUSE_UNSUPPORTED',
      workflowStatus: 'QUARANTINED',
      policyClass: 255,
      reasonCode: 'NATIVE_TRANSFER_TARGET_HAS_CODE',
      summary:
        'Native transfer targets with runtime code are outside the initial decoder subset.',
      intent: null,
      intentHash: null,
      targetCodeHash,
      source,
    };
  }

  const { intent, intentHash } = buildNativeTransferIntent({
    transaction,
    safeTxHash,
    targetCodeHash,
    policyHash,
    chainId: config.chainId,
  });
  const recipientAllowed = config.nativeRecipients.some(
    (address) => address.toLowerCase() === transaction.to.toLowerCase(),
  );
  if (
    !policyHash ||
    config.maxNativeTransferWei === undefined ||
    config.nativeRecipients.length === 0
  ) {
    return {
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
    };
  }
  if (!recipientAllowed) {
    return {
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
    };
  }
  if (BigInt(transaction.value) > config.maxNativeTransferWei) {
    return {
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
    };
  }

  return {
    decodeStatus: 'SUPPORTED',
    decision: 'ATTEST',
    workflowStatus: 'AWAITING_THRESHOLD',
    policyClass: 1,
    reasonCode: null,
    summary: `Transfer ${transaction.value} wei of native currency to ${transaction.to}.`,
    intent,
    intentHash,
    targetCodeHash,
    source,
  };
}
