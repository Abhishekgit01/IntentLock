# IntentLock

IntentLock is a prototype policy guard for Safe transactions. It decodes supported raw transaction fields, asks independent verifiers to approve the exact Safe transaction digest and intent, and checks those attestations on-chain before the Safe executes. Unknown or unsupported actions should fail closed.

This repository currently has two distinct environments:

- **Local Anvil:** the backend and frontend development path. The backend execution adapter currently supports only Anvil chain ID `31337`.
- **Quai Orchard Cyprus-1:** the Safe, registry, and guard are deployed and their receipts and key configuration have been read back. The backend is not yet connected to this deployment. Quaiscan source verification and a live verifier-to-Safe transaction test remain pending.

Orchard is a public test network; its tokens have no intended real-world value. IntentLock is a prototype, not an audited or production-ready wallet security product.

## Requirements

- Node.js `24.22.1` and npm `11.19.1` for backend and Quai commands
- Foundry (`forge`, `anvil`, `cast`)
- Node.js and pnpm versions from the existing frontend project for the UI
- Python 3 for the fixture report utility

## Local setup and run

Install backend dependencies and create a local environment file:

```sh
cd backend
npm ci
cp .env.example .env
```

The example values point to Anvil (`http://127.0.0.1:8545`, chain ID `31337`). Fill in local deployment addresses and policy values in `backend/.env` when using the chain-connected API. Do not put a public-network key or a valuable account key there. The deploy script uses disposable Anvil keys only and refuses non-Anvil chains.

In terminal 1, start Anvil:

```sh
anvil --chain-id 31337
```

In terminal 2, deploy the local Safe, registry, and guard:

```sh
forge test
forge script script/DeployLocal.s.sol:DeployLocal --rpc-url http://127.0.0.1:8545 --broadcast
```

The deployment writes `deployments/anvil-31337.json`. Copy its public configuration values into the local backend environment as described in [backend/README.md](backend/README.md). Restarting Anvil resets its state; deploy again on the fresh chain.

In terminal 3, start the backend:

```sh
cd backend
npm run dev
```

Check its status and use the interactive CLI in a separate terminal:

```sh
curl http://127.0.0.1:8787/health
cd backend
npm run intentlock
```

At the `intentlock>` prompt, type `help`, `health`, or `exit`. A one-shot command from the `backend/` directory is:

```sh
npm run intentlock -- health
```

In terminal 4, start the frontend:

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Open the Vite URL printed in the terminal. The frontend uses the local backend proxy by default. See [frontend/README.md](frontend/README.md) and [backend/README.md](backend/README.md) for app routes, environment options, API behavior, and CLI commands.

## Checks

Run the backend's static checks from `backend/`:

```sh
npm run check
npm run lint
npm run format:check
```

Run the frontend production build from `frontend/`:

```sh
pnpm build
```

Run the Foundry suite from the repository root:

```sh
forge test
```

Local Anvil test results are not Orchard execution evidence.

## Quai Orchard deployment

The deployed Orchard Cyprus-1 addresses, transaction receipts, code hashes, policy hash, and read-back configuration are recorded in [the deployment manifest](deployments/quai-orchard-cyprus1.json). To rebuild the dedicated Orchard artifacts and check the read-only endpoint:

```sh
cd backend && npm ci
cd ../quai && npm ci
npm run compile:orchard
npm run policy:compile
npm run preflight
```

The deployment script is gated and must not be run again just to inspect the existing deployment. Read [the Quai deployment guide](docs/QUAI_ORCHARD.md) before any Orchard transaction. Do not copy keys into the frontend or commit local `.env` files or the `quai/.local/` directory.

**Current Quai limits:** source verification on Quaiscan is not checked; the live verifier-to-Safe transaction flow has not been tested; the backend remains Anvil-only. Changing `CHAIN_ID` to `15000` does not enable Quai support.

## Documentation

- [Setup and development](docs/SETUP.md)
- [Protocol and API contract](docs/PROTOCOL.md)
- [Smart contract requirements](docs/CONTRACTS.md)
- [Decoder and policy limits](docs/DECODER_AND_POLICY.md)
- [Threat model](docs/THREAT_MODEL.md)
- [Fixture catalog](docs/fixtures/catalog.json)
- [Verification and evidence rules](docs/VERIFICATION.md)
- [Demo runbook](docs/DEMO_RUNBOOK.md)
- [Quai Orchard status and instructions](docs/QUAI_ORCHARD.md)
