# IntentLock on Quai Orchard

This document tracks the sponsor-required Quai integration. The existing Anvil deployment and tests remain the deterministic development path. Orchard Cyprus-1 is a separate test deployment target; it is not production, and no public-chain action is implicit in these instructions.

**Status checked 2026-11-21:** The Safe 1.4.1 singleton, Safe proxy factory, Safe proxy, IntentLock Registry, and IntentLock Guard are deployed on Orchard Cyprus-1. All seven deployment/configuration receipts have status `1`. A fresh read-only preflight returned chain ID `15000` at block `8308034`. The Orchard-configured backend then returned `ready`, observed chain ID `15000`, Safe nonce `1`, Safe balance `0`, the expected Safe proxy code hash, one Safe owner, threshold `1`, the installed guard, and zero enabled modules at block `8308052`. Its reported policy hash matches the deployment manifest. Observed addresses, code hashes, configuration, and deployment receipts are in [`deployments/quai-orchard-cyprus1.json`](../deployments/quai-orchard-cyprus1.json).

This is **not yet a complete live product integration**. Quaiscan accepted Standard JSON verification submissions for the five deployed contract addresses, but the latest address API reads did not confirm published source; the manifest records `submitted_not_confirmed`. The backend's live read adapter has been exercised successfully. A benign transfer and a denied transaction have not been exercised through the verifier-to-Safe path on Orchard.

## Network verified from official docs

As checked on 2026-11-20, Quai lists Orchard Testnet chain ID `15000`, Cyprus-1 RPC `https://orchard.rpc.quai.network/cyprus1`, and explorer `https://orchard.quaiscan.io`. The official networks page also states Orchard tokens have no real value. The supplied guide and the Quai deployment tutorial show the base RPC URL `https://orchard.rpc.quai.network` with Quais pathing enabled. The integration uses the official base URL and `quais.JsonRpcProvider(..., { usePathing: true })`; preflight must verify the returned chain ID before any wallet is attached.

Official references:

- [Quai Networks](https://docs.qu.ai/build/networks)
- [Quai Solidity support](https://docs.qu.ai/build/smart-contracts/solidity)
- [Quai contract deployment](https://docs.qu.ai/build/smart-contracts/deployment)
- [Deploy with Solidity](https://docs.qu.ai/guides/development/solidity)
- [Quais JavaScript library](https://docs.qu.ai/build/apis/javascript-libraries)
- [Quais provider](https://docs.qu.ai/sdk/static/provider)
- [Quais ContractFactory](https://docs.qu.ai/sdk/static/contract)
- [Orchard faucet](https://orchard.faucet.quai.network)
- [Orchard explorer](https://orchard.quaiscan.io)

### Solidity compiler target

The Orchard build is pinned to Solidity `0.8.19` and London EVM. Quai's current [Foundry guide](https://www.qu.ai/integrations/foundry) states support through Solidity `0.8.20`; the project keeps its already reviewed `0.8.19` build profile. Local Foundry builds use Solidity `0.8.28`. The vendored Safe v1.4.1 source was compiled with `0.8.19` for Orchard, so its deployed runtime bytecode differs from the canonical Safe release compiled with `0.7.6`. This compiler-specific Safe build is not the canonical upstream bytecode.

## What is being deployed

Deploy the existing IntentLock contracts and Safe 1.4.1 source used by this project. Do not create the sample token from the generic participant skill. Keep the contract behavior and project decisions unchanged:

- Safe, registry, and guard are deployed on Orchard Cyprus-1.
- Registry verifier threshold remains 2-of-3; configure three dedicated Orchard verifier addresses.
- Safe starts with no enabled modules, and the guard is installed through the Safe owner transaction.
- Delegatecall remains unconditionally rejected.
- No policy update, EIP-712 field, guard rule, or decision enum is changed for the Quai port.
- The Orchard deployment is independent from the local Anvil deployment manifest.

The deployer is also the initial Safe owner and registry owner. This is a bootstrap choice for this test deployment; the registry owner can change the policy hash and verifier set, so the key has meaningful admin power. It is not a recommended production arrangement. The deployed Safe has one owner at threshold one. Do not reuse this test wallet, local Anvil keys, any account holding real funds, or verifier keys committed in source.

## Key boundary

Put the Orchard deployment private key only in the ignored local `quai/.env.quai` file. Never paste it into chat, check it into Git, print it, or pass it as a command-line argument. Configure verifier addresses as public addresses; verifier signing keys stay in their separate local verifier process. The checked-in `.env.quai.example` contains no secret values. The deploy script imports the same `backend/src/policy-format.js` compiler used by the backend; the compiler does not read or print the deployment key. Review `policy.orchard.json` and ensure the backend/verifiers later use that exact policy hash. `QUAI_VERIFIER_SET_ID` may be set to an agreed bytes32 value; if left blank, the deployment script derives a stable ID from `INTENTLOCK_ORCHARD_VERIFIERS_V1`.

The deploy command has two independent safeguards: it rejects any network other than chain ID 15000 and requires `ALLOW_ORCHARD_BROADCAST=YES`. Deployment has already happened. Do not rerun it to inspect or test the existing deployment: it will deploy another set of contracts and consume more test QUAI. For read-only checks, use the manifest and `npm run preflight`.

## Build and preflight

From the project root, after installing the isolated Quais dependency:

```sh
cd backend
npm ci
cd ../quai
npm ci
npm run compile:orchard
npm run policy:compile
npm run preflight
```

`compile:orchard` invokes Foundry with Solidity 0.8.19 and emits separate artifacts under `out-quai/`. `policy:compile` calls the backend's canonical policy compiler and prints the Orchard policy hash. These commands do not send transactions. `preflight` reads the official Orchard endpoint and fails unless the observed chain ID is 15000. It does not load the private key or broadcast.

To prepare a dedicated local config, copy the example and fill its fields locally:

```sh
cp .env.quai.example .env.quai
```

Fund only the dedicated testnet account through the official faucet. Never put wallet secrets into `backend/.env`, frontend configuration, fixtures, or deployment manifests.

## Deployment and evidence

The script writes a separate manifest to `deployments/quai-orchard-cyprus1.json` only after deployment transactions have receipts. The manifest must include the observed chain ID, block number, transaction hashes, deployed addresses, runtime code hashes, Safe version/source revision, verifier set/threshold, and policy hash. A missing receipt or failed post-deploy assertion aborts; it must not create a success manifest.

The pinned `quais` SDK release also requires a 46-character `IPFSHash` argument when `ContractFactory.deploy()` runs. The deployment script passes the authentic compiler metadata CID extracted from each artifact's Solidity CBOR footer; this is not evidence that the metadata was uploaded or pinned. The manifest records these as `compilerMetadataCids`. Standard JSON source verification was submitted, but the latest Quaiscan address API reads did not confirm publication.

### Deployment and live-demo status

Deployment evidence is present for the contract deployments and initial configuration: receipts, code hashes, Safe owner/threshold/modules/guard, Registry owner/guard/policy/verifier threshold, and the Safe proxy salt are recorded in the manifest. The project team approved the broadcast before deployment.

The following remains before calling the **full Orchard demo** verified:

1. Poll Quaiscan for the five submitted Standard JSON verifications and confirm the source is published at each deployed address. Update `explorerVerification` only after Quaiscan confirms the source.
2. The Quais adapter in `backend/src/quai-chain.js` and Orchard commands in `backend/package.json` have passed live, read-only RPC checks. Its transaction-submit path still needs a successful contract execution before it can be treated as end-to-end validated.
3. The ignored local `backend/.env.quai` is configured with the manifest's policy, addresses, and verifier set. A dedicated local relayer has been funded with `0.03 QUAI`; signing keys remain in ignored local files. The broadcast gate is blank, so backend execution is disabled.
4. The Safe remains at `0 QUAI`. Two small same-zone transfers from the existing Safe owner to the Safe proxy were mined with failed receipts (blocks `8308013` and `8308019`); neither changed the Safe balance. The latest failed receipt is `0x006c00483d1d5c93a58955551e8df171b5c295f7b800f01285f1a352b37ba429`. Its receipt reports status `0`, while a direct zone-endpoint `debug_traceTransaction` response reports `failed: false` and Quaiscan reports `status: error`, `result: awaiting_internal_transactions`. This discrepancy needs explanation from Quai before sending more top-ups or turning on backend broadcasts.
5. After resolving that receipt discrepancy and funding the Safe, run an allowed transfer through two independent verifier signatures, on-chain Registry submission, Safe-owner signature, and Safe execution. Record actual receipts and balance changes.
6. Run a denied or missing-attestation transaction and record its mined failed receipt and observed guard error. Do not use local Anvil results as Orchard evidence.

The manifest's top-level `observedBlockNumber` is now a fresh Cyprus-1 observation (`8308052`); deployment transaction block numbers remain separately recorded from their confirmed receipts. The preflight script explicitly requests the Cyprus-1 shard.

Keep local Anvil test results labeled as local; they are not Quai execution evidence. Explorer verification is a separate status and is only complete after checking it on Quaiscan.

## Supplied organizer skill

The supplied `Quai-Orchard-Deployment-Skill-GitHub-Based.zip` is a generic reference workflow for a Hardhat token/custom-contract project. It is not this repository’s implementation. Its sample project includes an unrestricted faucet, which IntentLock must not copy. Use the current project contracts, the decision register, and this integration document as the source of truth. The reference guide is retained under `docs/quai/skill/` for team review.
