# Threat model and security claims

## 1. System assets

- Native/ERC-20 assets held by the Safe-style vault.
- Safe ownership, threshold, guard, module, implementation, and fallback configuration.
- Integrity of the transaction-to-intent binding.
- Verifier private keys and verifier-set configuration.
- Correctness and availability of the guard, registry, decoder, and timelock.
- Integrity and reproducibility of evidence used in the demo and report.

## 2. Security objective

For covered Safe execution paths, prevent a transaction from executing unless its exact transaction digest is bound to a supported canonical intent that has valid approvals from the configured verifier threshold and satisfies configured policy. High-risk security-configuration changes require additional delay and revalidation.

“Prevent” is scoped to tested code, configured verifier keys, supported transaction families, and the covered execution path. It is not a universal guarantee about arbitrary EVM behavior.

## 3. Attacker capabilities considered

Assume an attacker may:

- Control or alter the proposal UI, labels, API responses, or transaction display metadata.
- Submit crafted calldata, unknown selectors, malformed fields, stale proposals, or transactions targeting changed proxy implementations.
- Control one signer or one verifier key/process, but not automatically all independent verifier domains.
- Replay a previously observed attestation on a different chain, Safe, nonce, policy version, or transaction.
- Attempt to remove/replace the guard, enable/disable modules, or alter Safe ownership/implementation.
- Exploit races, stale state, time/block-dependent behavior, and coordinator/RPC outages.
- Cause denial of service by withholding verifier responses or exploiting a restrictive guard.

Assume attacker cannot break ECDSA/EIP-712 cryptographic primitives, forge signatures of uncompromised keys, or modify consensus of the local EVM. Those assumptions do not establish production security.

Safe-specific scope is pinned to Safe Smart Account `v1.4.1`: its standard transaction guard applies to `execTransaction`; module execution does not invoke that hook. The prototype configures no modules and denies module enablement. A direct module call is therefore unreachable in the configured deployment, but is not protected by the transaction guard if a module were enabled.

## 4. Threat matrix

| Compromise/attack | Expected response | Required evidence/test | Residual limit |
|---|---|---|---|
| Proposal UI lies, actual fields unchanged | Independent verifier decodes raw fields; mismatching intent is not attested; guard requires valid matching approval | Misleading label fixture, actual calldata/digest displayed, attack blocked | If enough verifier domains trust the same false source, protection fails |
| Proposal fields changed after attestation | Digest mismatch / stale nonce revert | Mutate each digest field independently | Depends on exact complete Safe hash implementation |
| One verifier compromised | Below 2-of-3 threshold; no approval unless policy explicitly uses another valid pair | One-key signature fixture | Compromise of threshold keys defeats verifier layer |
| Two or more verifier keys compromised | May approve an otherwise attestable harmful `CALL`; unconditional `DELEGATECALL`/admin rules still apply | Independent key operation; only allowlisted guard replacement gets a timelock | Accepted residual risk; threshold is not magic if keys share infrastructure |
| Verifier process unavailable | Fail closed; show pending/error; no execution | Stop verifier/RPC in fixture | Availability suffers; operators may be tempted to bypass controls |
| Unknown selector or ambiguous proxy | `REFUSE_UNSUPPORTED` → `QUARANTINED` | Unknown/malformed/proxy fixtures | Coverage limited to supported decoder mappings |
| Correctly decoded transfer to malicious recipient | Policy denies or flags based on allowlist/cap | Destination policy fixtures | Allowlist itself can be wrong or stale |
| Conditional behavior changes at execution | `REFUSE_POLICY` if known to be context-dependent; `REFUSE_UNSUPPORTED` if effects cannot be modeled | Context-dependent fixture demonstrating limitation | Decoder/attestation cannot guarantee all runtime effects; only guard replacement has a timelock |
| Cross-chain/Safe/nonce replay | EIP-712 domain and explicit context mismatch; reject | Replay matrix | Depends on domain and version implementation correctness |
| Expired or duplicated verifier signatures | Reject / count signer once | Expiry, duplicate, malformed signature fixtures | Timestamp policy must be configured correctly |
| Attempt to remove guard or enable module | Unconditional policy refusal; guard removal and module enablement are not timelocked | `setGuard(0)`, module fixture | Alternate Safe entry points may bypass hooks unless specifically covered |
| Module execution bypass | Safe 1.4.1 module calls do not use the transaction guard; deploy with no modules and refuse enablement | Inspect [pinned Safe source](https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/base/ModuleManager.sol) and test module route | Safe-version-specific; this is an explicit uncovered path, not a protected one |
| `DELEGATECALL` attempt | Unconditionally reverted before registry lookup | Operation check fixture and unchanged-state assertion | No delegatecall use case is supported by this prototype |
| Proxy implementation changes behind stable proxy code | Resolver checks current implementation address and implementation code hash; otherwise unsupported | Mutate proxy implementation and verify guard rejection | Only specifically supported proxy types with an on-chain resolver are covered |
| Guard/registry bug | Tests/review reduce risk; recovery/reset plan | Adversarial tests, independent review | Un-audited prototype may lose funds or lock vault |
| Coordinator compromised | Can lie about display or availability, but cannot forge threshold signatures or bypass guard | Run without coordinator / verify directly on-chain | Client may still mislead humans; use chain state as authority |
| RPC lies/stale state | Cross-check chain ID/code/digest, fail closed on inconsistency | RPC mismatch fixture | A single trusted RPC remains a dependency in demo architecture |
| Demo operator changes chain state | Artifacts/manifest reveal configured local setup | Clean reset and reproducibility | Local chain is controlled by demo operator |

## 5. Trust assumptions to disclose

- Verifier keys are independently generated, stored, and operated. Three keys on one browser/device do not establish three trust domains.
- The verifier code correctly implements the canonical decoder, policy, and signing rules.
- The guard is invoked on every execution path claimed to be protected.
- The Safe release and hook interface are pinned and correctly integrated.
- The attestation registry correctly verifies threshold, freshness, replay scope, and policy version.
- The chain/RPC state used during review is sufficiently consistent with execution state.
- Local fixtures are synthetic; they demonstrate mechanism behavior, not an incident reconstruction.

## 6. Explicitly accepted residual risks

1. A threshold of verifiers can collude or be compromised.
2. A verifier can correctly decode an action that policy should reject; policy/allowlists can be incomplete.
3. Arbitrary contract code can behave differently at execution than a static decoder or simulation predicts.
4. Safe modules or alternate entry points may not invoke the configured guard. The prototype disables modules; it does not claim their transactions are protected.
5. A guard flaw can permit harmful execution or deny service, potentially locking funds.
6. Local EVM success does not prove production chain, operational security, or incident resistance.
7. A compromised Figma/client implementation may mislead the human even when the on-chain guard remains correct; the independent verifier and chain evidence are the security mechanism.

## 7. Claims allowed in demo

Allowed: “In this pinned local-chain prototype, the tested delegatecall is unconditionally blocked, a separate CALL is blocked without the configured verifier threshold for its exact supported intent, and the valid transfer fixture succeeds.”

Not allowed without additional evidence: “IntentLock prevents all malicious transactions,” “the Safe cannot be drained,” “universal semantic verification,” “module-proof” absent exact module tests, “audited,” “production-ready,” or “court-admissible.”

## 8. Security review checklist

- Confirm all Safe digest fields and domain/version handling.
- Confirm signature recovery and duplicate signer rejection.
- Confirm expiry, future timestamps, nonce consumption, verifier-set rotation, and policy hash behavior.
- Confirm all Safe execution entry points, module paths, setup/fallback behavior, delegatecall/MultiSend coverage.
- Confirm guard installation cannot be omitted/replaced through an unprotected route.
- Confirm timelock binds exact action and cannot be bypassed by rescheduling or field substitution.
- Confirm fail-closed behavior for RPC, registry, decoder, and verifier failures.
- Confirm all private keys are disposable local keys and absent from frontend bundles/logs.
- Have a human reviewer read and understand all security-critical contract code; AI output is not a security audit.
