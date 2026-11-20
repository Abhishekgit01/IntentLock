# IntentLock on Quai Orchard

This document tracks the sponsor-required Quai integration. The existing Anvil deployment and tests remain the deterministic development path. Orchard Cyprus-1 is a separate test deployment target; it is not production, and no public-chain action is implicit in these instructions.

**Status checked 2026-11-20:** Orchard-target compilation succeeded, the core Foundry suite passed under both compiler profiles, and a read-only Quais RPC request observed chain ID 15000. No Orchard transaction was sent. The backend and frontend still use local Anvil and are not yet configured to submit to or read from an Orchard deployment.

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

### Solidity compiler discrepancy

The supplied participant guide and the current Quai deployment tutorial use Solidity 0.8.20, while the current [Solidity support page](https://docs.qu.ai/build/smart-contracts/solidity) says the EVM supports versions up to 0.8.19. Until organizers or Quai reconcile this, the dedicated Orchard build targets 0.8.19 and London EVM. Local Foundry tests keep the existing 0.8.28 compiler. The vendored Safe v1.4.1 source is also compiled with 0.8.19 for this profile, so its deployed runtime bytecode will differ from the canonical release built with 0.7.6. A human contracts reviewer must inspect this compiler-specific Safe build before any broadcast.

## What is being deployed

Deploy the existing IntentLock contracts and Safe 1.4.1 source used by this project. Do not create the sample token from the generic participant skill. Keep the contract behavior and project decisions unchanged:

- Safe, registry, and guard are deployed on Orchard Cyprus-1.
- Registry verifier threshold remains 2-of-3; configure three dedicated Orchard verifier addresses.
- Safe starts with no enabled modules, and the guard is installed through the Safe owner transaction.
- Delegatecall remains unconditionally rejected.
- No policy update, EIP-712 field, guard rule, or decision enum is changed for the Quai port.
- The Orchard deployment is independent from the local Anvil deployment manifest.

The deployer is also the initial Safe owner and registry owner in the first deployment script. This is a bootstrap choice for a test deployment; the registry owner can change the policy hash and verifier set, so the key has meaningful admin power. It is not a recommended production arrangement. Use a fresh dedicated Orchard test wallet and do not reuse local Anvil keys, any account holding real funds, or verifier keys committed in source.

## Key boundary

Put the Orchard deployment private key only in the ignored local `quai/.env.quai` file. Never paste it into chat, check it into Git, print it, or pass it as a command-line argument. Configure verifier addresses as public addresses; verifier signing keys stay in their separate local verifier process. The checked-in `.env.quai.example` contains no secret values. The deploy script imports the same `backend/src/policy-format.js` compiler used by the backend; the compiler does not read or print the deployment key. Review `policy.orchard.json` and ensure the backend/verifiers later use that exact policy hash. `QUAI_VERIFIER_SET_ID` may be set to an agreed bytes32 value; if left blank, the deployment script derives a stable ID from `INTENTLOCK_ORCHARD_VERIFIERS_V1`.

The deploy command has two independent safeguards: it rejects any network other than chain ID 15000 and requires `ALLOW_ORCHARD_BROADCAST=YES`. Do not set the broadcast variable until a human has reviewed the final bytecode, arguments, owner powers, verifier set, policy hash, and preflight output. Do not run the deploy command until that review and explicit team approval are complete.

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

Do not report the project as deployed until all of the following have actual evidence:

1. Dedicated Orchard compilation completed with the target compiler and EVM version.
2. Foundry tests pass against the project source.
3. Read-only preflight confirms chain ID 15000 and the expected RPC.
4. A human reviews the contracts, artifact hashes, deployment arguments, and admin powers; a second human reviews the Solidity changes.
5. The team explicitly approves the broadcast.
6. Deployment receipts exist, deployed code hashes match the local artifacts, the Safe owner/modules/guard and registry verifier set are read back from RPC, and a benign + denied-path check is recorded on Orchard.

Keep local Anvil test results labeled as local; they are not Orchard deployment evidence. Explorer verification is a separate status and is only complete after checking it on Quaiscan.

## Supplied organizer skill

The supplied `Quai-Orchard-Deployment-Skill-GitHub-Based.zip` is a generic reference workflow for a Hardhat token/custom-contract project. It is not this repository’s implementation. Its sample project includes an unrestricted faucet, which IntentLock must not copy. Use the current project contracts, the decision register, and this integration document as the source of truth. The reference guide is retained under `docs/quai/skill/` for team review.
