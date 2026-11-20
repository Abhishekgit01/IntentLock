# Protocol and data contracts

This document defines the cross-component identity and attestation rules. The exact Solidity ABI and generated TypeScript types should be derived from the eventual implementation, but they must preserve these semantics.

## 1. Transaction identity

Do not invent a second informal transaction hash and call it the Safe transaction hash. Use the exact digest algorithm for the pinned Safe version, then wrap it in a versioned IntentLock context if extra fields are needed.

The transaction context must include at least:

| Field | Type | Meaning |
|---|---|---|
| `chainId` | uint256 | EVM chain identifier on which the Safe executes |
| `safe` | address | Safe that will execute the transaction |
| `safeNonce` | uint256 | Safe nonce at proposal/attestation time |
| `to` | address | Safe transaction destination |
| `value` | uint256 | Native currency value in wei |
| `data` | bytes | Exact calldata |
| `operation` | uint8/enum | `CALL` or `DELEGATECALL` as supported by the pinned Safe |
| Safe gas/refund fields | Exact Safe types | Include every field participating in the Safe digest for the pinned version |
| `safeTxHash` | bytes32 | Canonical digest computed using the pinned Safe implementation/domain |

Any mismatch in a digest-participating field invalidates the attestation. Displayed decimal amounts are presentation only; hashes use exact integer/base-unit values.

## 2. Canonical intent schema

Intent must be structured, versioned, deterministic, and suitable for hashing. Prose summaries are generated from it and are not hashed directly.

Minimum logical shape (field names can be adapted to implementation conventions):

```json
{
  "schema": "intentlock.intent.v1",
  "chainId": "31337",
  "safe": "0x...",
  "safeNonce": "4",
  "safeTxHash": "0x...",
  "operation": "CALL",
  "actions": [
    {
      "kind": "native.transfer",
      "target": "0x...",
      "asset": "native",
      "amount": "100000000000000000",
      "effects": ["decrease.safe.native:100000000000000000", "increase.target.native:100000000000000000"]
    }
  ],
  "policyClass": "STANDARD_TRANSFER",
  "decoder": {
    "status": "SUPPORTED",
    "method": "safe-transfer-v1",
    "targetCodeHash": "0x...",
    "proxyImplementation": null
  }
}
```

This example is illustrative; exact canonical encoding needs to be specified in code and test vectors before signing is implemented. Canonicalization rules must define address casing/20-byte encoding, integer width/endianness, action ordering, arrays, optional values, strings/enums, and schema version. Prefer typed structured hashing (EIP-712 or an unambiguous ABI encoding) over JSON string hashing. Publish known input/output test vectors consumed by both verifier and client.

`intentHash` is the typed hash of the canonical intent fields excluding the `intentHash` field itself. Bind the intent to the `safeTxHash` and scoped context to prevent a valid semantic statement from being transplanted to another transaction.

## 3. EIP-712 attestation

The attestation must commit to:

- EIP-712 domain: name, version, chain ID, and verifying contract (registry or designated verifier domain).
- Safe address and Safe nonce.
- Canonical Safe transaction digest.
- Canonical `intentHash` and intent schema version.
- Policy version/hash and verifier-set identifier/configuration version.
- Issue time and expiry time (or an equivalent bounded validity mechanism).
- A unique proposal/attestation identifier if needed for explicit one-time consumption.

Typed structure (canonical names and integer widths must match the ABI in code):

```solidity
struct IntentAttestation {
    address safe;
    uint256 safeNonce;
    bytes32 safeTxHash;
    bytes32 intentHash;
    uint32 intentSchemaVersion;
    uint8 policyClass;
    bytes32 targetCodeHash;
    address resolvedImplementation;
    bytes32 implementationCodeHash;
    bytes32 policyHash;
    bytes32 verifierSetId;
    uint64 issuedAt;
    uint64 validUntil;
    bytes32 proposalId;
}
```

`intentSchemaVersion` is a top-level signed field as well as a property of the canonical intent. It prevents a verifier and guard from interpreting the same `intentHash` under different schema rules. The EIP-712 type string and test vectors must include it.

`policyClass` is an enum encoded as `uint8`, not a free-form label. Freeze the numeric mapping before any signature is generated. Initial mapping: `0=UNCLASSIFIED` (never attests), `1=STANDARD_TRANSFER`, `2=APPROVAL_LIMITED`, `3=CONTRACT_INTERACTION`, `4=SAFE_GUARD_REPLACEMENT`, `5=APPROVAL_UNLIMITED`, `6=NFT_OPERATOR_APPROVAL`, `7=PERMIT_OR_SIGNATURE_AUTH`, `8=DELEGATECALL`, `9=PROXY_OR_IMPLEMENTATION_CHANGE`, `10=SAFE_ADMIN_CHANGE`, `255=UNKNOWN`. Only `1`, `2`, and `3` may return `ATTEST` when their exact policy checks pass; only `4` may return `ATTEST_WITH_TIMELOCK`; denied or unsupported values never obtain signatures. The guard independently checks that class `4` corresponds to the exact `setGuard(nonzeroAllowlistedGuard)` Safe self-call and never takes a decision solely from this byte.

These fields are security-relevant and are not hidden only inside `intentHash`: the guard needs `policyClass` to apply on-chain routing rules, and it compares the actual target's `EXTCODEHASH` to `targetCodeHash`. For a direct, non-proxy target this detects bytecode replacement. For a proxy, the proxy's own code hash can remain the same while its implementation address is stored in a separate slot; this follows from the [EIP-1967 proxy design](https://eips.ethereum.org/EIPS/eip-1967) and must be demonstrated with D05. Therefore `resolvedImplementation` and `implementationCodeHash` are required for supported proxy calls, and the guard must validate them through a proxy-specific on-chain resolver/adapter bound to an allowlisted proxy type. If no safe on-chain resolver is available, the decoder must return `REFUSE_UNSUPPORTED`; an off-chain implementation lookup alone is insufficient. Unknown or ambiguous proxy patterns fail closed.

Publish the final type string, choose widths/domain fields consistently, and test signatures against independent implementations. Reject invalid hashes, future issue times beyond allowed clock skew, expired attestations, unsupported schema/policy versions, and invalid verifier-set IDs. A zero `targetCodeHash` is valid only for a supported native transfer to an EOA with no runtime code; contract interactions require nonzero expected code hash. Zero implementation fields are valid for direct non-proxy calls.

### Execution-time code identity

At `checkTransaction`, the guard obtains the actual `to` address from Safe hook arguments and checks `to.codehash == attestation.targetCodeHash`. For a native transfer to an EOA, zero code hash is expected; for contract interactions, nonzero code hash is required. For direct targets, implementation fields must be zero. For proxies, the exact resolver associated with `policyClass` must read the live implementation address using a tested, supported mechanism, compare it with `resolvedImplementation`, and compare its live code hash with `implementationCodeHash`. `targetCodeHash` by itself does **not** close implementation-slot changes for a proxy. Do not use a generic guessed storage-slot resolver for arbitrary targets.

## 4. Threshold and replay rules

- For the demo, `n = 3`, `k = 2`; threshold is configurable and cannot be below one or above active members.
- Recover signer addresses from the typed digest; accept only active members of the exact verifier-set version.
- Count each signer once. Duplicate signatures, malformed signatures, and signatures from removed members do not count.
- All signatures in a threshold set must cover the identical attestation digest.
- Scope is specific to chain, Safe, nonce, Safe digest, intent hash, policy hash, and verifier-set version.
- Prototype storage permits at most one active proposal/attestation record per `(safe, safeNonce)`. The guard first resolves that slot, then compares the actual chain, Safe, nonce, digest, intent, and policy bindings; a field mutation at the same Safe nonce therefore returns a specific mismatch error (`DigestMismatch`, `IntentMismatch`, and so on) instead of being indistinguishable from an absent record. Competing proposals for one Safe nonce are rejected with a stable `COMPETING_PROPOSAL` API/registry error until the record is invalidated or expires. This intentionally narrow prototype rule avoids ambiguous lookup and denial-of-service consumption of unrelated records.
- Use a short configurable validity interval; define the intended demo interval and clock source in config. Expiry is not a substitute for nonce binding.
- Mark the proposal/digest consumed after successful execution, or make Safe nonce advancement make it permanently unusable. Test both success and revert paths.
- Verifier-set changes increment a version/epoch. Old signatures cannot satisfy a new set.

### Safe 1.4.1 execution-hook facts and nonce rule

The reference integration is pinned to Safe Smart Account tag `v1.4.1`; record the resolved commit in the lockfile/deployment manifest. In tagged `Safe.sol`, `execTransaction` encodes the transaction using the pre-increment nonce, increments `nonce`, verifies owner signatures, then calls the transaction guard. Thus during `checkTransaction`, `ISafe(msg.sender).nonce()` is one greater than the transaction nonce. The guard must first confirm `msg.sender` is the configured Safe and `currentNonce > 0`, then derive `safeNonce = currentNonce - 1` and use it to recompute `safeTxHash`. Never use the live nonce directly as the signed transaction nonce. See [tagged Safe.sol](https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/Safe.sol).

The same source shows `checkTransaction` receives `to`, `value`, `data`, `operation`, Safe gas/refund fields, owner `signatures`, and `msg.sender`; it has no dedicated verifier-bundle argument. IntentLock therefore chooses **pre-submitted registry attestations**. Do not overload owner signature bytes with an undocumented verifier format. `consume` is callable only by the configured guard for the configured Safe and can consume only the exact valid transaction binding. This prevents a third party from burning an attestation as a denial-of-service action. See the [tagged GuardManager interface](https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/base/GuardManager.sol).

Safe 1.4.1's `execTransactionFromModule` checks that the caller is an enabled module and executes without calling the transaction guard; its `ModuleManager.sol` has no module-guard hooks. The prototype must deploy with no enabled modules, refuse module enablement, and test the module route as uncovered. See [tagged ModuleManager.sol](https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/base/ModuleManager.sol). Recheck these facts if the Safe tag changes.

## 5. Unconditional guard rules

These checks run before registry lookup and cannot be overridden by an attestation:

1. Always reject `operation == DELEGATECALL`. The prototype has no supported delegatecall use case; this is defence in depth against arbitrary code executing in Safe storage context.
2. Reject Safe self-calls to admin selectors by default. The only exception is the specifically timelocked `setGuard(nonzeroAllowlistedGuard)` replacement flow described in [CONTRACTS.md](CONTRACTS.md). `setGuard(address(0))` is always rejected.
3. Reject `enableModule`, `disableModule`, implementation/master-copy changes, owner/threshold changes, and fallback-handler changes in the initial policy. These are not silently routed through a generic “high-risk” timer.
4. Reject execution if runtime code-hash/resolver checks fail or required registry data is missing.

The demo's delegatecall attack is stopped by the unconditional rule even if attestations are unavailable or faulty. Keep separate fixtures that exercise mismatched/missing attestation rejection on `CALL` transactions, so the demo also proves the intent-binding path.

## 6. Decision enum and state machine

Use this single policy decision enum across decoder, verifier, API, and evidence catalog:

| Decision | Meaning | Can produce an attestation? | Workflow status |
|---|---|---:|---|
| `ATTEST` | Supported action, policy permits execution without delay | Yes, after threshold and normal checks | `ATTESTING` → `APPROVED` |
| `ATTEST_WITH_TIMELOCK` | One specifically supported action, policy permits only after timelock | Yes, bound to the exact future Safe transaction | `TIMELOCK_PENDING` → `TIMELOCK_READY` → `APPROVED` |
| `REFUSE_UNSUPPORTED` | Decoder cannot completely and deterministically interpret the action | No | `QUARANTINED` |
| `REFUSE_POLICY` | Action is understood but explicitly denied by policy | No | `REJECTED` |

`QUARANTINED` is a workflow status, not a policy decision. It means no attestation was issued because support is insufficient. `REJECTED` means a known policy or enforcement rule refused the proposal. Use `ATTEST_WITH_TIMELOCK` only for the single action explicitly listed in [DECISIONS.md](DECISIONS.md); all other high-risk actions currently map to `REFUSE_POLICY`.

```text
PROPOSED
  -> DECODING
      -> QUARANTINED (decision REFUSE_UNSUPPORTED; no attestation)
      -> REJECTED (decision REFUSE_POLICY; no attestation)
      -> ATTESTING (decision ATTEST or ATTEST_WITH_TIMELOCK)
          -> AWAITING_THRESHOLD
              -> APPROVED (ATTEST; threshold valid and fresh)
                  -> EXECUTION_PENDING
                      -> EXECUTED | EXECUTION_FAILED
              -> TIMELOCK_PENDING (ATTEST_WITH_TIMELOCK; allowlisted guard replacement only)
                  -> CANCELLED | TIMELOCK_READY
                      -> APPROVED (same exact digest, still fresh)
                          -> EXECUTION_PENDING
                              -> EXECUTED | EXECUTION_FAILED
              -> EXPIRED
```

The UI may have transient network states, but it must not merge `APPROVED` with `EXECUTED`. A valid verifier threshold does not prove Safe owners approved, nor does owner approval prove IntentLock attestation.

### Timelock nonce and scheduling semantics

The proposal is a signed Safe transaction at the Safe's current nonce `N`. `schedule(safeTxHash)` is a permissionless call to the separate timelock contract; it does **not** execute a Safe transaction and does not advance the Safe nonce. The timelock verifies that the registry has a valid threshold attestation with `decision=ATTEST_WITH_TIMELOCK`, then records `readyAt` for that exact digest. Scheduling the identical digest is idempotent; it cannot reset/extend the delay. The verifier attestation's `validUntil` must be at or after `readyAt`.

After `readyAt`, Safe owners submit the original, exact Safe transaction at nonce `N`. The guard observes Safe nonce `N+1`, derives `N`, recomputes the same `safeTxHash`, checks the timelock record is ready, checks the replacement guard address/code hash against its allowlist, and consumes the registry attestation. If another Safe transaction executes first, nonce advances; the scheduled digest is permanently stale and must be cancelled/replaced with a new proposal, fresh attestation, and new schedule. The timelock cancel authority is the Safe itself, so an external caller cannot cancel an action as a denial-of-service attack.

## 7. API contract (optional coordinator)

Use JSON over HTTPS in a deployed environment and localhost HTTP only for the isolated demo. API is an untrusted relay. Every proposal response and `GET` response includes the policy `decision`, workflow `status`, verifier outcomes, `attemptedOnchain`, and an optional observed `guardRevert`. `expectedRevert` belongs to fixture/test expectations; it must never be presented as an observed chain result. Suggested routes:

### `POST /v1/proposals`

Input: exact Safe tx fields, Safe version, declared display metadata (marked untrusted), and optional scenario ID. Server validates shape, chain, and Safe nonce, computes the digest independently, and returns `proposalId`, normalized fields, `safeTxHash`, policy decision, workflow status, and `attemptedOnchain=false`. Never accept a client-computed digest as authoritative.

### `POST /v1/proposals/{proposalId}/verify`

Runs or requests each configured independent verifier. Each verifier returns a signed attestation or refusal reason. Coordinator does not sign on behalf of a verifier.

### `GET /v1/proposals/{proposalId}`

Returns normalized fields, decoder output, policy classification, `decision`, workflow `status`, per-verifier outcomes, attestation threshold state, timelock state, `attemptedOnchain`, observed `guardRevert` if an RPC execution attempt reverted, and execution receipt if available. Include source block number/hash for any chain-dependent decoder result. A revert observation is off-chain RPC/receipt evidence, not an emitted event.

### `POST /v1/proposals/{proposalId}/attestations`

Accepts signature and typed attestation fields. Recompute digest and verify signature before storage/relay. Reject mismatched proposal fields and duplicate signer entries. Do not expose private keys or allow arbitrary signer selection.

### `POST /v1/proposals/{proposalId}/execute`

Submits the Safe owner signatures and execution transaction only after client-side workflow requirements are satisfied. The guard remains authoritative; API prechecks are convenience only. Return submitted transaction hash, then reconcile final receipt/status separately.

API error envelope: stable machine code, human-safe message, retryability, and correlated request ID. Example codes: `CHAIN_MISMATCH`, `SAFE_MISMATCH`, `NONCE_STALE`, `COMPETING_PROPOSAL`, `DECODER_UNSUPPORTED`, `POLICY_DENIED`, `ATTESTATION_EXPIRED`, `ATTESTATION_INVALID`, `THRESHOLD_NOT_MET`, `TIMELOCK_ACTIVE`, `EXECUTION_REVERTED`, `RPC_UNAVAILABLE`.

## 8. Event contract

All events must index the Safe and transaction/proposal identifier where practical. Events are evidence, not a substitute for state queries.

Suggested logical events:

- `VerifierSetUpdated(verifierSetId, epoch, threshold, membersHash)`
- `AttestationAccepted(safe, safeTxHash, intentHash, proposalId, signer)`
- `AttestationInvalidated(safe, safeTxHash, proposalId, reasonCode)` where an invalidation can actually be recorded without reverting
- `HighRiskScheduled(safe, safeTxHash, proposalId, readyAt)`
- `HighRiskCancelled(safe, safeTxHash, proposalId, caller)`
- `IntentExecutionAuthorized(safe, safeTxHash, intentHash, policyClass)`
- `IntentExecutionCompleted(safe, safeTxHash, success)` only if it can accurately reflect post-execution outcome in the chosen integration

Do not claim an event records a failed pre-hook if the whole transaction revert rolls event logs back. Capture revert reason and attempted transaction hash off-chain.

## 9. Digest test vectors

Before integration, create fixtures with fixed chain ID, Safe domain/version, Safe address, nonce, all Safe transaction fields, intent fields, policy hash, verifier-set ID, timestamps, and signatures. Check outputs in at least two independent implementations (for example, Solidity and viem). Include one-field mutation vectors proving each changed field changes the signed digest.
