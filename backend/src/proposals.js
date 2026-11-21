import { randomBytes } from 'node:crypto';
import { isAddress, isHex } from 'viem';
import { assertSafeReady, getCanonicalSafeTxHash, SAFE_ABI } from './safe.js';
import {
  computePolicyHash,
  decodeAndDecide,
  DECODER_VERSION,
} from './policy.js';
import { appendEvent } from './events.js';
import { explainTransaction } from './explainer.js';

const UINT256_MAX = (1n << 256n) - 1n;

function badRequest(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 400;
  return error;
}

function parseUint(name, value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw badRequest(
      'INVALID_TRANSACTION',
      `${name} must be a decimal integer string`,
    );
  }
  const parsed = BigInt(value);
  if (parsed > UINT256_MAX) {
    throw badRequest('INVALID_TRANSACTION', `${name} exceeds uint256`);
  }
  return parsed;
}

function validateTransaction(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('INVALID_REQUEST', 'Request body must be a JSON object');
  }
  if ('safeTxHash' in body || 'intentHash' in body) {
    throw badRequest(
      'CLIENT_HASH_NOT_ALLOWED',
      'The backend computes safeTxHash and intentHash; do not submit them',
    );
  }
  const allowedBodyFields = new Set([
    'transaction',
    'declaredMetadata',
    'scenarioId',
    'fixtureId',
    'demoScene',
  ]);
  for (const field of Object.keys(body)) {
    if (!allowedBodyFields.has(field)) {
      throw badRequest('INVALID_REQUEST', `Unexpected request field: ${field}`);
    }
  }
  const transaction = body.transaction;
  if (
    !transaction ||
    typeof transaction !== 'object' ||
    Array.isArray(transaction)
  ) {
    throw badRequest('INVALID_TRANSACTION', 'transaction object is required');
  }
  const allowedTransactionFields = new Set([
    'chainId',
    'safe',
    'safeNonce',
    'to',
    'value',
    'data',
    'operation',
    'safeTxGas',
    'baseGas',
    'gasPrice',
    'gasToken',
    'refundReceiver',
  ]);
  for (const field of Object.keys(transaction)) {
    if (!allowedTransactionFields.has(field)) {
      throw badRequest(
        'INVALID_TRANSACTION',
        `Unexpected transaction field: ${field}`,
      );
    }
  }
  for (const field of ['safe', 'to', 'gasToken', 'refundReceiver']) {
    if (!isAddress(transaction[field])) {
      throw badRequest(
        'INVALID_TRANSACTION',
        `${field} must be a valid EVM address`,
      );
    }
  }
  if (
    !isHex(transaction.data, { strict: true }) ||
    transaction.data.length % 2 !== 0
  ) {
    throw badRequest(
      'INVALID_TRANSACTION',
      'data must be even-length 0x-prefixed hex bytes',
    );
  }
  if (!Number.isSafeInteger(transaction.chainId) || transaction.chainId <= 0) {
    throw badRequest(
      'INVALID_TRANSACTION',
      'chainId must be a positive safe integer',
    );
  }
  if (
    !Number.isInteger(transaction.operation) ||
    ![0, 1].includes(transaction.operation)
  ) {
    throw badRequest(
      'INVALID_TRANSACTION',
      'operation must be 0 (CALL) or 1 (DELEGATECALL)',
    );
  }
  const normalized = {
    chainId: transaction.chainId,
    safe: transaction.safe,
    safeNonce: parseUint('safeNonce', transaction.safeNonce).toString(),
    to: transaction.to,
    value: parseUint('value', transaction.value).toString(),
    data: transaction.data,
    operation: transaction.operation,
    safeTxGas: parseUint('safeTxGas', transaction.safeTxGas).toString(),
    baseGas: parseUint('baseGas', transaction.baseGas).toString(),
    gasPrice: parseUint('gasPrice', transaction.gasPrice).toString(),
    gasToken: transaction.gasToken,
    refundReceiver: transaction.refundReceiver,
  };
  if (
    body.declaredMetadata !== undefined &&
    (typeof body.declaredMetadata !== 'object' ||
      body.declaredMetadata === null ||
      Array.isArray(body.declaredMetadata))
  ) {
    throw badRequest(
      'INVALID_REQUEST',
      'declaredMetadata must be an object when supplied',
    );
  }
  for (const field of ['scenarioId', 'fixtureId', 'demoScene']) {
    if (
      body[field] !== undefined &&
      (typeof body[field] !== 'string' ||
        body[field].length > 80 ||
        !/^[A-Za-z0-9._:-]+$/.test(body[field]))
    ) {
      throw badRequest(
        'INVALID_REQUEST',
        `${field} must use letters, digits, dot, underscore, colon, or hyphen (max 80 characters)`,
      );
    }
  }
  return normalized;
}

function toPublicProposal(proposal, config) {
  const signerAddresses = [...proposal.attestations.keys()];
  const thresholdMet = signerAddresses.length >= config.verifierThreshold;
  return {
    proposalId: proposal.proposalId,
    scenarioId: proposal.scenarioId,
    fixtureId: proposal.fixtureId,
    demoScene: proposal.demoScene,
    safeVersion: config.safeVersion,
    transaction: proposal.transaction,
    safeTxHash: proposal.safeTxHash,
    declaredMetadata: proposal.declaredMetadata,
    decoded: proposal.decoded,
    decision: proposal.decoded.decision,
    workflowStatus: thresholdMet ? 'APPROVED' : proposal.decoded.workflowStatus,
    verifier: {
      threshold: config.verifierThreshold,
      validSignerCount: signerAddresses.length,
      signers: signerAddresses,
      thresholdMet,
      state: thresholdMet
        ? 'THRESHOLD_MET_OFFCHAIN'
        : config.verifierAddresses.length > 0
          ? 'COLLECTING_EXTERNAL_SIGNATURES'
          : 'VERIFIERS_NOT_CONFIGURED',
    },
    execution: {
      attemptedOnchain: false,
      readyForExecution: false,
      gate: thresholdMet
        ? 'REGISTRY_SUBMISSION_NOT_IMPLEMENTED'
        : 'VERIFIER_THRESHOLD_NOT_MET',
      transactionHash: null,
      observedRevert: null,
    },
    source: {
      kind: 'api_and_rpc_read',
      blockNumber: proposal.decoded.source.blockNumber,
      blockHash: proposal.decoded.source.blockHash,
    },
    explanation: proposal.explanation ?? null,
    eventsUrl: `/v1/proposals/${proposal.proposalId}/events`,
  };
}

export function createProposalService({ client, config, store }) {
  const policyHash = computePolicyHash(config);

  return {
    policyHash,
    async decodeRaw(rawTransaction) {
      const transaction = validateTransaction({ transaction: rawTransaction });
      await assertSafeReady(
        client,
        config,
        transaction.chainId,
        transaction.safe,
      );
      const currentNonce = await client.readContract({
        address: config.safeAddress,
        abi: SAFE_ABI,
        functionName: 'nonce',
      });
      if (currentNonce !== BigInt(transaction.safeNonce)) {
        const error = new Error(
          'Raw transaction Safe nonce is stale or does not match the live Safe nonce',
        );
        error.code = 'NONCE_STALE';
        error.statusCode = 409;
        throw error;
      }
      const safeTxHash = await getCanonicalSafeTxHash(
        client,
        config.safeAddress,
        transaction,
      );
      const decoded = await decodeAndDecide({
        client,
        config,
        transaction,
        safeTxHash,
        policyHash,
      });
      const explanation = await explainTransaction({
        transaction,
        decision: decoded.decision,
        decoded,
        policy: config,
        refusalReason: decoded.reasonCode,
      });
      return {
        decision: decoded.decision,
        decodeStatus: decoded.decodeStatus,
        reasonCode: decoded.reasonCode,
        intent: decoded.intent,
        intentHash: decoded.intentHash,
        safeTxHash,
        policyHash: policyHash ?? null,
        decoderVersion: DECODER_VERSION,
        source: decoded.source,
        signingPerformed: false,
        explanation,
      };
    },
    getPublicProposal(proposalId) {
      const proposal = store.proposals.get(proposalId);
      return proposal ? toPublicProposal(proposal, config) : undefined;
    },
    async create(body) {
      const transaction = validateTransaction(body);
      await assertSafeReady(
        client,
        config,
        transaction.chainId,
        transaction.safe,
      );

      const currentNonce = await client.readContract({
        address: config.safeAddress,
        abi: SAFE_ABI,
        functionName: 'nonce',
      });
      if (currentNonce !== BigInt(transaction.safeNonce)) {
        const error = new Error(
          'Proposal Safe nonce is stale or does not match the live Safe nonce',
        );
        error.code = 'NONCE_STALE';
        error.statusCode = 409;
        throw error;
      }

      const activeKey = `${transaction.safe.toLowerCase()}:${transaction.safeNonce}`;
      const existingProposalId = store.activeBySafeNonce.get(activeKey);
      if (existingProposalId) {
        const existing = store.proposals.get(existingProposalId);
        if (
          !existing ||
          ![
            'EXECUTED',
            'EXECUTION_FAILED',
            'REJECTED',
            'QUARANTINED',
            'EXPIRED',
            'CANCELLED',
          ].includes(existing.workflowStatus)
        ) {
          const error = new Error(
            'An active proposal already occupies this Safe nonce',
          );
          error.code = 'COMPETING_PROPOSAL';
          error.statusCode = 409;
          throw error;
        }
        store.activeBySafeNonce.delete(activeKey);
      }

      const proposalId = `0x${randomBytes(32).toString('hex')}`;
      store.activeBySafeNonce.set(activeKey, proposalId);
      let safeTxHash;
      try {
        safeTxHash = await getCanonicalSafeTxHash(
          client,
          config.safeAddress,
          transaction,
        );
      } catch {
        store.activeBySafeNonce.delete(activeKey);
        const error = new Error(
          'Unable to compute Safe transaction digest from the configured Safe',
        );
        error.code = 'RPC_UNAVAILABLE';
        error.statusCode = 503;
        throw error;
      }
      const scenarioId =
        typeof body.scenarioId === 'string' && body.scenarioId.length <= 80
          ? body.scenarioId
          : `proposal-${proposalId.slice(2, 10)}`;
      const proposal = {
        proposalId,
        scenarioId,
        fixtureId: typeof body.fixtureId === 'string' ? body.fixtureId : null,
        demoScene: typeof body.demoScene === 'string' ? body.demoScene : null,
        transaction,
        safeTxHash,
        declaredMetadata: body.declaredMetadata ?? null,
        decoded: null,
        workflowStatus: 'PROPOSED',
        attestations: new Map(),
        events: [],
        listeners: new Set(),
      };
      store.proposals.set(proposalId, proposal);

      let lastEvent = appendEvent(proposal, 'proposal.created', {
        rawTransaction: transaction,
        declaredMetadata: body.declaredMetadata ?? null,
        metadataTrust: 'UNTRUSTED_CLIENT_INPUT',
      });
      lastEvent = appendEvent(
        proposal,
        'decode.started',
        {
          decoderVersion: 'native-erc20-transfer-v1',
        },
        lastEvent.eventId,
      );

      let decoded;
      try {
        decoded = await decodeAndDecide({
          client,
          config,
          transaction,
          safeTxHash,
          policyHash,
        });
      } catch {
        store.proposals.delete(proposalId);
        store.activeBySafeNonce.delete(activeKey);
        const error = new Error(
          'Unable to read target code and block context from the configured RPC',
        );
        error.code = 'RPC_UNAVAILABLE';
        error.statusCode = 503;
        throw error;
      }
      proposal.decoded = decoded;
      proposal.workflowStatus = decoded.workflowStatus;
      const explanation = await explainTransaction({
        transaction,
        decision: decoded.decision,
        decoded,
        policy: config,
        refusalReason: decoded.reasonCode,
      });
      proposal.explanation = explanation;
      lastEvent = appendEvent(
        proposal,
        'decode.completed',
        {
          decodeStatus: decoded.decodeStatus,
          intent: decoded.intent,
          intentHash: decoded.intentHash,
          targetCodeHash: decoded.targetCodeHash,
          sourceBlockNumber: decoded.source.blockNumber,
          sourceBlockHash: decoded.source.blockHash,
        },
        lastEvent.eventId,
      );
      appendEvent(
        proposal,
        'policy.evaluated',
        {
          decision: decoded.decision,
          policyClass: decoded.policyClass,
          reasonCode: decoded.reasonCode,
          policyHash: policyHash ?? null,
        },
        lastEvent.eventId,
      );

      return toPublicProposal(proposal, config);
    },
    getInternalProposal(proposalId) {
      return store.proposals.get(proposalId);
    },
    getConfigView() {
      return {
        chainId: config.chainId,
        safeVersion: config.safeVersion,
        safeAddress: config.safeAddress ?? null,
        safeConfigured: Boolean(config.safeAddress),
        policyConfigured: Boolean(policyHash),
        policyHash: policyHash ?? null,
        maxNativeTransferWei: config.maxNativeTransferWei?.toString() ?? null,
        nativeRecipients: config.nativeRecipients,
        verifierAddresses: config.verifierAddresses,
        verifierSetConfigured: Boolean(
          config.verifierSetId && config.verifierAddresses.length,
        ),
        verifierThreshold: config.verifierThreshold,
        supportedActions: ['native.transfer', 'erc20.transfer'],
        registryConfigured: Boolean(config.registryAddress),
        registryAddress: config.registryAddress ?? null,
        verifierSetId: config.verifierSetId ?? null,
        maxAttestationSeconds: config.maxAttestationSeconds,
        registrySubmissionAvailable: Boolean(config.registryAddress),
        safeExecutionAvailable: Boolean(
          config.safeAddress &&
          config.registryAddress &&
          config.relayerPrivateKey &&
          config.chainId === 31337,
        ),
        relayerConfigured: Boolean(config.relayerPrivateKey),
        executionAdapter: 'local_anvil_signed_safe_transaction',
        dataRetention: 'in-memory; cleared on process restart',
      };
    },
  };
}

export function serializeProposal(service, proposalId) {
  return service.getPublicProposal(proposalId);
}
