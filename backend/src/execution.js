import { createWalletClient, http, parseAbi, isHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { assertSafeReady, getCanonicalSafeTxHash } from './safe.js';
import { appendEvent } from './events.js';

export const REGISTRY_ABI = parseAbi([
  'function submitAttestation((address safe,uint256 safeNonce,bytes32 safeTxHash,bytes32 intentHash,uint32 intentSchemaVersion,uint8 policyClass,bytes32 targetCodeHash,address resolvedImplementation,bytes32 implementationCodeHash,bytes32 policyHash,bytes32 verifierSetId,uint64 issuedAt,uint64 validUntil,bytes32 proposalId) attestation, bytes[] signatures) external',
  'function getAttestation(address safe, uint256 safeNonce) view returns ((address safe,uint256 safeNonce,bytes32 safeTxHash,bytes32 intentHash,uint32 intentSchemaVersion,uint8 policyClass,bytes32 targetCodeHash,address resolvedImplementation,bytes32 implementationCodeHash,bytes32 policyHash,bytes32 verifierSetId,uint64 issuedAt,uint64 validUntil,bytes32 proposalId), uint256 signerCount, bool consumed, bool pqVerified)',
]);

export const EXEC_SAFE_ABI = parseAbi([
  'function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns (bool)',
]);

function executionError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function sameAttestation(left, right) {
  const addressFields = ['safe', 'resolvedImplementation'];
  const integerFields = [
    'safeNonce',
    'intentSchemaVersion',
    'policyClass',
    'issuedAt',
    'validUntil',
  ];
  const fields = [
    ...addressFields,
    ...integerFields,
    'safeTxHash',
    'intentHash',
    'targetCodeHash',
    'implementationCodeHash',
    'policyHash',
    'verifierSetId',
    'proposalId',
  ];
  return fields.every((field) => {
    const a = left[field];
    const b = right[field];
    if (addressFields.includes(field)) {
      return String(a).toLowerCase() === String(b).toLowerCase();
    }
    if (integerFields.includes(field)) return BigInt(a) === BigInt(b);
    return String(a).toLowerCase() === String(b).toLowerCase();
  });
}

function requireLocalRelayer(config) {
  const rpc = new URL(config.rpcUrl);
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(rpc.hostname)) {
    throw executionError(400, 'NONLOCAL_RPC', 'Expected a localhost Anvil RPC');
  }
  if (!config.relayerPrivateKey) {
    throw executionError(
      503,
      'RELAYER_NOT_CONFIGURED',
      'Set RELAYER_PRIVATE_KEY to a disposable local Anvil relayer key',
    );
  }
  if (
    !isHex(config.relayerPrivateKey, { strict: true }) ||
    config.relayerPrivateKey.length !== 66
  ) {
    throw executionError(
      500,
      'RELAYER_KEY_INVALID',
      'Configured relayer key is malformed',
    );
  }
  return privateKeyToAccount(config.relayerPrivateKey);
}

function requireQuaiRelayer(client, config) {
  if (!config.allowQuaiBroadcast) {
    throw executionError(
      403,
      'QUAI_BROADCAST_DISABLED',
      'Set ALLOW_QUAI_BROADCAST=YES locally to enable Orchard transaction submission',
    );
  }
  if (
    config.chainId !== 15000 ||
    client.kind !== 'quai-orchard' ||
    new URL(config.rpcUrl).hostname !== 'orchard.rpc.quai.network'
  ) {
    throw executionError(
      400,
      'UNSUPPORTED_CHAIN',
      'Quai transaction submission is restricted to the official Orchard RPC and chain ID 15000',
    );
  }
  if (!config.relayerPrivateKey) {
    throw executionError(
      503,
      'RELAYER_NOT_CONFIGURED',
      'Configure a dedicated local Orchard relayer key in the ignored backend environment',
    );
  }
  if (
    !isHex(config.relayerPrivateKey, { strict: true }) ||
    config.relayerPrivateKey.length !== 66
  ) {
    throw executionError(
      500,
      'RELAYER_KEY_INVALID',
      'Configured Orchard relayer key is malformed',
    );
  }
  return client.createWallet(config.relayerPrivateKey);
}

function requireRelayer(client, config) {
  if (config.chainId === 31337) return requireLocalRelayer(config);
  if (config.chainId === 15000) return requireQuaiRelayer(client, config);
  throw executionError(
    400,
    'UNSUPPORTED_CHAIN',
    'Execution supports only local Anvil or Quai Orchard',
  );
}

async function writeContract(client, wallet, request) {
  if (client.kind === 'quai-orchard') {
    return client.writeContract(wallet, request);
  }
  return wallet.writeContract(request);
}

function asRegistryAttestation(attestation) {
  return {
    ...attestation,
    safeNonce: BigInt(attestation.safeNonce),
    issuedAt: BigInt(attestation.issuedAt),
    validUntil: BigInt(attestation.validUntil),
  };
}

async function ensureRegistryAttestation({ client, wallet, config, proposal }) {
  if (proposal.attestations.size < config.verifierThreshold) {
    throw executionError(
      409,
      'VERIFIER_THRESHOLD_NOT_MET',
      `Execution requires ${config.verifierThreshold} independently submitted verifier signatures`,
    );
  }

  const records = [...proposal.attestations.values()];
  const first = records[0].attestation;
  if (records.some((record) => !sameAttestation(first, record.attestation))) {
    throw executionError(
      409,
      'ATTESTATION_MISMATCH',
      'Verifier signatures do not bind the same attestation',
    );
  }
  const signatures = records.map((record) => record.signature);
  try {
    const transactionHash = await writeContract(client, wallet, {
      address: config.registryAddress,
      abi: REGISTRY_ABI,
      functionName: 'submitAttestation',
      args: [asRegistryAttestation(first), signatures],
    });
    const receipt = await client.waitForTransactionReceipt({
      hash: transactionHash,
    });
    if (receipt.status !== 'success') {
      throw executionError(
        409,
        'REGISTRY_SUBMISSION_FAILED',
        'Registry attestation transaction reverted',
      );
    }
    appendEvent(proposal, 'attestation.submitted_onchain', {
      registryAddress: config.registryAddress,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      source: 'chain_receipt',
    });
    return receipt;
  } catch (error) {
    if (error.code === 'REGISTRY_SUBMISSION_FAILED') throw error;

    // A prior request may already have submitted this exact record. Accept that
    // state only after an RPC read proves the full record and threshold match.
    try {
      const [onchain, signerCount, consumed] = await client.readContract({
        address: config.registryAddress,
        abi: REGISTRY_ABI,
        functionName: 'getAttestation',
        args: [
          proposal.transaction.safe,
          BigInt(proposal.transaction.safeNonce),
        ],
      });
      if (
        !sameAttestation(first, onchain) ||
        signerCount < BigInt(config.verifierThreshold) ||
        consumed
      ) {
        throw executionError(
          409,
          'REGISTRY_STATE_MISMATCH',
          'On-chain registry record does not match the proposal',
        );
      }
      appendEvent(proposal, 'attestation.already_submitted_onchain', {
        registryAddress: config.registryAddress,
        signerCount: signerCount.toString(),
        source: 'rpc_read',
      });
      return null;
    } catch (readError) {
      if (readError.code === 'REGISTRY_STATE_MISMATCH') throw readError;
      throw executionError(
        503,
        'REGISTRY_SUBMISSION_UNCONFIRMED',
        `Could not submit or confirm the exact registry attestation: ${error.shortMessage || error.message}`,
      );
    }
  }
}

export async function executeProposalOnchain({
  client,
  config,
  proposal,
  safeSignatures,
}) {
  if (proposal.decoded.decision === 'ATTEST_WITH_TIMELOCK') {
    throw executionError(
      501,
      'TIMELOCK_NOT_IMPLEMENTED',
      'The deployed backend does not implement the guard-replacement timelock execution flow',
    );
  }
  if (proposal.decoded.decision !== 'ATTEST') {
    throw executionError(
      409,
      'POLICY_DENIED',
      'Only an ATTEST policy decision can be executed',
    );
  }
  if (
    typeof safeSignatures !== 'string' ||
    !isHex(safeSignatures, { strict: true }) ||
    safeSignatures.length < 132
  ) {
    throw executionError(
      400,
      'SAFE_SIGNATURES_REQUIRED',
      'Provide the Safe owner signature bytes produced by an authorized signer; private keys are never accepted here',
    );
  }
  if (!config.registryAddress) {
    throw executionError(
      503,
      'REGISTRY_NOT_CONFIGURED',
      'Registry address is not configured',
    );
  }
  const registryCode = await client
    .getBytecode({ address: config.registryAddress })
    .catch(() => null);
  if (!registryCode || registryCode === '0x') {
    throw executionError(
      503,
      'REGISTRY_NOT_DEPLOYED',
      'Configured registry has no code at the execution RPC',
    );
  }

  const relayer = requireRelayer(client, config);
  const observedChainId = await client.getChainId();
  if (observedChainId !== config.chainId) {
    throw executionError(
      409,
      'CHAIN_MISMATCH',
      `Execution RPC reports chain ${observedChainId}; expected ${config.chainId}`,
    );
  }
  await assertSafeReady(client, config, observedChainId, config.safeAddress);
  const wallet =
    client.kind === 'quai-orchard'
      ? relayer
      : createWalletClient({
          account: relayer,
          transport: http(config.rpcUrl),
        });
  const registryReceipt = await ensureRegistryAttestation({
    client,
    wallet,
    config,
    proposal,
  });

  const canonicalHash = await getCanonicalSafeTxHash(
    client,
    config.safeAddress,
    proposal.transaction,
  );
  if (canonicalHash.toLowerCase() !== proposal.safeTxHash.toLowerCase()) {
    throw executionError(
      409,
      'DIGEST_MISMATCH',
      'Live Safe digest no longer matches this proposal',
    );
  }

  appendEvent(proposal, 'execution.submitted', {
    safeAddress: config.safeAddress,
    safeTxHash: canonicalHash,
    relayer: relayer.address,
    source: 'signed_safe_transaction',
  });

  let transactionHash;
  try {
    transactionHash = await writeContract(client, wallet, {
      address: config.safeAddress,
      abi: EXEC_SAFE_ABI,
      functionName: 'execTransaction',
      args: [
        proposal.transaction.to,
        BigInt(proposal.transaction.value),
        proposal.transaction.data,
        proposal.transaction.operation,
        BigInt(proposal.transaction.safeTxGas),
        BigInt(proposal.transaction.baseGas),
        BigInt(proposal.transaction.gasPrice),
        proposal.transaction.gasToken,
        proposal.transaction.refundReceiver,
        safeSignatures,
      ],
      gas: BigInt(config.executionGasLimit),
    });
  } catch (error) {
    appendEvent(proposal, 'execution.not_submitted', {
      error: error.shortMessage || error.message,
      source: 'rpc_error',
    });
    throw executionError(
      409,
      'EXECUTION_NOT_SUBMITTED',
      error.shortMessage || error.message,
    );
  }

  const receipt = await client.waitForTransactionReceipt({
    hash: transactionHash,
  });
  const success = receipt.status === 'success';
  appendEvent(proposal, success ? 'execution.succeeded' : 'execution.failed', {
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status,
    source: 'chain_receipt',
  });

  proposal.workflowStatus = success ? 'EXECUTED' : 'EXECUTION_FAILED';
  proposal.execution = {
    attemptedOnchain: true,
    readyForExecution: true,
    gate: success ? 'EXECUTED' : 'REVERTED_BY_GUARD',
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
    observedRevert: success ? null : 'ExecutionReverted',
    registryTransactionHash: registryReceipt?.transactionHash ?? null,
  };

  return {
    status: success ? 'executed' : 'reverted',
    success,
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
    observedRevert: success ? null : 'ExecutionReverted',
    registryTransactionHash: registryReceipt?.transactionHash ?? null,
  };
}
