# IntentLock

**Policy enforcement for Safe transactions**

[Architecture](docs/ARCHITECTURE.md) · [Protocol](docs/PROTOCOL.md) · [Threat model](docs/THREAT_MODEL.md) · [Local demo](docs/DEMO_RUNBOOK.md) · [Quai Orchard](docs/QUAI_ORCHARD.md)

IntentLock is a prototype transaction guard for Safe Smart Account `v1.4.1`. It decodes a supported transaction from its raw Safe fields, evaluates it against a deterministic policy, and requires a configured verifier quorum to attest to the same Safe digest and intent before execution. The on-chain guard checks the attestation as part of Safe execution.

Unknown or ambiguous transactions fail closed. The current decoder supports native `CALL` transfers with empty calldata and configured ERC-20 `transfer(address,uint256)` calls whose runtime code hash matches policy. `DELEGATECALL` and ERC-20 approvals are refused.

## Current implementation status

| Area | Status |
| --- | --- |
| Local development | Backend and frontend can use a local Anvil chain (`31337`). The UI's scripted story scenes are explicitly labeled synthetic. |
| Orchard deployment | Safe, Registry, and Guard are deployed on Quai Orchard Cyprus-1. Deployment and configuration receipts are recorded in the [manifest](deployments/quai-orchard-cyprus1.json). |
| Orchard backend | A path-aware Quais adapter and gated server commands are implemented. The latest Orchard RPC preflight timed out; live reads and a verifier-to-Safe transaction have not been confirmed end to end. |
| Quaiscan source | Standard JSON verification requests were submitted for the deployed contracts. Source publication is pending confirmation. |
| Security review | Prototype only. The contracts and system have not been independently audited. |

Orchard is a public test network. Test tokens have no intended real-world value. Do not use valuable wallets or keys. Read [the Orchard guide](docs/QUAI_ORCHARD.md) before sending any transaction.

## How a transaction is checked

1. The backend receives raw Safe transaction fields and reads the configured Safe state from the selected chain.
2. It computes the Safe transaction digest, decodes only the supported transaction subset, and applies the configured policy.
3. Independent verifiers sign an EIP-712 attestation for the same transaction and intent. The Registry records a qualifying verifier quorum.
4. An authorized Safe owner signs the Safe transaction. During execution, the Guard checks the registered attestation and applicable transaction constraints.

The policy decision (`ATTEST`, `ATTEST_WITH_TIMELOCK`, `REFUSE_UNSUPPORTED`, or `REFUSE_POLICY`) is distinct from workflow status and execution results. See the [protocol](docs/PROTOCOL.md) and [contract specification](docs/CONTRACTS.md) for exact fields and checks.

## Local setup

### Requirements

- Node.js `24.22.1` and npm `11.19.1` for the backend
- Foundry (`forge`, `anvil`, `cast`)
- pnpm for the frontend
- Python 3 for the fixture report utility

### 1. Install dependencies

From the repository root:

```sh
cd backend
npm ci
cd ../frontend
pnpm install --frozen-lockfile
cd ..
```

### 2. Start Anvil and deploy local contracts

In terminal 1:

```sh
anvil --chain-id 31337
```

In terminal 2, from the repository root:

```sh
forge script script/DeployLocal.s.sol:DeployLocal --rpc-url http://127.0.0.1:8545 --broadcast
```

The script is restricted to chain ID `31337`, uses disposable Anvil-only keys, and writes public deployment settings to `deployments/anvil-31337.json`. A fresh Anvil process resets its state; deploy again after restarting it. Never reuse these development keys on a public network.

### 3. Configure and start the backend

Copy `backend/.env.example` to `backend/.env` and fill in the local addresses, verifier set, and policy values from the deployment manifest. Keep `.env` files local; the backend README lists each setting and its meaning.

In terminal 3:

```sh
cd backend
npm run dev
```

Check the API and launch the interactive CLI in another terminal:

```sh
curl http://127.0.0.1:8787/health
cd backend
npm run intentlock
```

At the `intentlock>` prompt, try `help`, `health`, or `exit`. For a one-shot command, run `npm run intentlock -- health` from `backend/`.

### 4. Start the frontend

In terminal 4:

```sh
cd frontend
pnpm dev
```

Open the local URL printed by Vite. During development, Vite proxies `/api/*` to the backend at `http://127.0.0.1:8787`.

For route details, environment variables, API behavior, and CLI workflows, see [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).

## Checks

Run backend static checks from `backend/`:

```sh
npm run check
npm run lint
npm run format:check
```

Build the frontend from `frontend/`:

```sh
pnpm build
```

Run the Foundry suite from the repository root:

```sh
forge test
```

Anvil results demonstrate behavior on the local test chain only. They are not Orchard execution evidence.

## Quai Orchard

The Orchard deployment uses a separate Solidity `0.8.19` / London build and Quais pathing. To compile its artifacts, compile the committed policy, and check the official RPC:

```sh
cd backend && npm ci
cd ../quai && npm ci
npm run compile:orchard
npm run policy:compile
npm run preflight
```

The preflight is read-only. The deploy script is gated and must not be rerun to inspect the existing deployment. The backend's Orchard broadcast path is disabled unless a local `backend/.env.quai` explicitly sets `ALLOW_QUAI_BROADCAST=YES`; configure a dedicated testnet relayer key and verify all addresses before enabling it. The Orchard RPC preflight and live verifier-to-Safe execution still require successful end-to-end validation. See [Quai Orchard status and instructions](docs/QUAI_ORCHARD.md).

## Evidence and security boundaries

- Chain evidence comes from configured RPC reads, transaction receipts, and saved test outputs. API workflow events and synthetic UI scenes are labeled separately.
- The API keeps proposal and signature workflow state in memory; restarting the backend clears it.
- Guard-replacement timelock execution is not implemented in the backend.
- The experimental ECDSA plus ML-DSA tooling is off-chain only. The on-chain authorization path remains ECDSA-based; no quantum-resistance claim is made.
- IntentLock is not audited or production-ready. See the [threat model](docs/THREAT_MODEL.md) for assumptions and residual risks.

## Repository guide

| Path | Contents |
| --- | --- |
| [`contracts/`](contracts/) | IntentLock Registry, Guard, and supporting contracts |
| [`backend/`](backend/) | API, policy compiler, verifier workflow, execution adapters, and CLI |
| [`frontend/`](frontend/) | React application, workbench, evidence views, replay, and onboarding |
| [`script/`](script/) | Local Anvil deployment script |
| [`quai/`](quai/) | Orchard build, deployment, and read-only preflight tools |
| [`deployments/`](deployments/) | Public deployment manifests and receipts |
| [`docs/`](docs/) | Product, protocol, contracts, security, verification, and runbook specifications |

## Documentation

- [Development setup](docs/SETUP.md)
- [Product scope](docs/PRODUCT.md)
- [System architecture](docs/ARCHITECTURE.md)
- [Protocol and API contract](docs/PROTOCOL.md)
- [Smart contract specification](docs/CONTRACTS.md)
- [Decoder and policy](docs/DECODER_AND_POLICY.md)
- [Threat model](docs/THREAT_MODEL.md)
- [Verification plan](docs/VERIFICATION.md)
- [Fixture catalog](docs/fixtures/catalog.json)
- [Demo runbook](docs/DEMO_RUNBOOK.md)
- [Quai Orchard status](docs/QUAI_ORCHARD.md)
