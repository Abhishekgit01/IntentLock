import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { keccak256 } from 'viem';
import { assertSafeReady, createChainClient, SAFE_ABI } from './safe.js';
import { createProposalService, serializeProposal } from './proposals.js';
import { addAttestation } from './attestations.js';
import { executeProposalOnchain } from './execution.js';
import { subscribe } from './events.js';
import { compilePolicyFile, lintPolicyDraft } from './policy-format.js';
import { DECODER_VERSION } from './policy.js';

function apiError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function executionEnabled(config) {
  const supportedNetwork =
    config.chainId === 31337 ||
    (config.chainId === 15000 && config.allowQuaiBroadcast);
  return Boolean(
    config.safeAddress &&
    config.registryAddress &&
    config.relayerPrivateKey &&
    supportedNetwork,
  );
}

function sendSseEvent(response, event) {
  response.write(`id: ${event.sequence}\n`);
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function buildApp(config) {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    bodyLimit: 256 * 1024,
    genReqId: () => randomUUID(),
  });
  const client = createChainClient(config);
  const store = {
    proposals: new Map(),
    activeBySafeNonce: new Map(),
  };
  app.addHook('onClose', async () => {
    await client.close?.();
  });
  const proposalService = createProposalService({ client, config, store });

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && config.allowedOrigins.includes(origin)) {
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'Origin');
      reply.header('access-control-allow-credentials', 'false');
    }
    if (request.method === 'OPTIONS') {
      if (origin && !config.allowedOrigins.includes(origin)) {
        return reply.code(403).send();
      }
      reply
        .header('access-control-allow-methods', 'GET,POST,OPTIONS')
        .header('access-control-allow-headers', 'content-type,last-event-id')
        .header('access-control-max-age', '600');
      return reply.code(204).send();
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      Number.isInteger(error.statusCode) && error.statusCode >= 400
        ? error.statusCode
        : 500;
    const code =
      typeof error.code === 'string' && error.code.length <= 80
        ? error.code
        : 'INTERNAL_ERROR';
    if (statusCode >= 500)
      request.log.error(
        { err: error, requestId: request.id },
        'Request failed',
      );
    const message =
      statusCode >= 500 && code === 'INTERNAL_ERROR'
        ? 'Internal server error'
        : error.message;
    return reply.code(statusCode).send({
      error: {
        code,
        message,
        retryable: statusCode >= 500,
        requestId: request.id,
      },
    });
  });

  app.get('/health', async (_request, reply) => {
    const publicVerifierInfo = {
      signerAddress: config.verifierSignerAddress ?? null,
      policyHash: proposalService.policyHash ?? null,
      decoderVersion: DECODER_VERSION,
      safeAddress: config.safeAddress ?? null,
      safeNonce: null,
      nativeRecipients: config.nativeRecipients,
      maxNativeTransferWei: config.maxNativeTransferWei?.toString() ?? null,
      erc20Recipients: config.erc20Recipients,
      erc20Tokens: config.erc20Tokens,
      verifierAddresses: config.verifierAddresses,
    };
    try {
      const chainId = await client.getChainId();
      const rpcReady = chainId === config.chainId;
      let safeReady = false;
      if (rpcReady && config.safeAddress) {
        try {
          await assertSafeReady(
            client,
            config,
            config.chainId,
            config.safeAddress,
          );
          safeReady = true;
          publicVerifierInfo.safeNonce = (
            await client.readContract({
              address: config.safeAddress,
              abi: SAFE_ABI,
              functionName: 'nonce',
            })
          ).toString();
        } catch {
          safeReady = false;
        }
      }
      const policyReady = Boolean(proposalService.policyHash);
      const status =
        rpcReady && safeReady && policyReady ? 'ready' : 'degraded';
      return reply.code(status === 'ready' ? 200 : 503).send({
        ...publicVerifierInfo,
        status,
        api: 'ok',
        rpc: rpcReady ? 'connected' : 'chain_mismatch',
        configuredChainId: config.chainId,
        observedChainId: chainId,
        safeConfigured: safeReady,
        policyConfigured: policyReady,
        registrySubmissionAvailable: Boolean(config.registryAddress),
        executionAvailable: executionEnabled(config),
        relayerConfigured: Boolean(config.relayerPrivateKey),
      });
    } catch {
      return reply.code(503).send({
        ...publicVerifierInfo,
        status: 'unavailable',
        api: 'ok',
        rpc: 'unavailable',
        configuredChainId: config.chainId,
        safeConfigured: Boolean(config.safeAddress),
        registrySubmissionAvailable: false,
        executionAvailable: false,
        relayerConfigured: Boolean(config.relayerPrivateKey),
      });
    }
  });

  app.post('/v1/policy/compile', async (request) =>
    compilePolicyFile(request.body),
  );

  app.post('/v1/policy/lint', async (request) => ({
    issues: lintPolicyDraft(request.body),
  }));

  app.post('/decode', async (request) =>
    proposalService.decodeRaw(request.body),
  );

  app.get('/v1/config', async () => proposalService.getConfigView());

  app.get('/v1/context', async (request, reply) => {
    try {
      const chainId = await client.getChainId();
      const block = await client.getBlock({ blockTag: 'latest' });
      const context = {
        chainId,
        observedAtBlock: block.number.toString(),
        blockHash: block.hash,
        timestamp: block.timestamp.toString(),
        safeVersion: config.safeVersion,
        safeAddress: config.safeAddress ?? null,
        safeNonce: null,
        owners: null,
        threshold: null,
        safeBalanceWei: null,
        safeCodeHash: null,
        guardAddress: null,
        enabledModules: null,
        source: 'rpc_read',
      };

      if (!config.safeAddress) {
        return reply.code(503).send({
          ...context,
          ready: false,
          error: 'SAFE_NOT_CONFIGURED',
        });
      }
      await assertSafeReady(client, config, config.chainId, config.safeAddress);
      const [
        safeNonce,
        safeBalance,
        code,
        modules,
        guardSlot,
        owners,
        threshold,
      ] = await Promise.all([
        client.readContract({
          address: config.safeAddress,
          abi: SAFE_ABI,
          functionName: 'nonce',
          blockNumber: block.number,
        }),
        client.getBalance({
          address: config.safeAddress,
          blockNumber: block.number,
        }),
        client.getBytecode({
          address: config.safeAddress,
          blockNumber: block.number,
        }),
        client.readContract({
          address: config.safeAddress,
          abi: SAFE_ABI,
          functionName: 'getModulesPaginated',
          args: ['0x0000000000000000000000000000000000000001', 10n],
          blockNumber: block.number,
        }),
        client.getStorageAt({
          address: config.safeAddress,
          slot: '0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8',
          blockNumber: block.number,
        }),
        client.readContract({
          address: config.safeAddress,
          abi: SAFE_ABI,
          functionName: 'getOwners',
          blockNumber: block.number,
        }),
        client.readContract({
          address: config.safeAddress,
          abi: SAFE_ABI,
          functionName: 'getThreshold',
          blockNumber: block.number,
        }),
      ]);
      context.safeNonce = safeNonce.toString();
      context.safeBalanceWei = safeBalance.toString();
      context.safeCodeHash = code && code !== '0x' ? keccak256(code) : null;
      context.guardAddress = guardSlot
        ? `0x${BigInt(guardSlot).toString(16).slice(-40).padStart(40, '0')}`
        : null;
      context.enabledModules = modules[0].length;
      context.owners = owners;
      context.threshold = threshold.toString();
      return { ...context, ready: true };
    } catch (error) {
      request.log.warn({ err: error }, 'Unable to read live Safe context');
      return reply.code(503).send({
        chainId: config.chainId,
        safeVersion: config.safeVersion,
        safeAddress: config.safeAddress ?? null,
        source: 'rpc_read',
        ready: false,
        error: error.code ?? 'RPC_UNAVAILABLE',
      });
    }
  });

  app.post('/v1/proposals', async (request, reply) => {
    const proposal = await proposalService.create(request.body);
    return reply.code(201).send(proposal);
  });

  app.get('/v1/proposals/:proposalId', async (request) => {
    const proposal = serializeProposal(
      proposalService,
      request.params.proposalId,
    );
    if (!proposal)
      throw apiError(
        404,
        'PROPOSAL_NOT_FOUND',
        'Proposal was not found in this backend process',
      );
    return proposal;
  });

  app.post('/v1/proposals/:proposalId/attestations', async (request, reply) => {
    const proposal = proposalService.getInternalProposal(
      request.params.proposalId,
    );
    if (!proposal)
      throw apiError(
        404,
        'PROPOSAL_NOT_FOUND',
        'Proposal was not found in this backend process',
      );
    const result = await addAttestation({
      client,
      config,
      policyHash: proposalService.policyHash,
      proposal,
      input: request.body,
    });
    return reply.code(202).send({
      accepted: true,
      signer: result.signer,
      validSignerCount: result.validSignerCount,
      threshold: result.threshold,
      thresholdMet: result.validSignerCount >= result.threshold,
      registrySubmission: 'NOT_SUBMITTED',
      executionAvailable: executionEnabled(config),
    });
  });

  app.post('/v1/proposals/:proposalId/execute', async (request, reply) => {
    const proposal = proposalService.getInternalProposal(
      request.params.proposalId,
    );
    if (!proposal)
      throw apiError(
        404,
        'PROPOSAL_NOT_FOUND',
        'Proposal was not found in this backend process',
      );
    const body = request.body ?? {};
    if (
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== 'safeSignatures')
    ) {
      throw apiError(
        400,
        'INVALID_EXECUTION_REQUEST',
        'Only the Safe signature bytes may be submitted to this endpoint',
      );
    }
    const result = await executeProposalOnchain({
      client,
      config,
      proposal,
      safeSignatures: body.safeSignatures,
    });
    return reply.code(result.success ? 200 : 409).send(result);
  });

  app.get('/v1/proposals/:proposalId/events', async (request, reply) => {
    const proposal = proposalService.getInternalProposal(
      request.params.proposalId,
    );
    if (!proposal)
      throw apiError(
        404,
        'PROPOSAL_NOT_FOUND',
        'Proposal was not found in this backend process',
      );
    const lastEventId = Number(request.headers['last-event-id'] ?? 0);
    if (!Number.isSafeInteger(lastEventId) || lastEventId < 0) {
      throw apiError(
        400,
        'INVALID_EVENT_CURSOR',
        'Last-Event-ID must be a non-negative event sequence',
      );
    }

    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    response.write(': connected\n\n');
    for (const event of proposal.events) {
      if (event.sequence > lastEventId) sendSseEvent(response, event);
    }
    const unsubscribe = subscribe(proposal, (event) =>
      sendSseEvent(response, event),
    );
    const heartbeat = setInterval(
      () => response.write(': keep-alive\n\n'),
      15000,
    );
    response.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `No route for ${request.method} ${request.url}`,
        retryable: false,
        requestId: request.id,
      },
    }),
  );

  return app;
}
