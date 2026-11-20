import { isAddress, isHex, recoverTypedDataAddress } from 'viem';
import { appendEvent } from './events.js';

export const ATTESTATION_TYPES = {
  IntentAttestation: [
    { name: 'safe', type: 'address' },
    { name: 'safeNonce', type: 'uint256' },
    { name: 'safeTxHash', type: 'bytes32' },
    { name: 'intentHash', type: 'bytes32' },
    { name: 'intentSchemaVersion', type: 'uint32' },
    { name: 'policyClass', type: 'uint8' },
    { name: 'targetCodeHash', type: 'bytes32' },
    { name: 'resolvedImplementation', type: 'address' },
    { name: 'implementationCodeHash', type: 'bytes32' },
    { name: 'policyHash', type: 'bytes32' },
    { name: 'verifierSetId', type: 'bytes32' },
    { name: 'issuedAt', type: 'uint64' },
    { name: 'validUntil', type: 'uint64' },
    { name: 'proposalId', type: 'bytes32' },
  ],
};

function fail(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  throw error;
}

function bytes32(value) {
  return (
    typeof value === 'string' &&
    isHex(value, { strict: true }) &&
    value.length === 66
  );
}

function decimal(value) {
  return typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
}

export function normalizeAttestation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail(400, 'INVALID_ATTESTATION', 'attestation must be an object');
  }
  const requiredAddresses = ['safe', 'resolvedImplementation'];
  for (const field of requiredAddresses) {
    if (!isAddress(input[field]))
      fail(400, 'INVALID_ATTESTATION', `${field} must be a valid address`);
  }
  for (const field of [
    'safeTxHash',
    'intentHash',
    'targetCodeHash',
    'implementationCodeHash',
    'policyHash',
    'verifierSetId',
    'proposalId',
  ]) {
    if (!bytes32(input[field]))
      fail(400, 'INVALID_ATTESTATION', `${field} must be bytes32`);
  }
  if (
    !decimal(input.safeNonce) ||
    !decimal(input.issuedAt) ||
    !decimal(input.validUntil)
  ) {
    fail(
      400,
      'INVALID_ATTESTATION',
      'safeNonce, issuedAt, and validUntil must be decimal integer strings',
    );
  }
  if (
    input.intentSchemaVersion !== 1 ||
    !Number.isInteger(input.policyClass) ||
    input.policyClass < 0 ||
    input.policyClass > 255
  ) {
    fail(
      400,
      'INVALID_ATTESTATION',
      'Unsupported intent schema version or policy class',
    );
  }
  return {
    safe: input.safe,
    safeNonce: BigInt(input.safeNonce),
    safeTxHash: input.safeTxHash,
    intentHash: input.intentHash,
    intentSchemaVersion: input.intentSchemaVersion,
    policyClass: input.policyClass,
    targetCodeHash: input.targetCodeHash,
    resolvedImplementation: input.resolvedImplementation,
    implementationCodeHash: input.implementationCodeHash,
    policyHash: input.policyHash,
    verifierSetId: input.verifierSetId,
    issuedAt: BigInt(input.issuedAt),
    validUntil: BigInt(input.validUntil),
    proposalId: input.proposalId,
  };
}

function expectedAttestation(proposal, policyHash) {
  const intent = proposal.decoded.intent;
  return {
    safe: proposal.transaction.safe,
    safeNonce: BigInt(proposal.transaction.safeNonce),
    safeTxHash: proposal.safeTxHash,
    intentHash: proposal.decoded.intentHash,
    intentSchemaVersion: 1,
    policyClass: proposal.decoded.policyClass,
    targetCodeHash: proposal.decoded.targetCodeHash,
    resolvedImplementation: intent.resolvedImplementation,
    implementationCodeHash: intent.implementationCodeHash,
    policyHash,
    verifierSetId: undefined,
    proposalId: proposal.proposalId,
  };
}

export async function addAttestation({
  client,
  config,
  policyHash,
  proposal,
  input,
}) {
  if (
    proposal.decoded.decision !== 'ATTEST' &&
    proposal.decoded.decision !== 'ATTEST_WITH_TIMELOCK'
  ) {
    fail(
      409,
      'POLICY_DENIED',
      'This proposal does not accept verifier attestations',
    );
  }
  if (
    !config.registryAddress ||
    !config.verifierSetId ||
    config.verifierAddresses.length === 0 ||
    !policyHash
  ) {
    fail(
      503,
      'VERIFIER_NOT_CONFIGURED',
      'Registry, verifier set, and policy configuration are required',
    );
  }
  const registryCode = await client
    .getBytecode({ address: config.registryAddress })
    .catch(() => {
      fail(503, 'RPC_UNAVAILABLE', 'Unable to check configured registry code');
    });
  if (!registryCode || registryCode === '0x') {
    fail(
      503,
      'REGISTRY_NOT_DEPLOYED',
      'Configured registry address has no contract code',
    );
  }
  const signature = input?.signature;
  if (!isHex(signature, { strict: true }) || signature.length !== 132) {
    fail(
      400,
      'INVALID_SIGNATURE',
      'signature must be a 65-byte ECDSA signature',
    );
  }

  const attestation = normalizeAttestation(input.attestation);
  const expected = expectedAttestation(proposal, policyHash);
  expected.verifierSetId = config.verifierSetId;
  for (const [field, expectedValue] of Object.entries(expected)) {
    const actualValue = attestation[field];
    const matches =
      typeof expectedValue === 'string' && typeof actualValue === 'string'
        ? expectedValue.toLowerCase() === actualValue.toLowerCase()
        : actualValue === expectedValue;
    if (!matches) {
      fail(
        409,
        'ATTESTATION_MISMATCH',
        `Attestation field ${field} does not match this proposal`,
      );
    }
  }

  const block = await client.getBlock({ blockTag: 'latest' }).catch(() => {
    fail(
      503,
      'RPC_UNAVAILABLE',
      'Unable to read chain time for attestation validation',
    );
  });
  const now = block.timestamp;
  const maxUint64 = (1n << 64n) - 1n;
  if (attestation.issuedAt > maxUint64 || attestation.validUntil > maxUint64) {
    fail(
      400,
      'INVALID_ATTESTATION_TIME',
      'Attestation timestamps exceed uint64',
    );
  }
  if (attestation.issuedAt > now + BigInt(config.maxFutureClockSkewSeconds)) {
    fail(
      409,
      'ATTESTATION_FUTURE_DATED',
      'Attestation issue time is too far ahead of chain time',
    );
  }
  if (
    attestation.validUntil <= now ||
    attestation.validUntil <= attestation.issuedAt
  ) {
    fail(
      409,
      'ATTESTATION_EXPIRED',
      'Attestation is expired or has an invalid time interval',
    );
  }
  if (
    attestation.validUntil - attestation.issuedAt >
    BigInt(config.maxAttestationSeconds)
  ) {
    fail(
      409,
      'ATTESTATION_LIFETIME_EXCEEDED',
      'Attestation lifetime exceeds configured maximum',
    );
  }

  let signer;
  try {
    signer = await recoverTypedDataAddress({
      domain: {
        name: 'IntentLock',
        version: '1',
        chainId: config.chainId,
        verifyingContract: config.registryAddress,
      },
      types: ATTESTATION_TYPES,
      primaryType: 'IntentAttestation',
      message: attestation,
      signature,
    });
  } catch {
    fail(
      400,
      'INVALID_SIGNATURE',
      'Signature could not be recovered for the configured attestation domain',
    );
  }
  const normalizedSigner = signer.toLowerCase();
  if (
    !config.verifierAddresses.some(
      (address) => address.toLowerCase() === normalizedSigner,
    )
  ) {
    fail(
      403,
      'UNAUTHORIZED_VERIFIER',
      'Recovered signer is not in the active verifier set',
    );
  }
  if (proposal.attestations.has(normalizedSigner)) {
    fail(
      409,
      'DUPLICATE_SIGNER',
      'This verifier has already attested to this proposal',
    );
  }

  proposal.attestations.set(normalizedSigner, { attestation, signature });
  const responseEvent = appendEvent(
    proposal,
    'verifier.responded',
    {
      verifierId: normalizedSigner,
      result: 'ATTESTED',
      decision: proposal.decoded.decision,
      reasonCode: null,
    },
    proposal.events.at(-1)?.eventId ?? null,
  );
  const validSignerCount = proposal.attestations.size;
  if (
    validSignerCount >= config.verifierThreshold &&
    proposal.workflowStatus !== 'APPROVED'
  ) {
    proposal.workflowStatus = 'APPROVED';
    appendEvent(
      proposal,
      'attestation.threshold_met',
      {
        threshold: config.verifierThreshold,
        validSignerCount,
        attestationId: proposal.proposalId,
        registrySubmission: 'NOT_SUBMITTED',
      },
      responseEvent.eventId,
    );
  }
  return {
    signer: normalizedSigner,
    validSignerCount,
    threshold: config.verifierThreshold,
  };
}
