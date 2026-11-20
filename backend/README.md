# IntentLock backend

This is the first backend/API slice. It validates complete Safe transaction fields, asks the configured Safe 1.4.1 contract for the canonical Safe transaction hash, decodes native `CALL` transfers with empty calldata, applies a configured allowlist/cap policy, accepts external EIP-712 verifier signatures, and exposes proposal/event state for the UI.

It is a local development coordinator, not an execution authority. It does not contain verifier private keys. It does not yet submit the threshold attestation to an on-chain registry or send Safe transactions; `POST /v1/proposals/:proposalId/execute` therefore fails closed with `EXECUTION_ADAPTER_NOT_CONFIGURED`. A UI must never present API threshold approval as an executed or on-chain-approved transaction.

## Start

Requires Node.js `24.22.1` and npm `11.19.1`, pinned in this package. Copy `.env.example` to `.env`, fill in the local Anvil RPC, deployed Safe address, registry/verifier configuration, a policy cap, and at least one allowed native recipient. Do not put private keys in `.env`.

```sh
npm ci
npm run check
npm run lint
npm run format:check
npm run dev
```

The server binds to `127.0.0.1:8787` by default. Browser origins must be listed in `ALLOWED_ORIGINS`. It uses in-memory proposal/signature state; restarting the backend clears that state. This is not suitable for production or multi-process use.

## Routes

| Route | Behavior |
|---|---|
| `GET /health` | RPC, configured Safe, policy readiness, and unavailable execution adapters. Returns 503 while required local configuration is missing. |
| `GET /v1/config` | Non-secret capability/configuration summary for the UI. |
| `POST /v1/proposals` | Validates Safe transaction fields, chain, Safe address/version/nonce, computes `safeTxHash` from Safe 1.4.1, reads target code at a pinned block, decodes/policies supported cases, stores proposal, returns event URL. Client-supplied hashes are rejected. |
| `GET /v1/proposals/:proposalId` | Returns normalized proposal, decode/policy result, verifier threshold progress, and execution gate. |
| `GET /v1/proposals/:proposalId/events` | Replays events and follows updates through Server-Sent Events. `Last-Event-ID` is the event sequence. |
| `POST /v1/proposals/:proposalId/attestations` | Verifies an external EIP-712 EOA signature against the exact proposal fields, configured verifier set, registry domain, chain time, and expiry rules. It stores the signature in memory only; it does not submit to a registry. |
| `POST /v1/proposals/:proposalId/execute` | Intentionally unavailable until registry submission and Safe execution adapters exist. Never sends a transaction in this version. |

The first decoder subset accepts only native `CALL` transfers with empty calldata to an EOA. It hard-refuses `DELEGATECALL`, quarantines other transaction shapes, and refuses transfers when policy configuration is missing, the recipient is not allowlisted, or the amount exceeds the cap. It does not yet decode ERC-20 or the timelocked guard-replacement flow.

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
- `expectedRevert` is not returned as an observed fact. A live `observedRevert` only appears after an actual RPC attempt; this API version does not attempt Safe execution.
- API events use `source=api`; they are not chain logs. The event stream includes source block number/hash for chain reads.
- Attestation signatures are verified against the protocol's EIP-712 schema, but remain off-chain until a registry adapter is implemented.
- The API and proposal state are not durable. Use a fresh local Anvil deployment and treat all displayed addresses/balances as synthetic fixtures.
