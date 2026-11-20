# IntentLock Quai deployment package

This package adds a separate Quai Orchard Cyprus-1 build and deployment path for the existing IntentLock contracts. It does not create a sample token and does not replace the Anvil workflow.

## Commands

```sh
cd ../backend
npm ci
cd ../quai
npm ci
npm run compile:orchard
npm run policy:compile
npm run preflight
```

`compile:orchard` compiles the existing contract sources using Solidity 0.8.19 and London EVM into `../out-quai/`. `preflight` makes read-only RPC requests to the official Orchard endpoint and requires observed chain ID 15000. Neither command uses a private key or broadcasts.

The deploy script is deliberately gated. It requires a dedicated local `.env.quai`, exactly three verifier public addresses, a policy file compiled by the shared backend policy compiler (so install `backend/` dependencies with `npm ci` first), a funded testnet wallet, and `ALLOW_ORCHARD_BROADCAST=YES`. The compiler does not read or print the deployment key. Do not set the broadcast gate until the team has reviewed the exact source/artifact hashes, arguments, Safe owner/admin powers, and code; the project instructions also require a second human contracts reviewer. The command has not been run against Orchard.

See [the deployment guide](../docs/QUAI_ORCHARD.md) for configuration and limits. The backend and frontend still target the existing local Anvil instance; changing their runtime network is a separate integration step and must use actual Orchard deployment addresses, verifier keys, and observed RPC state.
