import { quais } from "quais";
import { fileURLToPath } from "node:url";
import { assertOrchardRpcUrl, loadQuaiEnv } from "./env.mjs";

export async function orchardPreflight() {
  loadQuaiEnv({ includePrivateKeys: false });
  const endpoint = assertOrchardRpcUrl(
    process.env.QUAI_RPC_URL || "https://orchard.rpc.quai.network",
  );
  const expectedChainId = Number(process.env.QUAI_CHAIN_ID || "15000");
  if (expectedChainId !== 15000) {
    throw new Error("QUAI_CHAIN_ID must be 15000 for Orchard Cyprus-1.");
  }

  const provider = new quais.JsonRpcProvider(endpoint, undefined, {
    usePathing: true,
  });
  let timeoutId;
  try {
    return await Promise.race([
      (async () => {
        const network = await provider.getNetwork();
        const chainId = Number(network.chainId);
        if (chainId !== 15000) {
          throw new Error(
            `RPC chain ID is ${chainId}; expected Orchard 15000. Stopped.`,
          );
        }
        const blockNumber = await provider.getBlockNumber(quais.Shard.Cyprus1);
        return { endpoint, chainId, blockNumber, provider };
      })(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () =>
            reject(
              new Error("Orchard RPC preflight timed out after 15 seconds."),
            ),
          15_000,
        );
      }),
    ]);
  } catch (error) {
    await provider.destroy?.();
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  orchardPreflight()
    .then(async ({ endpoint, chainId, blockNumber, provider }) => {
      console.log(
        JSON.stringify(
          { mode: "read_only_preflight", endpoint, chainId, blockNumber },
          null,
          2,
        ),
      );
      await provider.destroy?.();
    })
    .catch((error) => {
      console.error(`Orchard preflight failed: ${error.message}`);
      process.exitCode = 1;
    });
}
