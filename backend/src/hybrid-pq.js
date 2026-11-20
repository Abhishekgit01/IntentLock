import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  hashTypedData,
  hexToBytes,
  isAddress,
  isHex,
  recoverTypedDataAddress,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { ATTESTATION_TYPES, normalizeAttestation } from './attestations.js';

const ENVELOPE_FORMAT = 'intentlock.hybrid-verifier-envelope.v1';
const ALGORITHM = 'ML-DSA-65';
const ML_DSA_CONTEXT = new TextEncoder().encode(
  'IntentLock Hybrid Verifier Prototype v1',
);
const ECDSA_KEY_FILE = 'ecdsa.intentlock-key';
const ML_DSA_KEY_FILE = 'ml-dsa-65.intentlock-pq-key';
const PUBLIC_KEY_FILE = 'public.json';

function fingerprint(bytes) {
  return `0x${createHash('sha256').update(bytes).digest('hex')}`;
}

function toHex(bytes) {
  return `0x${Buffer.from(bytes).toString('hex')}`;
}

function strictBytes(value, name, expectedLength) {
  if (!isHex(value, { strict: true }) || value.length % 2 !== 0) {
    throw new Error(`${name} must be even-length 0x-prefixed hex bytes`);
  }
  const bytes = hexToBytes(value);
  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new Error(`${name} must be ${expectedLength} bytes`);
  }
  return bytes;
}

function domainFromInput(input) {
  const domain = input?.domain;
  if (
    !domain ||
    !Number.isSafeInteger(domain.chainId) ||
    domain.chainId <= 0 ||
    !isAddress(domain.verifyingContract)
  ) {
    throw new Error(
      'Input must include domain.chainId and a valid domain.verifyingContract',
    );
  }
  return {
    name: 'IntentLock',
    version: '1',
    chainId: domain.chainId,
    verifyingContract: domain.verifyingContract,
  };
}

function normalizeForHash(attestation) {
  const normalized = normalizeAttestation(attestation);
  return normalized;
}

function serializeAttestation(attestation) {
  return Object.fromEntries(
    Object.entries(attestation).map(([key, value]) => [
      key,
      typeof value === 'bigint' ? value.toString() : value,
    ]),
  );
}

function digestFor(domain, attestation) {
  return hashTypedData({
    domain,
    types: ATTESTATION_TYPES,
    primaryType: 'IntentAttestation',
    message: normalizeForHash(attestation),
  });
}

export async function createHybridKeyBundle(outputDirectory) {
  const outputPath = path.resolve(outputDirectory);
  const parentPath = path.dirname(outputPath);
  await mkdir(parentPath, { recursive: true, mode: 0o700 });

  const ecdsaPrivateKey = generatePrivateKey();
  const ecdsaAccount = privateKeyToAccount(ecdsaPrivateKey);
  const keyPair = ml_dsa65.keygen(randomBytes(32));
  const publicKeyFingerprint = fingerprint(keyPair.publicKey);
  const descriptor = {
    format: 'intentlock.hybrid-verifier-public-key.v1',
    classical: {
      algorithm: 'ECDSA-secp256k1',
      address: ecdsaAccount.address,
    },
    postQuantum: {
      algorithm: ALGORITHM,
      standard: 'FIPS 204',
      publicKey: toHex(keyPair.publicKey),
      publicKeyFingerprint,
    },
  };

  await mkdir(outputPath, { mode: 0o700 });
  try {
    await writeFile(
      path.join(outputPath, ECDSA_KEY_FILE),
      `${ecdsaPrivateKey}\n`,
      {
        flag: 'wx',
        mode: 0o600,
      },
    );
    await writeFile(
      path.join(outputPath, ML_DSA_KEY_FILE),
      `${toHex(keyPair.secretKey)}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    await writeFile(
      path.join(outputPath, PUBLIC_KEY_FILE),
      `${JSON.stringify(descriptor, null, 2)}\n`,
      { flag: 'wx', mode: 0o644 },
    );
  } catch (error) {
    await rm(outputPath, { recursive: true, force: true });
    throw error;
  }

  return {
    directory: outputPath,
    ecdsaAddress: ecdsaAccount.address,
    pqAlgorithm: ALGORITHM,
    pqPublicKeyFingerprint: publicKeyFingerprint,
    publicDescriptor: path.join(outputPath, PUBLIC_KEY_FILE),
    privateKeysPrinted: false,
    onchainProtection: false,
  };
}

export async function readHybridPublicDescriptor(directory) {
  const keyDirectory = path.resolve(directory);
  const descriptor = JSON.parse(
    await readFile(path.join(keyDirectory, PUBLIC_KEY_FILE), 'utf8'),
  );
  if (
    descriptor?.format !== 'intentlock.hybrid-verifier-public-key.v1' ||
    descriptor?.postQuantum?.algorithm !== ALGORITHM ||
    descriptor?.classical?.algorithm !== 'ECDSA-secp256k1' ||
    !isAddress(descriptor.classical.address)
  ) {
    throw new Error('Unsupported or malformed hybrid public key descriptor');
  }
  const pqPublicKey = strictBytes(
    descriptor.postQuantum.publicKey,
    'ML-DSA public key',
    1952,
  );
  if (
    fingerprint(pqPublicKey) !== descriptor.postQuantum.publicKeyFingerprint
  ) {
    throw new Error('ML-DSA public key fingerprint does not match descriptor');
  }
  return { keyDirectory, descriptor, pqPublicKey };
}

async function readKeyBundle(directory) {
  const { keyDirectory, descriptor, pqPublicKey } =
    await readHybridPublicDescriptor(directory);
  return { keyDirectory, descriptor, pqPublicKey };
}

export async function signHybridAttestation({ input, keyDirectory }) {
  const domain = domainFromInput(input);
  const attestation = normalizeForHash(input.attestation);
  const digest = digestFor(domain, input.attestation);
  const {
    keyDirectory: keyPath,
    descriptor,
    pqPublicKey,
  } = await readKeyBundle(keyDirectory);
  const ecdsaPrivateKey = (
    await readFile(path.join(keyPath, ECDSA_KEY_FILE), 'utf8')
  ).trim();
  const pqSecretKey = strictBytes(
    (await readFile(path.join(keyPath, ML_DSA_KEY_FILE), 'utf8')).trim(),
    'ML-DSA secret key',
    4032,
  );
  if (!/^0x[0-9a-fA-F]{64}$/.test(ecdsaPrivateKey)) {
    throw new Error('ECDSA key file must contain one 32-byte private key');
  }

  const ecdsaAccount = privateKeyToAccount(ecdsaPrivateKey);
  if (
    ecdsaAccount.address.toLowerCase() !==
    descriptor.classical.address.toLowerCase()
  ) {
    throw new Error('ECDSA private key does not match the public descriptor');
  }
  const ecdsaSignature = await ecdsaAccount.sign({ hash: digest });
  const pqSignature = ml_dsa65.sign(hexToBytes(digest), pqSecretKey, {
    context: ML_DSA_CONTEXT,
  });
  if (
    !ml_dsa65.verify(pqSignature, hexToBytes(digest), pqPublicKey, {
      context: ML_DSA_CONTEXT,
    })
  ) {
    throw new Error('Generated ML-DSA signature did not match its public key');
  }

  return {
    format: ENVELOPE_FORMAT,
    scope: 'OFFCHAIN_PROTOTYPE_ONLY',
    domain,
    attestation: serializeAttestation(attestation),
    attestationDigest: digest,
    signer: {
      ecdsaAddress: descriptor.classical.address,
      pqAlgorithm: ALGORITHM,
      pqPublicKey: toHex(pqPublicKey),
      pqPublicKeyFingerprint: descriptor.postQuantum.publicKeyFingerprint,
    },
    signatures: {
      ecdsa: ecdsaSignature,
      pq: toHex(pqSignature),
    },
    enforcement: {
      registrySubmission: 'NOT_SUBMITTED',
      onchainAuthorization: 'UNCHANGED_ECDSA_ONLY',
    },
  };
}

export async function verifyHybridEnvelope(
  envelope,
  trustedKeyDirectory,
  expectedDomain,
) {
  if (
    !envelope ||
    envelope.format !== ENVELOPE_FORMAT ||
    envelope.scope !== 'OFFCHAIN_PROTOTYPE_ONLY' ||
    envelope.signer?.pqAlgorithm !== ALGORITHM ||
    !isAddress(envelope.signer?.ecdsaAddress)
  ) {
    throw new Error('Unsupported or malformed hybrid signature envelope');
  }
  if (!trustedKeyDirectory) {
    throw new Error(
      'Verification requires --keys pointing to a trusted public-key descriptor',
    );
  }
  const trusted = await readHybridPublicDescriptor(trustedKeyDirectory);
  if (
    trusted.descriptor.classical.address.toLowerCase() !==
      envelope.signer.ecdsaAddress.toLowerCase() ||
    trusted.descriptor.postQuantum.publicKeyFingerprint !==
      envelope.signer.pqPublicKeyFingerprint
  ) {
    throw new Error('Envelope signer keys do not match the trusted descriptor');
  }
  const domain = domainFromInput({ domain: envelope.domain });
  if (
    !expectedDomain ||
    !Number.isSafeInteger(expectedDomain.chainId) ||
    expectedDomain.chainId !== domain.chainId ||
    !isAddress(expectedDomain.registryAddress) ||
    expectedDomain.registryAddress.toLowerCase() !==
      domain.verifyingContract.toLowerCase()
  ) {
    throw new Error(
      'Envelope domain does not match the expected chain ID and registry address',
    );
  }
  const attestation = normalizeForHash(envelope.attestation);
  const digest = digestFor(domain, envelope.attestation);
  if (digest.toLowerCase() !== envelope.attestationDigest?.toLowerCase()) {
    throw new Error(
      'Envelope digest does not match the attestation and domain',
    );
  }

  const pqPublicKey = strictBytes(
    envelope.signer.pqPublicKey,
    'ML-DSA public key',
    1952,
  );
  if (fingerprint(pqPublicKey) !== envelope.signer.pqPublicKeyFingerprint) {
    throw new Error('ML-DSA public key fingerprint does not match');
  }
  const pqSignature = strictBytes(
    envelope.signatures?.pq,
    'ML-DSA signature',
    3309,
  );
  let pqValid = false;
  try {
    pqValid = ml_dsa65.verify(pqSignature, hexToBytes(digest), pqPublicKey, {
      context: ML_DSA_CONTEXT,
    });
  } catch {
    pqValid = false;
  }

  let recoveredAddress = null;
  try {
    recoveredAddress = await recoverTypedDataAddress({
      domain,
      types: ATTESTATION_TYPES,
      primaryType: 'IntentAttestation',
      message: attestation,
      signature: envelope.signatures?.ecdsa,
    });
  } catch {
    recoveredAddress = null;
  }
  const ecdsaValid =
    recoveredAddress?.toLowerCase() ===
    envelope.signer.ecdsaAddress.toLowerCase();
  return {
    verified: ecdsaValid && pqValid,
    ecdsa: {
      valid: ecdsaValid,
      recoveredAddress,
      expectedAddress: envelope.signer.ecdsaAddress,
    },
    postQuantum: {
      algorithm: ALGORITHM,
      standard: 'FIPS 204',
      valid: pqValid,
      publicKeyFingerprint: envelope.signer.pqPublicKeyFingerprint,
    },
    onchainAuthorization: 'UNCHANGED_ECDSA_ONLY',
    registrySubmission: 'NOT_SUBMITTED',
  };
}

export function envelopeJson(envelope) {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}
