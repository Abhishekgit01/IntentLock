# Development setup

This repository has a Node.js backend scaffold. The Solidity and frontend application scaffolds are still pending. This document distinguishes verified backend setup from proposed or pending contract and UI toolchains; do not call a pending step reproducible.

## 1. Toolchain pins and status

| Tool | Pin / selection | Status |
|---|---|---|
| Safe Smart Account | `v1.4.1` tag; record the resolved revision and package integrity when installing | Selected; source and hook behavior are documented in [PROTOCOL.md](PROTOCOL.md) |
| Safe release compiler | Solidity `0.7.6` | Match settings used by the pinned Safe release when building its artifacts |
| IntentLock Solidity compiler | `0.8.24`, EVM target `cancun` is a proposed starting point | Not yet locked in `foundry.toml` or compiled; D-023 remains pending until the contract scaffold exists and the team validates the setting |
| Foundry (`forge`, `anvil`, `cast`) | Exact release/commit required | D-024 remains pending. `foundryup` commands below bootstrap/install Foundry but do not pin an immutable release. Record an exact version/commit in the project toolchain before calling contract setup reproducible |
| Node.js | `24.22.1` in `backend/.nvmrc` | Backend runtime selected and validated |
| npm | `11.19.1` via the backend's `packageManager` field | Backend package manager selected and validated |
| Fastify | `5.12.8` in `backend/package.json` | Exact backend dependency pin |
| viem | `2.58.0` in `backend/package.json` | Exact backend dependency pin |
| Frontend Node/package manager | Pin in the existing UI project | Pending UI integration; preserve the owner-managed Figma implementation |
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

The contract scaffold and `foundry.toml` are not present yet, and `forge` was not detected in the environment used for this setup check. Choose and record exact Foundry and Solidity versions before the first reproducible contract build.

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

## 6. Pending contract and demo commands

After Foundry is pinned and the contract scaffold lands, add and validate commands for:

```sh
forge build
forge test
```

The later deployment/reset scripts must use disposable Anvil accounts, assert the Safe has no enabled modules, write a deployment manifest, and stop on any failed health assertion. A clean-checkout demo is not reproducible until the contract tests, reset flow, and fixture report all run from their pinned toolchains.
