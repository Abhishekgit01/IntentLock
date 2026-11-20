# IntentLock backend

This is the current backend/API slice. It validates complete Safe transaction fields, asks the configured Safe 1.4.1 contract for the canonical Safe transaction hash, decodes native `CALL` transfers and canonical allowlisted ERC-20 `transfer(address,uint256)` calls, applies an explicit allowlist/cap policy, accepts external EIP-712 verifier signatures, and exposes proposal/event state for the UI.

It is a local development service. It does not contain verifier or Safe-owner keys. The optional relayer key only pays gas on a localhost Anvil chain; verifier attestations and Safe signatures must be supplied externally. Execution is available only after independent verifier signatures meet threshold, the registry confirms that exact attestation, and the request supplies authorized Safe signature bytes. The guard remains the final enforcement point. The backend does not implement the guard-replacement timelock.

## Start

Requires Node.js `24.22.1` and npm `11.19.1`, pinned in this package. Copy `.env.example` to `.env`, fill in the local Anvil RPC, deployed Safe address, registry/verifier configuration, a native policy cap and at least one allowed native recipient. ERC-20 support is separately enabled only when token addresses and matching runtime code hashes, ERC-20 recipients, and a base-unit cap are all configured. `POLICY_ERC20_TOKEN_CODE_HASHES` entries correspond positionally to `POLICY_ALLOWED_ERC20_TOKENS`. To enable local transaction submission, set `RELAYER_PRIVATE_KEY` to a disposable, funded Anvil key; the server rejects non-local RPC hosts and chain IDs other than 31337. Never use a public-network or valuable account key here. This key is not committed or returned by the API.

```sh
npm ci
npm run check
npm run lint
npm run format:check
npm run dev
```

The server binds to `127.0.0.1:8787` by default. Browser origins must be listed in `ALLOWED_ORIGINS`. It uses in-memory proposal/signature state; restarting the backend clears that state. This is not suitable for production or multi-process use.

## Routes

| Route                                         | Behavior                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                 | RPC, configured Safe, policy readiness, and whether a localhost relayer is configured. Returns 503 while required local configuration is missing.                                                                                                                                                                                                                                                    |
| `GET /v1/config`                              | Non-secret capability/configuration summary, Safe address, public policy allowlist, verifier addresses, and relayer readiness.                                                                                                                                                                                                                                                                       |
| `GET /v1/context`                             | Current RPC block and Safe version/address/nonce/balance/code hash, owners/threshold, installed guard, and enabled module count. State fields are read at the returned block.                                                                                                                                                                                                                        |
| `GET /health`                                 | Also reports the configured public verifier signer address, policy hash, and decoder version. It never returns key material.                                                                                                                                                                                                                                                                         |
| `POST /decode`                                | Verifier dry run over raw Safe transaction fields only. It returns the policy decision and canonical intent when supported; it never signs. Extra labels or metadata are rejected.                                                                                                                                                                                                                   |
| `POST /v1/policy/compile`                     | Validates strict `intentlock.policy.v1` JSON and returns normalized policy JSON, canonical ABI bytes, and the registry-compatible policy hash.                                                                                                                                                                                                                                                       |
| `POST /v1/policy/lint`                        | Reports policy draft issues such as uncapped/unlimited approvals, conflicting rules, missing caps, and USD amounts without fixed base units.                                                                                                                                                                                                                                                         |
| `POST /v1/proposals`                          | Validates Safe transaction fields, chain, Safe address/version/nonce, computes `safeTxHash` from Safe 1.4.1, reads target code at a pinned block, decodes/policies supported cases, stores proposal, returns event URL. Client-supplied hashes are rejected.                                                                                                                                         |
| `GET /v1/proposals/:proposalId`               | Returns normalized proposal, decode/policy result, verifier threshold progress, and execution gate.                                                                                                                                                                                                                                                                                                  |
| `GET /v1/proposals/:proposalId/events`        | Replays events and follows updates through Server-Sent Events. `Last-Event-ID` is the event sequence.                                                                                                                                                                                                                                                                                                |
| `POST /v1/proposals/:proposalId/attestations` | Verifies an external EIP-712 EOA signature against exact proposal fields, configured verifier set, registry domain, chain time, and expiry rules. It stores the signature in memory.                                                                                                                                                                                                                 |
| `POST /v1/proposals/:proposalId/execute`      | Requires `{"safeSignatures":"0x..."}` plus an `ATTEST` decision and external verifier threshold. Submits/reads the registry record and then sends a Safe 1.4.1 transaction through the configured local relayer with an explicit gas limit, so a guard revert is mined and has a receipt. It never signs for a verifier or Safe owner. `ATTEST_WITH_TIMELOCK` fails with `TIMELOCK_NOT_IMPLEMENTED`. |

The decoder accepts native `CALL` transfers with empty calldata to an EOA and canonical ERC-20 `transfer(address,uint256)` calls to configured tokens whose live runtime code hash matches the configured hash. ERC-20 amounts stay in base units; the backend does not trust token metadata such as decimals or symbols for policy. ERC-20 transfers require zero native value, an allowlisted recipient, and an amount within the configured cap. ERC-20 approvals are always refused; unknown contracts/selectors, malformed or non-canonical calldata, and calldata calls to addresses without code are quarantined. It hard-refuses `DELEGATECALL`. The guard-replacement timelock remains unimplemented; that decision returns `TIMELOCK_NOT_IMPLEMENTED` at execution.

The `/workbench` page has a separate **Live backend** action. It reads `/v1/context`, accepts a user-pasted raw Safe transaction JSON object, submits those exact fields to `POST /v1/proposals`, and follows its Server-Sent Events stream. It does not derive or alter a transaction from the illustrated scenes. Safe hashes, decoded intent, policy decision, source block, and Safe state are RPC/API results. The illustrated Acts 1, 3, and 4 are synthetic; only the Bybit replay’s Run A is a recorded historical chain observation. Runs B, C, and R-A20 are Foundry fork test results and have no mined transaction hashes or receipts. The UI labels these sources separately. The live execute button requires real verifier signatures and Safe owner signature bytes.

During local development, the frontend's Vite server proxies `/api/*` to `http://127.0.0.1:8787`. Set `VITE_INTENTLOCK_API_URL` to an API origin only when a deployment has a separately configured backend/CORS origin.

The policy JSON shape is specified by [`docs/policy.schema.json`](../docs/policy.schema.json). The compiler normalizes and sorts addresses, then emits `keccak256(abi.encode(POLICY_TYPEHASH,1,...))`, matching the `PolicyV1` encoding in the protocol. Draft rule quotes and UI labels are not hashed.

## CLI

Start the interactive prompt with `npm run intentlock --`. You can then type `health`, `policy validate policy.json`, `decode transaction.json`, or `help` at the `intentlock>` prompt. Type `exit` or press Ctrl-D to close it. From a regular shell, run a one-shot command with the npm separator, for example `npm run intentlock -- health`.

```sh
npm run intentlock -- health --endpoint http://127.0.0.1:8787
npm run intentlock -- doctor --endpoint http://127.0.0.1:8787
npm run intentlock -- context --endpoint http://127.0.0.1:8787
npm run intentlock -- keygen
npm run intentlock -- hybrid keygen --out ./.intentlock-hybrid/verifier-1
npm run intentlock -- hybrid sign attestation-input.json --keys ./.intentlock-hybrid/verifier-1 --out attestation.hybrid.json
npm run intentlock -- hybrid verify attestation.hybrid.json --keys ./.intentlock-hybrid/verifier-1 --chain-id 31337 --registry 0xYourConfiguredRegistry
npm run intentlock -- policy validate policy.json
npm run intentlock -- policy compile policy.json --out canonical-policy.json
npm run intentlock -- policy lint policy.json
npm run intentlock -- decode raw-transaction.json --endpoint http://127.0.0.1:8787
npm run intentlock -- proposal template raw-transfer.json
npm run intentlock -- proposal create raw-transaction.json
npm run intentlock -- proposal show PROPOSAL_ID
npm run intentlock -- proposal watch PROPOSAL_ID
npm run intentlock -- sign-safe raw-transaction.json --key ~/.intentlock/keys/OWNER_KEY_FILE
npm run intentlock -- attest PROPOSAL_ID --key ~/.intentlock/keys/VERIFIER_KEY_FILE
npm run intentlock -- execute PROPOSAL_ID --safe-signatures-file /secure/path/safe-signature.txt
npm run intentlock -- conformance --endpoint http://127.0.0.1:8787
```

`policy validate`, `compile`, and `lint` run the repository's deterministic policy compiler and linter locally. `compile --out` writes canonical policy JSON; its JSON result includes canonical ABI bytes and the policy hash. `decode` accepts JSON with exactly the raw Safe transaction fields and sends it to the verifier's `POST /decode`; labels and extra fields are rejected. Use `-` instead of a filename to read JSON from stdin.

`conformance` executes checked-in policy known-answer vectors locally and checked-in decoder vectors against the configured verifier API. Decoder vectors use Safe, nonce, chain, and recipient context from `/health`. Catalog fixture rows are reported as `NOT_RUN` because the catalog does not provide complete raw transaction plus execution inputs; they are never converted into inferred passes. This command is a development conformance check, not an execution evidence exporter.

`doctor` checks the API, RPC chain ID, Safe context, policy hash, enabled module count, and relayer readiness. It prints `READY`, `READY_WITH_WARNINGS`, or `NEEDS_ATTENTION`; it never changes chain state. `proposal watch ID` reads the proposal's Server-Sent Events stream and prints each API workflow event with a plain-English explanation. API workflow events are not chain logs; transaction hashes and receipts are included only when the API has observed them from RPC.

`keygen` writes a disposable local key under `~/.intentlock/keys` with restrictive permissions and prints only its public address and file path. Keep generated keys local and out of commits/logs.

`hybrid keygen`, `hybrid sign`, and `hybrid verify` are an experimental off-chain ECDSA + ML-DSA-65 prototype. They sign and verify the same existing EIP-712 attestation digest, require a trusted public-key descriptor, and do not call the API or submit a registry attestation. Current on-chain authorization remains ECDSA-only. See [POST_QUANTUM.md](../docs/POST_QUANTUM.md) for the exact boundary and input shape.

`sign-safe` reads a local key file, asks the backend to decode the raw transaction, checks the key address against current Safe owners read from RPC, and signs only when the policy decision is `ATTEST`. It outputs the transaction-specific Safe signature, never the private key. Signature bytes are sensitive and must not be pasted into public logs. The command does not produce verifier attestations.

`attest` reads a proposal and chain timestamp from RPC-backed API endpoints, checks that the key belongs to the configured verifier set, signs the exact EIP-712 `IntentAttestation`, and submits it for backend verification. Run it separately for each independent verifier key; `keygen` does not enroll a key into the verifier set. Never use one operator's copies of multiple keys as evidence of independent trust.

`execute` submits externally produced Safe signature bytes to the configured backend. Prefer `--safe-signatures-file` to keep signature bytes out of shell history and process listings. The endpoint requires threshold attestations already collected for that proposal, writes or verifies the exact registry record, and then uses only the configured local relayer to submit `execTransaction`. It does not accept or derive any private key from command arguments.

`proposal template raw-transfer.json` reads the configured chain, Safe, current nonce, and first allowed native recipient from `/health`, then writes a mode-0600 example transaction file without overwriting an existing file. It uses a value of one wei as a minimal example. Review the generated transaction before submitting it; the template command does not create or execute a proposal.

## Proposal request

`POST /v1/proposals` accepts all digest-participating Safe 1.4.1 fields. Integer values are decimal strings to avoid JavaScript number precision loss:

```json
{
  "transaction": {
    "chainId": 31337,
    "safe": "0x0000000000000000000000000000000000000001",
    "safeNonce": "0",
    "to": "0x0000000000000000000000000000000000000002",
    "value": "1000000000000000",
    "data": "0x",
    "operation": 0,
    "safeTxGas": "0",
    "baseGas": "0",
    "gasPrice": "0",
    "gasToken": "0x0000000000000000000000000000000000000000",
    "refundReceiver": "0x0000000000000000000000000000000000000000"
  },
  "declaredMetadata": { "label": "Untrusted client label" },
  "fixtureId": "B01",
  "demoScene": "legitimate_transfer"
}
```

The sample addresses are placeholders and must be replaced by deployed local addresses. `safeTxHash` and `intentHash` are computed server-side; supplying them is an error.

## Policy and evidence boundaries

- `decision` is the deterministic policy outcome. `workflowStatus` is workflow progress. They are distinct.
- `expectedRevert` is not returned as an observed fact. A live execution result appears only after Safe execution is submitted to Anvil and its receipt is read; RPC submission failures are reported as not submitted.
- API events use `source=api`; they are not chain logs. The event stream includes source block number/hash for chain reads.
- Verifier signatures are verified against the protocol EIP-712 schema before registry submission. Safe owner signature bytes are checked by Safe 1.4.1 on execution.
- The API and proposal state are not durable. Use a fresh local Anvil deployment. Local chain success demonstrates only this pinned prototype and is not production security evidence.
- The `/workbench` story scenes are labeled synthetic; only actual RPC reads, registry receipts, Safe receipts, and saved Foundry test output are evidence. Recorded Bybit data is historical, not a live Bybit feed.
