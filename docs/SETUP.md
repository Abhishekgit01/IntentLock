# Development setup skeleton

The repository has a Node.js backend scaffold; the Solidity and frontend application scaffolds are still pending. This setup record distinguishes selected backend pins from values that still need a clean install or the later app/contract scaffold. Do not call the backend reproducible until the pinned clean install and commands have been checked.

## 1. Toolchain pin policy

| Tool | Pin / selection | Status and rule |
|---|---|---|
| Safe Smart Account | `v1.4.1` tag; record resolved commit and package integrity | Selected; exact source links and hook behavior in [PROTOCOL.md](PROTOCOL.md) |
| Safe release compiler | Solidity `0.7.6` for the pinned Safe 1.4.1 release build | Match Safe release compiler settings when building/deploying its artifacts |
| IntentLock Solidity compiler | Exact `solc` version in `foundry.toml` | Pending contract scaffold; choose once, compile locally, lock, and record |
| Foundry (`forge`, `anvil`, `cast`) | Exact release/commit in a toolchain file or setup record | Pending first contract environment; do not use “latest” in CI |
| Node.js | `24.22.1` in `backend/.nvmrc` | Selected backend runtime; clean install still to verify |
| Fastify | `5.12.8` in `backend/package.json` | Exact backend dependency pin |
| viem | `2.58.0` in `backend/package.json` | Exact backend dependency pin; use shared typed-data definitions and vectors with Solidity |
| Package manager | `npm@11.19.1` bundled with Node `24.22.1` | Selected backend package manager; clean install still to verify under Node 24 |
| Frontend Node/package manager | Exact versions in the frontend's own version file and lockfile | Pending until the existing UI is wired to the backend |

Never write an invented version here to make the table look complete. The backend pins were selected from official release information; validate them during a clean install and update the lockfile/revision manifest in the same change. Keep unrelated UI manifests and designs intact when connecting the existing Figma implementation.

## 2. Required runtime configuration

Keep local-only values in an ignored `.env.local`; commit only `.env.example` with empty/non-secret placeholders. Validate all values at startup.

```dotenv
CHAIN_ID=31337
RPC_URL=http://127.0.0.1:8545
SAFE_ADDRESS=
SAFE_VERSION=1.4.1
GUARD_ADDRESS=
REGISTRY_ADDRESS=
TIMELOCK_ADDRESS=
VERIFIER_SET_ID=
POLICY_HASH=
DEMO_SCENARIO=baseline
```

These are placeholders, not deployable addresses or secrets. Never put verifier private keys in this file if it is loaded by the browser. Verifier keys stay in a local verifier process and use disposable Anvil accounts only.

## 3. First scaffold commands (intended)

When the Foundry project is present:

```sh
forge --version
anvil --version
forge build
forge test
```

For the backend, use its pinned Node/npm versions and committed lockfile:

```sh
cd backend
npm ci
npm run check
npm run lint
npm run format:check
npm run dev
```

Replace example package-manager commands with the actual repository choice. Do not run install/build commands before their project manifests exist. Do not report the system as working until contract tests and required integration checks have produced real results.

## 4. Expected scripts as implementation lands

Add deterministic scripts with these responsibilities:

- `anvil`: start local chain with the expected chain ID and disposable accounts.
- `deploy`: deploy pinned Safe, vault fixtures, registry, guard, and timelock; assert configuration and write deployment manifest.
- `reset-demo`: restart from genesis, deploy, configure, fund, install guard, assert no modules, and run smoke scenarios.
- `test`: run `forge test` and report stable fixture IDs.
- `report`: read machine-readable results and generate metrics from the catalog without altering expected outcomes.
- `dev`: start the UI/API adapter only after health checks pass.

Every script must stop on the first failed health assertion. The deployment manifest should include Safe tag/commit, compiler and optimizer settings, chain ID, contract addresses/code hashes, verifier set and threshold, policy hash, timelock delay, and initial fixture state.

## 5. Clean-checkout acceptance

Setup is complete when a teammate can follow committed instructions from a clean checkout, install only pinned dependencies, start Anvil, deploy/reset, execute the valid and rejected fixtures, run `forge test`, and regenerate the report. Until then, this file is a setup skeleton rather than a successful setup guide.
