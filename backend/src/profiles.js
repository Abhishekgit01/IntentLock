import { isAddress, isHex } from 'viem';
import { createChainClient, SAFE_ABI } from './safe.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const BUILTIN_PROFILES = {
  'anvil-local': {
    name: 'anvil-local',
    chainId: 31337,
    rpcUrl: 'http://127.0.0.1:8545',
    endpoint: 'http://127.0.0.1:8787',
    safeVersion: '1.4.1',
    safeAddress: '0x67f2Cd72901b066233E8aEc8e832B9eC8f5DD56B',
    registryAddress: '0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0',
    guardAddress: '0x948B3c65b89DF0B4894ABE91E6D02FE579834F8F',
    verifierSetId: '0x0da8fbd47d9ccb96bb569fa7d70ca5259d6d0e5ecab7eb5fbf868c9f08c64ffa',
    verifierThreshold: 2,
    expectedPolicyHash: null,
    broadcastAllowed: true,
    isProduction: false,
    description: 'Local Anvil development environment',
  },
  'orchard-cyprus1': {
    name: 'orchard-cyprus1',
    chainId: 15000,
    rpcUrl: 'https://orchard.rpc.quai.network',
    endpoint: 'http://127.0.0.1:8787',
    safeVersion: '1.4.1',
    safeAddress: '0x0056b3F4Ece03649932DBC6126C41002dA279d6e',
    registryAddress: '0x000AbC550b505b67B4C7519Ea6D77c6E69C0F3e1',
    guardAddress: '0x001712aE71340Bf33878bA524d78E101DEd46C55',
    verifierSetId: '0x21dd06fb89dad8515eb74018797ed73aa98524530db470664ea49d31b9d06d35',
    verifierThreshold: 2,
    expectedPolicyHash: null,
    broadcastAllowed: false,
    isProduction: false,
    description: 'Quai Orchard Cyprus-1 testnet profile (read-only by default)',
  },
};

export function validateProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('Profile must be a valid configuration object');
  }
  if (!profile.name || typeof profile.name !== 'string') {
    throw new Error('Profile name is required');
  }
  if (typeof profile.chainId !== 'number' || !Number.isSafeInteger(profile.chainId) || profile.chainId <= 0) {
    throw new Error('Profile chainId must be a positive integer');
  }
  if (profile.chainId !== 31337 && profile.chainId !== 15000) {
    throw new Error(`Profile chainId ${profile.chainId} is not on the approved network allowlist (31337, 15000)`);
  }
  if (!profile.rpcUrl || typeof profile.rpcUrl !== 'string') {
    throw new Error('Profile rpcUrl is required');
  }
  const rpc = new URL(profile.rpcUrl);
  if (rpc.protocol !== 'https:' && rpc.hostname !== '127.0.0.1' && rpc.hostname !== 'localhost') {
    throw new Error('Profile rpcUrl must use HTTPS outside local loopback');
  }
  if (!profile.endpoint || typeof profile.endpoint !== 'string') {
    throw new Error('Profile endpoint is required');
  }
  const ep = new URL(profile.endpoint);
  if (ep.protocol !== 'https:' && ep.hostname !== '127.0.0.1' && ep.hostname !== 'localhost') {
    throw new Error('Profile endpoint must use HTTPS outside local loopback');
  }
  if (profile.safeAddress && !isAddress(profile.safeAddress, { strict: false })) {
    throw new Error('Profile safeAddress must be a valid EVM address');
  }
  if (profile.registryAddress && !isAddress(profile.registryAddress, { strict: false })) {
    throw new Error('Profile registryAddress must be a valid EVM address');
  }
  if (profile.guardAddress && !isAddress(profile.guardAddress, { strict: false })) {
    throw new Error('Profile guardAddress must be a valid EVM address');
  }
  if (profile.verifierSetId && (!isHex(profile.verifierSetId, { strict: true }) || profile.verifierSetId.length !== 66)) {
    throw new Error('Profile verifierSetId must be a 32-byte hex string');
  }
  if (profile.verifierThreshold !== undefined && (typeof profile.verifierThreshold !== 'number' || profile.verifierThreshold < 1)) {
    throw new Error('Profile verifierThreshold must be an integer >= 1');
  }
  return profile;
}

export async function resolveProfile({ profileName, configPath, overrides = {} } = {}) {
  let baseProfile = null;
  if (configPath) {
    const raw = await readFile(path.resolve(configPath), 'utf8');
    const parsed = JSON.parse(raw);
    const targetName = profileName || parsed.defaultProfile || 'default';
    baseProfile = parsed.profiles?.[targetName] || (parsed.chainId ? parsed : null);
    if (!baseProfile) {
      throw new Error(`Profile "${targetName}" not found in configuration file: ${configPath}`);
    }
  } else if (profileName) {
    baseProfile = BUILTIN_PROFILES[profileName];
    if (!baseProfile) {
      throw new Error(`Unknown profile "${profileName}". Available profiles: ${Object.keys(BUILTIN_PROFILES).join(', ')}`);
    }
  } else {
    // Default to anvil-local or environment config
    baseProfile = BUILTIN_PROFILES['anvil-local'];
  }

  const merged = {
    ...baseProfile,
    ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined && v !== null)),
  };

  return validateProfile(merged);
}

export function redactProfile(profile) {
  const { ...safe } = profile;
  // Ensure no secrets exist in profile
  delete safe.privateKey;
  delete safe.secret;
  delete safe.token;
  delete safe.auth;
  return safe;
}

export async function verifyProfileAgainstChain(profile, chainClient = null) {
  const client = chainClient || createChainClient({ chainId: profile.chainId, rpcUrl: profile.rpcUrl });
  const observedChainId = await client.getChainId();
  if (observedChainId !== profile.chainId) {
    throw new Error(`Chain ID mismatch: profile expected ${profile.chainId}, observed on RPC: ${observedChainId}`);
  }

  if (profile.safeAddress) {
    const code = await client.getBytecode({ address: profile.safeAddress });
    if (!code || code === '0x') {
      throw new Error(`Safe address ${profile.safeAddress} has no contract bytecode on chain ${observedChainId}`);
    }
    const version = await client.readContract({
      address: profile.safeAddress,
      abi: SAFE_ABI,
      functionName: 'VERSION',
    });
    if (profile.safeVersion && version !== profile.safeVersion) {
      throw new Error(`Safe version mismatch: profile expected ${profile.safeVersion}, observed ${version}`);
    }
    // Check modules: must be empty per D-016
    try {
      const [modules] = await client.readContract({
        address: profile.safeAddress,
        abi: SAFE_ABI,
        functionName: 'getModulesPaginated',
        args: ['0x0000000000000000000000000000000000000001', 10n],
      });
      if (modules && modules.length > 0) {
        throw new Error(`Safety violation: Safe has ${modules.length} active module(s). Module execution is strictly prohibited under D-016.`);
      }
    } catch (e) {
      if (e.message.includes('Safety violation')) throw e;
      // If getModulesPaginated reverts, continue
    }
  }

  return { verified: true, chainId: observedChainId };
}
