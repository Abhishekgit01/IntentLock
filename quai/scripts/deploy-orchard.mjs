import { readFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { quais } from "quais";
import {
  assertOrchardRpcUrl,
  loadQuaiEnv,
  repositoryRoot,
  requiredEnv,
} from "./env.mjs";
import { orchardPreflight } from "./preflight.mjs";
import { compileDeploymentPolicy, resolvePolicyFile } from "./policy.mjs";

const ZERO = "0x0000000000000000000000000000000000000000";
const ORCHARD_CHAIN_ID = 15000;
const ARTIFACTS = path.join(repositoryRoot, "out-quai");
const SAFE_GUARD_STORAGE_SLOT =
  "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";
const broadcasts = [];

function recordBroadcast(name, transaction) {
  if (!transaction?.hash) {
    throw new Error(
      `${name} did not return a transaction hash after broadcast.`,
    );
  }
  const record = { name, transactionHash: transaction.hash, status: "pending" };
  broadcasts.push(record);
  return record;
}

function recordMined(record, mined) {
  record.status = "mined";
  record.blockNumber = mined.blockNumber;
}

function loadArtifact(relativePath) {
  const artifactPath = path.join(ARTIFACTS, relativePath);
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  } catch {
    throw new Error(
      `Missing Orchard artifact ${relativePath}; run npm run compile:orchard first.`,
    );
  }
  const metadata = JSON.parse(artifact.rawMetadata ?? "{}");
  if (!metadata.compiler?.version?.startsWith("0.8.19+")) {
    throw new Error(
      `${relativePath} was not compiled with the approved Orchard compiler 0.8.19.`,
    );
  }
  const bytecode = artifact.bytecode?.object;
  if (typeof bytecode !== "string" || bytecode.length < 4) {
    throw new Error(`${relativePath} has no creation bytecode.`);
  }
  return {
    abi: artifact.abi,
    bytecode: bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`,
  };
}

function waitForSuccess(receipt, label) {
  if (!receipt || BigInt(receipt.status) !== 1n) {
    throw new Error(
      `${label} transaction did not produce a successful receipt.`,
    );
  }
  const transactionHash = receipt.hash ?? receipt.transactionHash;
  if (typeof transactionHash !== "string") {
    throw new Error(`${label} receipt has no transaction hash.`);
  }
  if (receipt.blockNumber === null || receipt.blockNumber === undefined) {
    throw new Error(`${label} receipt has no block number.`);
  }
  return {
    transactionHash,
    blockNumber: Number(receipt.blockNumber),
  };
}

async function deployContract(name, artifact, signer, args, transactions) {
  const factory = new quais.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    signer,
  );
  const contract = await factory.deploy(...args);
  const transaction = contract.deploymentTransaction();
  if (!transaction)
    throw new Error(
      `${name} deployment transaction was not returned by Quais.`,
    );
  const broadcast = recordBroadcast(name, transaction);
  const receipt = await transaction.wait();
  const mined = waitForSuccess(receipt, `${name} deployment`);
  recordMined(broadcast, mined);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  transactions[name] = mined;
  return { contract, address };
}

async function deploySafe(wallet, artifacts, transactions) {
  const { contract: singleton, address: singletonAddress } =
    await deployContract(
      "safeSingleton",
      artifacts.safe,
      wallet,
      [],
      transactions,
    );
  const { address: factoryAddress } = await deployContract(
    "safeProxyFactory",
    artifacts.proxyFactory,
    wallet,
    [],
    transactions,
  );

  const owner = await wallet.getAddress();
  const safeInterface = new quais.Interface(artifacts.safe.abi);
  const initializer = safeInterface.encodeFunctionData("setup", [
    [owner],
    1,
    ZERO,
    "0x",
    ZERO,
    ZERO,
    0,
    ZERO,
  ]);
  const proxyFactoryContract = new quais.Contract(
    factoryAddress,
    artifacts.proxyFactory.abi,
    wallet,
  );
  const createProxyTx = await proxyFactoryContract.createProxyWithNonce(
    singletonAddress,
    initializer,
    1,
  );
  const proxyBroadcast = recordBroadcast("safeProxy", createProxyTx);
  const proxyReceipt = await createProxyTx.wait();
  transactions.safeProxy = waitForSuccess(proxyReceipt, "Safe proxy creation");
  recordMined(proxyBroadcast, transactions.safeProxy);
  let safeAddress;
  const proxyFactoryInterface = new quais.Interface(artifacts.proxyFactory.abi);
  for (const log of proxyReceipt.logs ?? []) {
    try {
      const parsed = proxyFactoryInterface.parseLog(log);
      if (parsed?.name === "ProxyCreation") {
        safeAddress = quais.getAddress(parsed.args.proxy);
        break;
      }
    } catch {
      // Ignore logs emitted by the initialized Safe.
    }
  }
  if (!safeAddress)
    throw new Error("Safe factory receipt had no ProxyCreation event.");

  return {
    safeAddress,
    owner,
    singletonAddress,
    factoryAddress,
    safe: new quais.Contract(safeAddress, artifacts.safe.abi, wallet),
  };
}

function verifierAddresses(value) {
  const entries = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (entries.length !== 3) {
    throw new Error(
      "QUAI_VERIFIERS must contain exactly three public addresses, comma separated.",
    );
  }
  const normalized = entries.map((entry) => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(entry)) {
      throw new Error("Every QUAI_VERIFIERS value must be a 20-byte address.");
    }
    return quais.getAddress(entry);
  });
  if (new Set(normalized.map((entry) => entry.toLowerCase())).size !== 3) {
    throw new Error("QUAI_VERIFIERS must be distinct.");
  }
  return normalized;
}

async function main() {
  loadQuaiEnv();
  const endpoint = assertOrchardRpcUrl(
    process.env.QUAI_RPC_URL || "https://orchard.rpc.quai.network",
  );
  if (Number(process.env.QUAI_CHAIN_ID || "15000") !== ORCHARD_CHAIN_ID) {
    throw new Error("QUAI_CHAIN_ID must be 15000. Deployment stopped.");
  }
  if (process.env.ALLOW_ORCHARD_BROADCAST !== "YES") {
    throw new Error(
      "Broadcast blocked. After explicit team approval, set ALLOW_ORCHARD_BROADCAST=YES locally.",
    );
  }

  const privateKey = requiredEnv("QUAI_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(
      "QUAI_PRIVATE_KEY must be a 32-byte hex key in quai/.env.quai.",
    );
  }
  const verifiers = verifierAddresses(requiredEnv("QUAI_VERIFIERS"));
  const policyFile = resolvePolicyFile(
    process.env.QUAI_POLICY_FILE?.trim() || "policy.orchard.json",
  );
  const policyResult = compileDeploymentPolicy(policyFile);
  const policyHash = policyResult.policyHash;
  const requestedVerifierSetId = process.env.QUAI_VERIFIER_SET_ID?.trim();
  if (
    requestedVerifierSetId &&
    !/^0x[0-9a-fA-F]{64}$/.test(requestedVerifierSetId)
  ) {
    throw new Error(
      "QUAI_VERIFIER_SET_ID must be a 32-byte hash when provided.",
    );
  }
  const verifierSetId = requestedVerifierSetId
    ? requestedVerifierSetId.toLowerCase()
    : quais.keccak256(quais.toUtf8Bytes("INTENTLOCK_ORCHARD_VERIFIERS_V1"));

  const artifacts = {
    safe: loadArtifact("Safe.sol/Safe.json"),
    proxyFactory: loadArtifact("SafeProxyFactory.sol/SafeProxyFactory.json"),
    registry: loadArtifact("IntentLockRegistry.sol/IntentLockRegistry.json"),
    guard: loadArtifact("IntentLockGuard.sol/IntentLockGuard.json"),
  };
  const { chainId, provider } = await orchardPreflight();
  if (chainId !== ORCHARD_CHAIN_ID)
    throw new Error("Orchard preflight failed; no transaction sent.");

  try {
    const wallet = new quais.Wallet(privateKey, provider);
    const ownerBalance = await provider.getBalance(wallet.address);
    if (ownerBalance <= 0n) {
      throw new Error(
        "Dedicated deployment wallet has no QUAI for gas; fund it through the official faucet.",
      );
    }

    const transactions = {};
    const safeDeployment = await deploySafe(wallet, artifacts, transactions);
    const { address: registryAddress } = await deployContract(
      "registry",
      artifacts.registry,
      wallet,
      [safeDeployment.owner, verifiers, 2, verifierSetId, policyHash, ZERO],
      transactions,
    );
    const { address: guardAddress } = await deployContract(
      "guard",
      artifacts.guard,
      wallet,
      [safeDeployment.safeAddress, registryAddress, policyHash],
      transactions,
    );

    const registry = new quais.Contract(
      registryAddress,
      artifacts.registry.abi,
      wallet,
    );
    const registryGuardTx = await registry.setGuard(guardAddress);
    const registryGuardBroadcast = recordBroadcast(
      "registryGuard",
      registryGuardTx,
    );
    transactions.registryGuard = waitForSuccess(
      await registryGuardTx.wait(),
      "Registry guard configuration",
    );
    recordMined(registryGuardBroadcast, transactions.registryGuard);

    const safeInterface = new quais.Interface(artifacts.safe.abi);
    const setSafeGuardData = safeInterface.encodeFunctionData("setGuard", [
      guardAddress,
    ]);
    const nonce = await safeDeployment.safe.nonce();
    const safeTxHash = await safeDeployment.safe.getTransactionHash(
      safeDeployment.safeAddress,
      0,
      setSafeGuardData,
      0,
      0,
      0,
      0,
      ZERO,
      ZERO,
      nonce,
    );
    const signature = wallet.signingKey.sign(safeTxHash);
    const ownerSignature = quais.hexlify(
      quais.concat([signature.r, signature.s, quais.toBeHex(signature.v, 1)]),
    );
    const installGuardTx = await safeDeployment.safe.execTransaction(
      safeDeployment.safeAddress,
      0,
      setSafeGuardData,
      0,
      0,
      0,
      0,
      ZERO,
      ZERO,
      ownerSignature,
    );
    const safeGuardBroadcast = recordBroadcast("safeGuard", installGuardTx);
    const safeGuardReceipt = await installGuardTx.wait();
    transactions.safeGuard = waitForSuccess(
      safeGuardReceipt,
      "Safe guard installation",
    );
    recordMined(safeGuardBroadcast, transactions.safeGuard);
    const changedGuardTopic = safeInterface.getEvent("ChangedGuard").topicHash;
    if (
      !(safeGuardReceipt.logs ?? []).some(
        (log) => log.topics?.[0] === changedGuardTopic,
      )
    ) {
      throw new Error(
        "Safe guard installation receipt lacks ChangedGuard event.",
      );
    }

    const [
      registryOwner,
      registeredGuard,
      livePolicyHash,
      liveSetId,
      threshold,
      owners,
      safeThreshold,
      modules,
      guardStorage,
    ] = await Promise.all([
      registry.owner(),
      registry.guard(),
      registry.currentPolicyHash(),
      registry.currentVerifierSetId(),
      registry.verifierThreshold(),
      safeDeployment.safe.getOwners(),
      safeDeployment.safe.getThreshold(),
      safeDeployment.safe.getModulesPaginated(
        "0x0000000000000000000000000000000000000001",
        10,
      ),
      safeDeployment.safe.getStorageAt(BigInt(SAFE_GUARD_STORAGE_SLOT), 32),
    ]);
    const installedSafeGuard = quais.getAddress(`0x${guardStorage.slice(-40)}`);
    if (
      registryOwner.toLowerCase() !== safeDeployment.owner.toLowerCase() ||
      registeredGuard.toLowerCase() !== guardAddress.toLowerCase() ||
      livePolicyHash.toLowerCase() !== policyHash.toLowerCase() ||
      liveSetId.toLowerCase() !== verifierSetId.toLowerCase() ||
      Number(threshold) !== 2 ||
      Number(safeThreshold) !== 1 ||
      owners.length !== 1 ||
      owners[0].toLowerCase() !== safeDeployment.owner.toLowerCase() ||
      installedSafeGuard.toLowerCase() !== guardAddress.toLowerCase() ||
      modules[0].length !== 0
    ) {
      throw new Error(
        "Orchard post-deployment state assertions failed; manifest not written.",
      );
    }

    const contracts = {};
    for (const [name, address] of Object.entries({
      safeSingleton: safeDeployment.singletonAddress,
      safeProxyFactory: safeDeployment.factoryAddress,
      safe: safeDeployment.safeAddress,
      registry: registryAddress,
      guard: guardAddress,
    })) {
      const code = await provider.getCode(address);
      if (code === "0x")
        throw new Error(`${name} has no deployed runtime code.`);
      contracts[name] = { address, runtimeCodeHash: quais.keccak256(code) };
    }

    const manifest = {
      generatedAt: new Date().toISOString(),
      network: "Quai Orchard Cyprus-1",
      chainId: ORCHARD_CHAIN_ID,
      rpcEndpoint: endpoint,
      compiler: "0.8.19",
      evmVersion: "london",
      safeVersion: "1.4.1",
      safeSourceRef: "v1.4.1",
      safeCompilerVersion: "0.8.19",
      owner: safeDeployment.owner,
      verifierSetId,
      verifiers,
      verifierThreshold: 2,
      policyHash,
      policyFile: path.relative(repositoryRoot, policyFile),
      policy: policyResult.policy,
      contracts,
      transactions,
      postDeployment: {
        registryOwner,
        registryGuard: registeredGuard,
        safeGuard: installedSafeGuard,
        safeOwners: owners,
        safeThreshold: Number(safeThreshold),
        enabledModules: modules[0],
        guardInstalledEventObserved: true,
      },
      explorerVerification: "not_checked",
    };
    const deploymentDir = path.join(repositoryRoot, "deployments");
    mkdirSync(deploymentDir, { recursive: true });
    const target = path.join(deploymentDir, "quai-orchard-cyprus1.json");
    const temporary = `${target}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
    });
    renameSync(temporary, target);
    console.log(
      `Orchard deployment completed. Manifest: ${path.relative(repositoryRoot, target)}`,
    );
    console.log(`Safe: ${safeDeployment.safeAddress}`);
    console.log(`Registry: ${registryAddress}`);
    console.log(`Guard: ${guardAddress}`);
    console.log("Explorer verification: not checked");
  } finally {
    await provider.destroy?.();
  }
}

main().catch((error) => {
  console.error(`Orchard deployment stopped: ${error.message}`);
  if (broadcasts.length > 0) {
    console.error(
      `Transactions broadcast before stop: ${JSON.stringify(broadcasts)}`,
    );
  }
  process.exitCode = 1;
});
