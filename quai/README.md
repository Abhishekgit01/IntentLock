# IntentLock Quai deployment package

This package builds and deploys the existing IntentLock contracts to Quai Orchard Cyprus-1. It does not create the sample token from the generic organizer skill and does not replace the local Anvil workflow.

## Current status

The Safe 1.4.1 singleton, Safe proxy factory, Safe proxy, IntentLock Registry, and IntentLock Guard are deployed. All seven deployment/configuration receipts and the read-back state are recorded in [`../deployments/quai-orchard-cyprus1.json`](../deployments/quai-orchard-cyprus1.json). Quaiscan source verification is still marked `not_checked`.

The backend execution adapter remains local-Anvil-only. Do not set `CHAIN_ID=15000` and assume it will execute on Quai. A live verifier-to-Safe transaction has not been tested on Orchard.

## Build and read-only commands

Requirements: Node.js `24.22.1`, npm `11.19.1`, Foundry, and the backend dependencies for the shared policy compiler.

```sh
cd ../backend
npm ci
cd ../quai
npm ci
npm run compile:orchard
npm run policy:compile
npm run preflight
```

`compile:orchard` compiles Solidity `0.8.19` for the London EVM into `../out-quai/`. `policy:compile` prints the Orchard policy hash. `preflight` makes read-only calls and requires chain ID `15000`. These commands do not broadcast.

## Deployment warning

`npm run deploy:orchard` sends transactions and deploys a **new** stack of contracts. Do not run it to inspect the existing deployment. It requires the ignored local `quai/.env.quai`, three public verifier addresses, a funded dedicated test wallet, and `ALLOW_ORCHARD_BROADCAST=YES`. The deployment key and verifier signing keys must remain in ignored local files and must never be passed on a command line or committed.

Read [the Orchard deployment guide](../docs/QUAI_ORCHARD.md) before any public-chain operation. It records the remaining source verification and end-to-end test work. The Foundry/Quais/Quaiscan workflow is described in [Quai's Foundry guide](https://www.qu.ai/integrations/foundry).
