import { createPublicClient, http, parseAbi } from 'viem';
import { createQuaiChainClient } from './quai-chain.js';

export const SAFE_ABI = parseAbi([
  'function VERSION() view returns (string)',
  'function nonce() view returns (uint256)',
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
  'function getModulesPaginated(address start,uint256 pageSize) view returns (address[] array,address next)',
  'function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 _nonce) view returns (bytes32)',
]);

export function createChainClient(config) {
  if (config.chainId === 15000) return createQuaiChainClient(config);
  if (config.chainId !== 31337) {
    throw new Error('IntentLock supports only Anvil 31337 or Orchard 15000');
  }
  return createPublicClient({
    transport: http(config.rpcUrl, { timeout: 5000 }),
  });
}

export async function assertSafeReady(
  client,
  config,
  submittedChainId,
  safeAddress,
) {
  if (!config.safeAddress) {
    const error = new Error('Safe is not configured on the backend');
    error.code = 'SAFE_NOT_CONFIGURED';
    error.statusCode = 503;
    throw error;
  }
  if (safeAddress.toLowerCase() !== config.safeAddress.toLowerCase()) {
    const error = new Error('Proposal Safe does not match the configured Safe');
    error.code = 'SAFE_MISMATCH';
    error.statusCode = 409;
    throw error;
  }
  const chainId = await client.getChainId();
  if (chainId !== config.chainId || submittedChainId !== config.chainId) {
    const error = new Error(
      'RPC or proposal chain does not match configured chain ID',
    );
    error.code = 'CHAIN_MISMATCH';
    error.statusCode = 409;
    throw error;
  }
  const code = await client.getBytecode({ address: config.safeAddress });
  if (!code || code === '0x') {
    const error = new Error('Configured Safe address has no contract code');
    error.code = 'SAFE_CODE_MISSING';
    error.statusCode = 503;
    throw error;
  }
  const version = await client.readContract({
    address: config.safeAddress,
    abi: SAFE_ABI,
    functionName: 'VERSION',
  });
  if (version !== config.safeVersion) {
    const error = new Error(
      `Configured Safe reports version ${version}, expected ${config.safeVersion}`,
    );
    error.code = 'SAFE_VERSION_MISMATCH';
    error.statusCode = 409;
    throw error;
  }
  return { chainId, safeAddress: config.safeAddress, safeVersion: version };
}

export async function getCanonicalSafeTxHash(client, safeAddress, transaction) {
  return client.readContract({
    address: safeAddress,
    abi: SAFE_ABI,
    functionName: 'getTransactionHash',
    args: [
      transaction.to,
      BigInt(transaction.value),
      transaction.data,
      transaction.operation,
      BigInt(transaction.safeTxGas),
      BigInt(transaction.baseGas),
      BigInt(transaction.gasPrice),
      transaction.gasToken,
      transaction.refundReceiver,
      BigInt(transaction.safeNonce),
    ],
  });
}
