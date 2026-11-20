# External AI task: implement the first Solidity vertical slice

Give this task to the teammate's coding AI. It is intentionally a substantial, bounded contract assignment. The goal is a reviewable Foundry implementation for critical fixtures B01, A01, and A20; it is not permission to change UI, backend, protocol semantics, or project history.

## Copyable prompt

```text
You are implementing the first Solidity vertical slice for IntentLock. Work in a separate branch/worktree and return a reviewable diff. Do not commit, push, or modify main. Do not edit backend/, UI files, the fixture catalog, or authoritative protocol decisions. If the code conflicts with a spec, stop and report the conflict instead of silently changing security semantics.

Before editing, read these files in full:
- AGENTS.md
- docs/PROTOCOL.md
- docs/CONTRACTS.md
- docs/DECISIONS.md
- docs/VERIFICATION.md
- docs/fixtures/catalog.json (especially B01, A01, A20)
- docs/SETUP.md

Implement only the smallest end-to-end on-chain slice required to prove:
- B01: an allowlisted, under-cap native Safe transfer with valid 2-of-3 verifier attestations executes.
- A01: DELEGATECALL is unconditionally rejected before it can change state, whether or not an attestation exists.
- A20: a supported CALL with no registry attestation reverts with NoAttestation and leaves state unchanged.

Use actual Safe Smart Account v1.4.1 in integration tests. Mocks are allowed only for focused unit tests and cannot count as Safe-compatibility evidence. Pin the exact Safe dependency/tag and resolved revision. Keep compiler/optimizer settings deterministic; if D-023/D-024 are still pending, select exact compatible versions in Foundry config/toolchain files and report them as a proposed lock for the maintainers to confirm. Do not modify the docs' pending decisions yourself.

### Protocol requirements

1. Implement the Safe guard interface from the pinned Safe dependency. Verify hook signatures, call ordering, and nonce behavior from the pinned source, not memory. Safe 1.4.1 increments the nonce before its pre-execution guard hook; derive the signed nonce as current Safe nonce minus one and reject zero/invalid context safely.
2. Implement an `IntentLockRegistry` that accepts EIP-712 attestations and verifies unique active verifier signatures against the configured verifier set and threshold. Attestation schema, type order, domains, fields, freshness, nonce, digest and code-hash rules must match docs/PROTOCOL.md exactly. `consume` must only be callable by the configured guard. Anyone may relay submission if the signatures validate; no arbitrary caller can burn an attestation.
3. Implement `IntentLockGuard` that recomputes the exact Safe transaction digest for all Safe 1.4.1 fields, checks the Safe/chain/nonce/intent/digest/policy/verifier-set/freshness values, compares live `to.codehash` to top-level attested `targetCodeHash`, and atomically consumes the exact record. Do not rely on off-chain decoding at execution time.
4. Before any registry lookup, unconditionally reject `operation == DELEGATECALL` with the canonical custom error `UnsupportedOperation`. No attestation can override this rule.
5. Missing attestation must revert `NoAttestation`. Match custom error names in docs/CONTRACTS.md. Keep failed attempts as reverted calls; do not claim they emitted durable logs.
6. This slice covers direct native EOA transfer only. Require zero target code hash for that path; fail closed for contract interactions, unsupported policy classes and any unrecognized shape. Do not add proxy, ERC-20, timelock, guard replacement, module, or arbitrary admin-call support in this task.
7. Use explicit ownership/configuration boundaries and events. No private keys, test mnemonics beyond Foundry's standard local test accounts, public network deployment, real funds, `tx.origin` authorization, unchecked external call success, or default-allow branches.

### Test requirements

Add focused Foundry tests named with fixture IDs, for example `test_B01_AllowlistedNativeTransferExecutes`, `test_A01_DelegatecallAlwaysReverts`, and `test_A20_NoAttestationFailsClosed`. Also cover at minimum:
- threshold met with two distinct configured verifier signatures;
- duplicate verifier does not count twice;
- wrong Safe, wrong chain, wrong nonce, wrong Safe transaction digest, expired attestation, wrong verifier set, wrong policy hash and target-code-hash mismatch fail closed;
- a third-party caller cannot consume an attestation;
- a consumed attestation cannot execute twice;
- a reverted Safe attempt does not leave the attestation consumed;
- Safe nonce handling matches pinned v1.4.1 hook ordering;
- target and Safe state are unchanged in A01/A20 failures.

Use independent digest vectors or reproduce values from the protocol precisely. Keep signatures deterministic and local. Never weaken checks to make tests pass.

### Return package

Return:
1. The complete diff (or branch/worktree location) and a list of every changed file.
2. Exact Safe tag/revision, solc, Foundry release, optimizer settings, and dependency lock state.
3. Commands run and unedited output for `forge fmt --check`, `forge build`, and `forge test`.
4. A mapping from B01/A01/A20 plus each added adversarial test to the assertion that proves it.
5. Any protocol ambiguity, compromise, unimplemented item, or compiler warning.

Do not claim completion if any required command fails. Do not change the UI or backend to fit the contracts. A human Solidity reviewer must inspect every changed Solidity file before this work is integrated.
```

## Owner review checklist

When the diff comes back, review the selected dependency and source pins first, then inspect the Safe hook and registry consumption paths, then run the exact reported Foundry commands on a clean checkout. Compare every EIP-712 type field and hash encoding with `docs/PROTOCOL.md`. Reject any undocumented allow path, signature replay, non-guard consumption, ignored external call result, silent spec change, or claim that mocks prove Safe integration.
