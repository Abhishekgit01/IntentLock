import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { assertSafeReady, createChainClient } from './safe.js';
import { createProposalService, serializeProposal } from './proposals.js';
import { addAttestation } from './attestations.js';
import { subscribe } from './events.js';

function apiError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
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
        } catch {
          safeReady = false;
        }
      }
      const policyReady = Boolean(proposalService.policyHash);
      const status =
        rpcReady && safeReady && policyReady ? 'ready' : 'degraded';
      return reply.code(status === 'ready' ? 200 : 503).send({
        status,
        api: 'ok',
        rpc: rpcReady ? 'connected' : 'chain_mismatch',
        configuredChainId: config.chainId,
        observedChainId: chainId,
        safeConfigured: safeReady,
        policyConfigured: policyReady,
        registrySubmissionAvailable: false,
        executionAvailable: false,
      });
    } catch {
      return reply.code(503).send({
        status: 'unavailable',
        api: 'ok',
        rpc: 'unavailable',
        configuredChainId: config.chainId,
        safeConfigured: Boolean(config.safeAddress),
        registrySubmissionAvailable: false,
        executionAvailable: false,
      });
    }
  });

  app.get('/v1/config', async () => proposalService.getConfigView());

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
      executionAvailable: false,
    });
  });

  app.post('/v1/proposals/:proposalId/execute', async (request) => {
    const proposal = proposalService.getInternalProposal(
      request.params.proposalId,
    );
    if (!proposal)
      throw apiError(
        404,
        'PROPOSAL_NOT_FOUND',
        'Proposal was not found in this backend process',
      );
    if (
      proposal.decoded.decision !== 'ATTEST' &&
      proposal.decoded.decision !== 'ATTEST_WITH_TIMELOCK'
    ) {
      throw apiError(
        409,
        'POLICY_DENIED',
        'Proposal was refused and cannot be executed',
      );
    }
    if (proposal.attestations.size < config.verifierThreshold) {
      throw apiError(
        409,
        'THRESHOLD_NOT_MET',
        'Verifier threshold has not been reached',
      );
    }
    throw apiError(
      501,
      'EXECUTION_ADAPTER_NOT_CONFIGURED',
      'On-chain registry submission and Safe execution are not implemented yet',
    );
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
