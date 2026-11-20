import {
  createWalletClient,
  http,
  parseAbi,
  keccak256,
  encodeAbiParameters,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ATTESTATION_TYPES } from './attestations.js';
import { getCanonicalSafeTxHash } from './safe.js';
import { appendEvent } from './events.js';

// Disposable local-only Anvil development keys (CHAIN_ID 31337 ONLY)
// Never hard-coded in frontend bundles or used on any production network
const LOCAL_DEPLOYER_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const LOCAL_OWNER_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const LOCAL_VERIFIER_KEYS = [
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
];

export const REGISTRY_ABI = parseAbi([
  'function submitAttestation((address safe,uint256 safeNonce,bytes32 safeTxHash,bytes32 intentHash,uint32 intentSchemaVersion,uint8 policyClass,bytes32 targetCodeHash,address resolvedImplementation,bytes32 implementationCodeHash,bytes32 policyHash,bytes32 verifierSetId,uint64 issuedAt,uint64 validUntil,bytes32 proposalId) attestation, bytes[] signatures) external',
  'function getAttestation(address safe, uint256 safeNonce) view returns ((address safe,uint256 safeNonce,bytes32 safeTxHash,bytes32 intentHash,uint32 intentSchemaVersion,uint8 policyClass,bytes32 targetCodeHash,address resolvedImplementation,bytes32 implementationCodeHash,bytes32 policyHash,bytes32 verifierSetId,uint64 issuedAt,uint64 validUntil,bytes32 proposalId), uint256 signerCount, bool consumed, bool pqVerified)',
]);

export const EXEC_SAFE_ABI = parseAbi([
  'function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns (bool)',
]);

export async function executeProposalOnchain({ client, config, proposal }) {
  if (config.chainId !== 31337) {
    const error = new Error('On-chain execution adapter is local-only (chain 31337)');
    error.code = 'UNSUPPORTED_CHAIN';
    error.statusCode = 400;
    throw error;
  }

  const deployer = privateKeyToAccount(LOCAL_DEPLOYER_KEY);
  const owner = privateKeyToAccount(LOCAL_OWNER_KEY);
  const wallet = createWalletClient({
    account: deployer,
    transport: http(config.rpcUrl),
  });

  // Ensure verifier attestations are present for valid proposals
  if (proposal.attestations.size < config.verifierThreshold) {
    if (proposal.decoded.decision === 'ATTEST' || proposal.decoded.decision === 'ATTEST_WITH_TIMELOCK') {
      const now = BigInt(Math.floor(Date.now() / 1000));
      const attestation = {
        safe: proposal.transaction.safe,
        safeNonce: BigInt(proposal.transaction.safeNonce),
        safeTxHash: proposal.safeTxHash,
        intentHash: proposal.decoded.intentHash,
        intentSchemaVersion: 1,
        policyClass: proposal.decoded.policyClass,
        targetCodeHash: proposal.decoded.targetCodeHash,
        resolvedImplementation: proposal.decoded.intent.resolvedImplementation,
        implementationCodeHash: proposal.decoded.intent.implementationCodeHash,
        policyHash: proposal.policyHash,
        verifierSetId: config.verifierSetId,
        issuedAt: now,
        validUntil: now + BigInt(config.maxAttestationSeconds),
        proposalId: proposal.proposalId,
      };

      const domain = {
        name: 'IntentLock',
        version: '1',
        chainId: config.chainId,
        verifyingContract: config.registryAddress,
      };

      for (let i = 0; i < config.verifierThreshold; i++) {
        const verifierAccount = privateKeyToAccount(LOCAL_VERIFIER_KEYS[i]);
        const sig = await verifierAccount.signTypedData({
          domain,
          types: ATTESTATION_TYPES,
          primaryType: 'IntentAttestation',
          message: attestation,
        });
        proposal.attestations.set(verifierAccount.address.toLowerCase(), {
          attestation,
          signature: sig,
        });
      }
      proposal.workflowStatus = 'APPROVED';
    }
  }

  let registryTxHash = null;
  let registryBlockNumber = null;
  let registryGasUsed = null;

  // Step 1: Submit attestation to Registry if threshold is met and policy allows
  if (proposal.attestations.size >= config.verifierThreshold) {
    const firstAttestation = [...proposal.attestations.values()][0].attestation;
    const signatures = [...proposal.attestations.values()].map((a) => a.signature);

    try {
      registryTxHash = await wallet.writeContract({
        address: config.registryAddress,
        abi: REGISTRY_ABI,
        functionName: 'submitAttestation',
        args: [firstAttestation, signatures],
      });
      const regReceipt = await client.waitForTransactionReceipt({ hash: registryTxHash });
      registryBlockNumber = regReceipt.blockNumber.toString();
      registryGasUsed = regReceipt.gasUsed.toString();

      appendEvent(proposal, 'attestation.submitted_onchain', {
        registryAddress: config.registryAddress,
        transactionHash: registryTxHash,
        blockNumber: registryBlockNumber,
        gasUsed: registryGasUsed,
      });
    } catch (err) {
      // Reverts during submission (e.g. already submitted or invalid)
      console.warn('Registry submission notice:', err.shortMessage || err.message);
    }
  }

  // Step 2: Sign and Execute Safe transaction
  const safeTxHash = await getCanonicalSafeTxHash(
    client,
    config.safeAddress,
    proposal.transaction,
  );
  const ownerSignature = await owner.sign({ hash: safeTxHash });

  appendEvent(proposal, 'execution.submitted', {
    safeAddress: config.safeAddress,
    safeTxHash,
  });

  try {
    const execTx = await wallet.writeContract({
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
        ownerSignature,
      ],
    });

    const execReceipt = await client.waitForTransactionReceipt({ hash: execTx });
    const success = execReceipt.status === 'success';

    appendEvent(proposal, success ? 'execution.succeeded' : 'execution.failed', {
      transactionHash: execReceipt.transactionHash,
      blockNumber: execReceipt.blockNumber.toString(),
      gasUsed: execReceipt.gasUsed.toString(),
      status: execReceipt.status,
    });

    proposal.workflowStatus = success ? 'EXECUTED' : 'EXECUTION_FAILED';
    proposal.execution = {
      attemptedOnchain: true,
      readyForExecution: true,
      gate: success ? 'EXECUTED' : 'EXECUTION_FAILED',
      transactionHash: execReceipt.transactionHash,
      blockNumber: execReceipt.blockNumber.toString(),
      gasUsed: execReceipt.gasUsed.toString(),
      observedRevert: null,
      registryTransactionHash: registryTxHash,
    };

    return {
      status: 'executed',
      success,
      transactionHash: execReceipt.transactionHash,
      blockNumber: execReceipt.blockNumber.toString(),
      gasUsed: execReceipt.gasUsed.toString(),
      registryTransactionHash: registryTxHash,
    };
  } catch (revertErr) {
    const errorMsg = revertErr.shortMessage || revertErr.message || 'Execution reverted';
    let observedRevert = 'ExecutionReverted';
    if (/UnsupportedOperation/i.test(errorMsg) || /0x5109f2d1/i.test(errorMsg)) {
      observedRevert = 'UnsupportedOperation';
    } else if (/PolicyDenied/i.test(errorMsg) || /0xf0b3c09f/i.test(errorMsg)) {
      observedRevert = 'PolicyDenied';
    } else if (/NoAttestation/i.test(errorMsg) || /0x028c5040/i.test(errorMsg)) {
      observedRevert = 'NoAttestation';
    } else if (/DigestMismatch/i.test(errorMsg) || /0x600f6b40/i.test(errorMsg)) {
      observedRevert = 'DigestMismatch';
    } else if (/AlreadyConsumed/i.test(errorMsg) || /0x0ebc8ea6/i.test(errorMsg)) {
      observedRevert = 'AlreadyConsumed';
    } else if (/PQVerificationFailed/i.test(errorMsg) || /0xdd38ec67/i.test(errorMsg)) {
      observedRevert = 'PQVerificationFailed';
    }

    appendEvent(proposal, 'execution.failed', {
      error: errorMsg,
      observedRevert,
    });

    proposal.workflowStatus = 'EXECUTION_FAILED';
    proposal.execution = {
      attemptedOnchain: true,
      readyForExecution: true,
      gate: 'REVERTED_BY_GUARD',
      transactionHash: null,
      observedRevert,
      registryTransactionHash: registryTxHash,
    };

    return {
      status: 'reverted',
      success: false,
      observedRevert,
      error: errorMsg,
      registryTransactionHash: registryTxHash,
    };
  }
}
