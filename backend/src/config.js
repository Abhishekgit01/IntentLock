import { isAddress, isHex } from 'viem';

const DEFAULTS = {
  host: '127.0.0.1',
  port: 8787,
  chainId: 31337,
  rpcUrl: 'http://127.0.0.1:8545',
  safeVersion: '1.4.1',
  verifierThreshold: 2,
  maxAttestationSeconds: 900,
  maxFutureClockSkewSeconds: 30,
  allowedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
};

function readInteger(
  name,
  value,
  fallback,
  { min = 0, max = Number.MAX_SAFE_INTEGER } = {},
) {
  const parsed = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function readOptionalAddress(name, value) {
  if (!value) return undefined;
  if (!isAddress(value)) throw new Error(`${name} must be a valid EVM address`);
  return value;
}

function readAddressList(name, value) {
  if (!value?.trim()) return [];
  const addresses = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  for (const address of addresses) {
    if (!isAddress(address))
      throw new Error(`${name} contains an invalid EVM address`);
  }
  const normalized = addresses.map((address) => address.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${name} must not contain duplicate addresses`);
  }
  return addresses;
}

function readBytes32List(name, value) {
  if (!value?.trim()) return [];
  const values = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  for (const item of values) {
    if (!isHex(item, { strict: true }) || item.length !== 66) {
      throw new Error(`${name} entries must be 32-byte hex values`);
    }
  }
  return values;
}

function readOptionalBytes32(name, value) {
  if (!value) return undefined;
  if (!isHex(value, { strict: true }) || value.length !== 66) {
    throw new Error(`${name} must be a 32-byte hex value`);
  }
  return value;
}

export function loadConfig(env = process.env) {
  const port = readInteger('PORT', env.PORT, DEFAULTS.port, {
    min: 1,
    max: 65535,
  });
  const chainId = readInteger('CHAIN_ID', env.CHAIN_ID, DEFAULTS.chainId, {
    min: 1,
  });
  const verifierThreshold = readInteger(
    'VERIFIER_THRESHOLD',
    env.VERIFIER_THRESHOLD,
    DEFAULTS.verifierThreshold,
    { min: 1, max: 255 },
  );
  const maxAttestationSeconds = readInteger(
    'MAX_ATTESTATION_SECONDS',
    env.MAX_ATTESTATION_SECONDS,
    DEFAULTS.maxAttestationSeconds,
    { min: 1, max: 86400 },
  );
  const maxFutureClockSkewSeconds = readInteger(
    'MAX_FUTURE_CLOCK_SKEW_SECONDS',
    env.MAX_FUTURE_CLOCK_SKEW_SECONDS,
    DEFAULTS.maxFutureClockSkewSeconds,
    { min: 0, max: 3600 },
  );
  const policyCap = env.POLICY_MAX_NATIVE_TRANSFER_WEI;
  if (policyCap && !/^(0|[1-9][0-9]*)$/.test(policyCap)) {
    throw new Error(
      'POLICY_MAX_NATIVE_TRANSFER_WEI must be a decimal integer string',
    );
  }
  const erc20Cap = env.POLICY_MAX_ERC20_TRANSFER_BASE_UNITS;
  if (erc20Cap && !/^(0|[1-9][0-9]*)$/.test(erc20Cap)) {
    throw new Error(
      'POLICY_MAX_ERC20_TRANSFER_BASE_UNITS must be a decimal integer string',
    );
  }
  if (env.RPC_URL) {
    const rpcUrl = new URL(env.RPC_URL);
    if (!['http:', 'https:'].includes(rpcUrl.protocol)) {
      throw new Error('RPC_URL must use HTTP or HTTPS');
    }
  }
  const safeVersion = env.SAFE_VERSION ?? DEFAULTS.safeVersion;
  if (safeVersion !== '1.4.1')
    throw new Error('Only Safe version 1.4.1 is supported by this backend');

  const verifierAddresses = readAddressList(
    'VERIFIER_ADDRESSES',
    env.VERIFIER_ADDRESSES,
  );
  const nativeRecipients = readAddressList(
    'POLICY_ALLOWED_NATIVE_RECIPIENTS',
    env.POLICY_ALLOWED_NATIVE_RECIPIENTS,
  );
  const erc20Tokens = readAddressList(
    'POLICY_ALLOWED_ERC20_TOKENS',
    env.POLICY_ALLOWED_ERC20_TOKENS,
  );
  const erc20TokenCodeHashes = readBytes32List(
    'POLICY_ERC20_TOKEN_CODE_HASHES',
    env.POLICY_ERC20_TOKEN_CODE_HASHES,
  );
  if (erc20Tokens.length !== erc20TokenCodeHashes.length) {
    throw new Error(
      'POLICY_ERC20_TOKEN_CODE_HASHES must contain one code hash for each POLICY_ALLOWED_ERC20_TOKENS entry in the same order',
    );
  }
  const erc20Recipients = readAddressList(
    'POLICY_ALLOWED_ERC20_RECIPIENTS',
    env.POLICY_ALLOWED_ERC20_RECIPIENTS,
  );
  if (
    verifierAddresses.length > 0 &&
    verifierThreshold > verifierAddresses.length
  ) {
    throw new Error(
      'VERIFIER_THRESHOLD cannot exceed configured VERIFIER_ADDRESSES',
    );
  }
  const allowedOrigins = (
    env.ALLOWED_ORIGINS ?? DEFAULTS.allowedOrigins.join(',')
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of allowedOrigins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('ALLOWED_ORIGINS entries must use HTTP or HTTPS');
    }
  }

  return Object.freeze({
    host: env.HOST ?? DEFAULTS.host,
    port,
    chainId,
    rpcUrl: env.RPC_URL ?? DEFAULTS.rpcUrl,
    safeVersion,
    safeAddress: readOptionalAddress('SAFE_ADDRESS', env.SAFE_ADDRESS),
    registryAddress: readOptionalAddress(
      'REGISTRY_ADDRESS',
      env.REGISTRY_ADDRESS,
    ),
    verifierSetId: readOptionalBytes32('VERIFIER_SET_ID', env.VERIFIER_SET_ID),
    verifierAddresses,
    verifierThreshold,
    maxAttestationSeconds,
    maxFutureClockSkewSeconds,
    maxNativeTransferWei: policyCap ? BigInt(policyCap) : undefined,
    maxErc20TransferBaseUnits: erc20Cap ? BigInt(erc20Cap) : undefined,
    nativeRecipients,
    erc20Tokens: erc20Tokens.map((address, index) => ({
      address,
      codeHash: erc20TokenCodeHashes[index],
    })),
    erc20Recipients,
    allowedOrigins,
  });
}
