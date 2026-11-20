# Smart-contract specification

## 1. Deployment model

Deploy to a fresh Anvil chain from deterministic scripts. Pin Solidity compiler, optimizer settings, Safe release/commit, and all dependency versions. Do not use a floating “latest” Safe artifact. The deployment script records chain ID, contract addresses, code hashes, owner addresses, verifier set, threshold, timelock delay, initial vault balance, and fixture identifiers in a machine-readable deployment manifest.

Use the actual Safe Smart Account `v1.4.1` integration for Safe-specific claims and record the exact resolved revision. A mock may be used for isolated unit tests only; it is not evidence of Safe compatibility. The tagged source details and verified hook/nonce/module behavior are documented in [PROTOCOL.md](PROTOCOL.md).

## 2. `IntentLockRegistry` responsibilities

The registry stores threshold attestations before execution. It must not decide transaction meaning. This is the selected design because Safe 1.4.1's guard hook has no dedicated verifier-bundle parameter; owner signatures are passed through the existing `signatures` parameter and are not repurposed by IntentLock.

Required configuration/state:

- Current verifier-set epoch/ID.
- Active verifier addresses and threshold `k`.
- Policy hash/version accepted for proposals.
- Validity bound/max attestation lifetime.
- Per-Safe/per-nonce/per-digest approval state or equivalent one-use marker.
- Explicit owner/administrator authority and controlled update path.

Required checks:

1. Attestation submission is permissionless or relayable, but signatures are cryptographically verified; `consume` is callable **only by the configured guard**. An arbitrary caller cannot invalidate, consume, or burn an attestation.
2. Domain chain and verifying contract match.
3. `safe`, `safeNonce`, digest, intent hash, policy hash, verifier-set epoch, issue/expiry, and proposal ID are valid.
4. Every signature recovers a configured active signer over the identical typed digest.
5. No signer is counted twice.
6. Count reaches threshold.
7. Attestation is not expired, future-dated outside allowed skew, invalidated, or already consumed.

Expose a view/check function for the guard and a constrained submit/consume flow. The guard checks and consumes the exact record atomically within the Safe execution call. If any later hook/execution step reverts, EVM transaction atomicity rolls back the consumption too. An earlier public submission transaction only creates the attestation record; nonce/digest scoping prevents reuse for another Safe transaction.

## 3. `IntentLockGuard` responsibilities

The guard is the final enforcement point for the covered Safe execution path. Implement the exact guard interface of the pinned Safe. Do not design from memory; compile against the pinned interface and confirm all hook arguments and call ordering from source.

Pre-execution checks:

- Caller/context is the configured Safe (or the exact expected Safe hook context).
- Transaction digest matches the Safe's canonical digest for all relevant fields.
- Safe address and chain ID match the attestation.
- Safe 1.4.1 increments nonce before `checkTransaction`; read current nonce from the configured Safe and derive the signed transaction nonce as `currentNonce - 1`. Reject if caller is wrong or current nonce is zero.
- Recomputed Safe transaction digest matches the registry record.
- `to.codehash` equals the attested top-level `targetCodeHash`. For a supported proxy, the bound proxy-specific resolver must also confirm the live implementation address and `implementationCodeHash`; proxy code hash alone is not enough.
- IntentLock registry confirms threshold, signer uniqueness, active verifier set, policy version, freshness, and non-replay.
- Apply unconditional operation/admin rules from [PROTOCOL.md](PROTOCOL.md) before registry checks: always reject `DELEGATECALL`; reject Safe admin self-calls except allowlisted nonzero guard replacement with a ready timelock; always reject guard removal, module changes, implementation changes, owner/threshold changes, and fallback-handler changes.
- `policyClass` is read as a top-level attested field and mapped through the pinned on-chain policy table; it is not inferred from opaque `intentHash`.
- The sole initially permitted timelocked class is an allowlisted nonzero guard replacement (`SAFE_GUARD_REPLACEMENT`). All other high-risk actions map to `REFUSE_POLICY`.
- Unknown/unsupported action cannot pass through a “default allow” branch.

Post-execution hook behavior must be implemented as required by the pinned Safe and must not assume it can alter already committed state. Any post-hook checks should be limited to consistency/audit behavior supported by that interface.

Use explicit custom errors for each failure class. Revert errors should not leak secrets, but should allow the client/test runner to identify `NoAttestation`, `WrongSafe`, `WrongChain`, `WrongNonce`, `DigestMismatch`, `IntentMismatch`, `ThresholdNotMet`, `Expired`, `AlreadyConsumed`, `PolicyDenied`, `TimelockNotReady`, `TimelockCancelled`, `UnsupportedOperation`, `TargetCodeHashMismatch`, `ImplementationMismatch`, `OnlyGuard`, and integration-context errors. Safe-native errors such as `GS104` must be preserved and labeled as Safe errors, not renamed as IntentLock guard errors. `expectedRevert` in the fixture catalog uses these canonical names; it records an expected test result only, while run evidence stores the actually observed revert independently.

## 4. High-risk administrative actions and self-protection

Classify guard replacement/removal (`setGuard`), module enable/disable, Safe implementation/master-copy change, owner/threshold changes, fallback-handler changes, and registry/verifier-set/policy upgrades as high-risk. Initial policy is deliberately narrow: guard removal and every high-risk class except one allowlisted nonzero guard replacement are hard-refused. The replacement is the sole action that can return `ATTEST_WITH_TIMELOCK`.

The sole timelocked guard replacement requires:

1. Supported decoding and a canonical intent that identifies the exact administrative change.
2. Independent attestation threshold for the exact transaction.
3. Timelock schedule with a nonzero, configured delay.
4. No execution before `readyAt`.
5. Cancellation through the explicitly configured authority/process.
6. Revalidation of digest, Safe nonce, policy version, and attestation when executed; a changed transaction must be rescheduled and re-attested.

The replacement address must be nonzero, have code, and match an explicitly allowlisted guard code hash; otherwise refuse it. Test that the current guard cannot be removed, replaced without timelock, or bypassed by a self-call. A guard bug can deny service; for the prototype, recovery may be redeploy/reset only. Do not silently add an unrestricted bypass.

## 5. Module and alternate execution-path coverage

Safe 1.4.1's `execTransactionFromModule` does not invoke the transaction guard. The prototype must start with an empty module set, reject `enableModule`, and test that module execution is impossible because no module is enabled. If an enabled-module fixture is used to prove the uncovered route, treat that as an explicit negative integration test, not as protected behavior. Do not present a module path as covered.

The same review applies to MultiSend, fallback handlers, setup initializers, recovery modules, and any direct contract method that changes execution configuration. `DELEGATECALL` is rejected unconditionally. Enumerate covered and uncovered paths in the deployment manifest and demo limits.

## 6. Timelock requirements

The timelock stores a commitment to the exact future Safe guard-replacement digest, Safe, Safe nonce, intent hash, policy/verifier-set version, replacement guard address/code hash, and `readyAt`. A permissionless `schedule(safeTxHash)` checks the registry's valid threshold attestation and records the delay; it is not itself a Safe transaction and does not advance the Safe nonce. Scheduling the identical digest is idempotent and cannot reset the timer. The signed attestation must remain valid through `readyAt`. At execution, the guard recomputes the original Safe digest using the pre-increment nonce, checks the exact schedule is ready, verifies the replacement address/code hash against the configured allowlist, then consumes the record. If another Safe transaction advances the nonce first, the schedule is stale and cannot execute. Only the Safe can cancel, preventing arbitrary cancellation griefing. Other action classes cannot be routed through this timelock by changing a UI label or enum value.

Clock source is block timestamp on the local EVM. Document that a local chain is controllable by the operator and does not validate real-world timing guarantees. The demonstration should show the countdown and a premature-execution revert.

## 7. Asset and vulnerable-proxy fixtures

Keep exploit fixtures intentionally local and deterministic:

- A vault holds a known starting balance.
- A benign transfer has a known destination and amount.
- A local attack fixture demonstrates the deceptive delegatecall scenario; the unconditional guard rule must block it. If a separate proxy-upgrade fixture is retained, its proxy implementation must be read and checked by a known on-chain resolver; a stable proxy `codehash` is not sufficient.
- The misleading UI text is fixture metadata and is explicitly untrusted; it is never supplied to or relied on by the guard.
- Snapshot relevant state before and after each execution: vault balance, proxy implementation, owner/guard/module configuration, Safe nonce, and emitted events.

The attack contract must only target the local fixture. Do not adapt it into a payload for a real third-party contract.

## 8. Upgrade and administration policy

For the prototype, prefer immutable or minimally configurable contracts. If configuration can change, emit events and use a defined authority. Verifier-set and policy changes should be delayed or require a separately defined governance threshold. No hard-coded private keys. Local demo keys must be clearly marked disposable and never reused on public networks.

## 9. Contract acceptance gate

Before UI integration is switched from mock to live services, demonstrate in Foundry that: valid transfer passes; delegatecall attack is unconditionally rejected with unchanged state; a separate `CALL` fixture without/mismatching attestations reverts; every signed field mutation fails; replay/wrong chain/wrong Safe/stale nonce fail; wrong runtime code hash and changed supported proxy implementation fail; unknown call fails closed; guard removal and module enablement are blocked; only allowlisted guard replacement observes the timelock; module execution is unavailable with the configured empty module set; and invalid configuration cannot deploy an open guard.
