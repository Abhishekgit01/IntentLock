# Development setup

This repository has a Node.js backend, a first Foundry contract slice, and the Figma/web UI connected to live Safe context and proposal-analysis APIs. The scripted story scenes remain synthetic. This document distinguishes steps exercised in the current workspace from toolchain choices that still need a clean-checkout lock.

## 1. Toolchain pins and status

| Tool | Pin / selection | Status |
|---|---|---|
| Safe Smart Account | `v1.4.1` tag; record the resolved revision and package integrity when installing | Selected; source and hook behavior are documented in [PROTOCOL.md](PROTOCOL.md) |
| Safe release compiler | Solidity `0.7.6` | Match settings used by the pinned Safe release when building its artifacts |
| IntentLock Solidity compiler | `0.8.28`, EVM target follows the compiler default | Set in `foundry.toml`; Phase 1 tests compiled successfully in the current workspace. D-023 remains pending until validated on a clean checkout |
| Foundry (`forge`, `anvil`, `cast`) | `1.10.0`, commit `083e22994195d6a7e3ad3104d0b57f478c9b906` observed | Phase 1 tests and local deployment were exercised with this build. D-024 remains pending until the team locks and validates the clean-checkout toolchain |
| Node.js | `24.22.1` in `backend/.nvmrc` | Backend runtime selected and validated |
| npm | `11.19.1` via the backend's `packageManager` field | Backend package manager selected and validated |
| Fastify | `5.12.8` in `backend/package.json` | Exact backend dependency pin |
| viem | `2.58.0` in `backend/package.json` | Exact backend dependency pin |
| Frontend Node/package manager | See `frontend/.mise.toml`, `frontend/package.json`, and `frontend/pnpm-lock.yaml` | Live backend connection and production build validated in the current workspace |
| Python (evidence tooling) | Python 3.10+; standard library only | Reporter sample validated with Python 3.14.6 |

Do not mistake a tool version observed on one contributor's host for the project's required pin. Update this table when a verified project toolchain changes.

## 2. Backend setup

Use the exact runtime and dependency lockfile:

```sh
cd backend
npm ci
npm run check
npm run lint
npm run format:check
npm run dev
```

Copy `.env.example` to a local `.env` and fill in local Anvil RPC, Safe, verifier, and policy settings as needed. Keep private keys out of `.env` and source control. The backend supports native transfers and policy-configured ERC-20 transfers; see [backend/README.md](../backend/README.md) for the exact required variables and current limits.

## 3. Foundry installation notes

These commands install the Foundry bootstrapper and the version selected by `foundryup` at install time. They are useful for local setup, but are not a version pin. Until D-024 is locked, do not claim that different contributors will install the same Foundry release.

**Linux / macOS / WSL:**

```sh
curl -L https://foundry.paradigm.xyz | bash
foundryup
forge --version
anvil --version
cast --version
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/foundry-rs/foundry/master/foundryup/install.ps1 | iex
foundryup
forge --version
anvil --version
cast --version
```

The Solidity slice and `foundry.toml` are present. The version above describes the current environment only; it is not yet the project-wide Foundry pin. Resolve D-023 and D-024 after validating a clean checkout.

## 4. Local runtime configuration

`.env.example` contains empty, non-secret placeholders. Local values belong in ignored environment files.

```dotenv
CHAIN_ID=31337
RPC_URL=http://127.0.0.1:8545
SAFE_ADDRESS=
SAFE_VERSION=1.4.1
REGISTRY_ADDRESS=
VERIFIER_SET_ID=
VERIFIER_ADDRESSES=
VERIFIER_THRESHOLD=2
POLICY_MAX_NATIVE_TRANSFER_WEI=
POLICY_ALLOWED_NATIVE_RECIPIENTS=
POLICY_ALLOWED_ERC20_TOKENS=
POLICY_ERC20_TOKEN_CODE_HASHES=
POLICY_ALLOWED_ERC20_RECIPIENTS=
POLICY_MAX_ERC20_TRANSFER_BASE_UNITS=
```

These values are local placeholders, not deployable addresses or keys. The ERC-20 token addresses and code hashes correspond by list position. Follow [PROTOCOL.md](PROTOCOL.md) for policy hashing and fail-closed behavior.

## 5. Evidence report generator

The fixture reporter uses only Python's standard library. Its sample input is synthetic and is not chain evidence.

```sh
python scripts/report_fixtures.py docs/evidence/sample-results.synthetic.json
python scripts/report_fixtures.py docs/evidence/sample-results.synthetic.json --format json -o /tmp/intentlock-report.json
```

See [evidence/RESULTS_FORMAT.md](evidence/RESULTS_FORMAT.md) for the input format and metric definitions. Reports identify missing fixtures separately; do not present the synthetic sample as measured project results.

## 6. Foundry slice and local deployment

Start a disposable local chain in one terminal:

```sh
anvil --chain-id 31337
```

In another terminal, compile and run the Foundry suite, then deploy the real Safe v1.4.1 singleton/proxy, registry, and guard:

```sh
forge test -vv
forge script script/DeployLocal.s.sol:DeployLocal --rpc-url http://127.0.0.1:8545 --broadcast
```

The deployment script rejects every chain ID except Anvil `31337`, uses disposable Anvil accounts, configures an empty Safe module set, and writes `deployments/anvil-31337.json` with addresses and runtime code hashes. Re-running requires a fresh Anvil chain because the script deploys at deterministic sender nonces. This is the Phase 1 slice; a clean-checkout demo is not reproducible until the remaining verifier, reset flow, and fixture evidence export are implemented and validated.
