import { quais } from 'quais';

const ORCHARD_CHAIN_ID = 15000;
const ORCHARD_RPC_HOST = 'orchard.rpc.quai.network';
const CYPRUS_1 = quais.Shard.Cyprus1;

function assertOrchardEndpoint(rpcUrl) {
  const endpoint = new URL(rpcUrl);
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.hostname !== ORCHARD_RPC_HOST ||
    endpoint.username ||
    endpoint.password ||
    endpoint.pathname !== '/' ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error(
      'Quai mode requires the official HTTPS Orchard RPC endpoint with pathing enabled',
    );
  }
}

function blockTimestamp(block) {
  const value = block?.woHeader?.timestamp;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (typeof value === 'bigint' && value >= 0n) return value;
  if (typeof value !== 'string' || !/^(0x[0-9a-f]+|[0-9]+)$/i.test(value)) {
    throw new Error('Orchard RPC returned a block without a valid timestamp');
  }
  return BigInt(value);
}

function normalizedReceipt(receipt) {
  if (!receipt) throw new Error('Orchard transaction receipt was not found');
  const status = BigInt(receipt.status) === 1n ? 'success' : 'reverted';
  return {
    transactionHash: receipt.hash ?? receipt.transactionHash,
    blockNumber: BigInt(receipt.blockNumber),
    gasUsed: BigInt(receipt.gasUsed),
    status,
    logs: receipt.logs ?? [],
    raw: receipt,
  };
}

export function createQuaiChainClient(config) {
  if (config.chainId !== ORCHARD_CHAIN_ID) {
    throw new Error('Quai client supports only Orchard chain ID 15000');
  }
  assertOrchardEndpoint(config.rpcUrl);

  const provider = new quais.JsonRpcProvider(config.rpcUrl, undefined, {
    usePathing: true,
  });

  return {
    kind: 'quai-orchard',
    provider,

    async getChainId() {
      return Number((await provider.getNetwork()).chainId);
    },

    async getBlockNumber() {
      return BigInt(await provider.getBlockNumber(CYPRUS_1));
    },

    async getBlock({ blockTag = 'latest' } = {}) {
      const requestedBlock =
        blockTag === 'latest'
          ? await provider.getBlockNumber(CYPRUS_1)
          : blockTag;
      const block = await provider.getBlock(CYPRUS_1, requestedBlock);
      if (!block)
        throw new Error(`Orchard block ${requestedBlock} was not found`);
      const number = BigInt(requestedBlock);
      return {
        number,
        hash: block.hash,
        timestamp: blockTimestamp(block),
      };
    },

    async getBytecode({ address, blockNumber, blockTag }) {
      return provider.getCode(address, blockNumber ?? blockTag);
    },

    async getBalance({ address, blockNumber, blockTag }) {
      return provider.getBalance(address, blockNumber ?? blockTag);
    },

    async getStorageAt({ address, slot, blockNumber, blockTag }) {
      return provider.getStorage(
        address,
        BigInt(slot),
        blockNumber ?? blockTag,
      );
    },

    async readContract({
      address,
      abi,
      functionName,
      args = [],
      blockNumber,
      blockTag,
    }) {
      const contract = new quais.Contract(address, abi, provider);
      const method = contract[functionName];
      if (typeof method !== 'function') {
        throw new Error(`Contract ABI has no ${functionName} method`);
      }
      const callOptions =
        blockNumber === undefined && blockTag === undefined
          ? []
          : [{ blockTag: blockNumber ?? blockTag }];
      return method(...args, ...callOptions);
    },

    async writeContract(
      wallet,
      { address, abi, functionName, args = [], gas },
    ) {
      const contract = new quais.Contract(address, abi, wallet);
      const method = contract[functionName];
      if (typeof method !== 'function') {
        throw new Error(`Contract ABI has no ${functionName} method`);
      }
      const overrides = {
        from: wallet.address,
        ...(gas === undefined ? {} : { gasLimit: BigInt(gas) }),
      };
      const transaction = await method(...args, overrides);
      return transaction.hash;
    },

    async waitForTransactionReceipt({ hash }) {
      return normalizedReceipt(await provider.waitForTransaction(hash));
    },

    createWallet(privateKey) {
      return new quais.Wallet(privateKey, provider);
    },

    async close() {
      await provider.destroy?.();
    },
  };
}
