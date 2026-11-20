# Verification and evidence plan

## 1. Purpose

Verification establishes that the prototype behaves as specified for a declared fixture corpus. It does not establish universal safety. Report measured results from actual runs, include denominators, and retain machine-readable results so the report can be regenerated.

## 2. Test layers

### Unit tests

- Canonical Safe digest and typed-data hashing.
- Canonical intent encoding and hash test vectors.
- Decoder output and unsupported/ambiguous paths.
- Policy thresholds, allowlists, approvals, and high-risk classifications.
- Signature recovery, uniqueness, expiry, verifier-set versioning, and replay protection.
- Timelock schedule/cancel/readiness/consume rules.

### Contract integration tests

- Safe owner threshold plus IntentLock threshold interaction.
- Guard pre-hook context and exact Safe version behavior.
- Successful supported transfer.
- Deceptive attack revert and full state equality after revert.
- Administrative action protection and module/alternate path behavior.

### End-to-end tests

- Proposal -> independent decode -> verifier signatures -> threshold -> Safe execution -> receipt -> evidence record.
- Insufficient verifier response and RPC outage.
- UI/coordinator display reconciliation with on-chain state.
- Deterministic reset and replay of the three-minute demo scenarios.

### Fuzz/property tests

Fuzz canonical encoders/decoders, arbitrary malformed calldata, boundary integers, and one-field mutations. State invariants should include: no execution without threshold approval; changed digest never matches; duplicate signer never increases threshold; unknown classification never auto-approves.

## 3. Fixture corpus target

The single fixture source of truth is [`fixtures/catalog.json`](fixtures/catalog.json), validated against [`fixtures/catalog.schema.json`](fixtures/catalog.schema.json). It contains exactly 40 fixtures: the 25 critical fixtures below plus 15 recommended fixtures. Every row separates the verifier/policy `decision` from workflow `workflowStatus`, whether execution was attempted (`attemptedOnchain`), and an expected runtime `expectedRevert`. `kind` is the metric group (`benign`, `attack`, `unknown`, or `availability`); `category` remains a descriptive scenario family. Optional `demoScene` keys connect evidence rows to UI story beats. Do not maintain a second hand-edited fixture table in this document.

The critical 25, which must not be cut under time pressure, are: B01, B03, B06, A01–A09, A13, A15, A16, A19, D01, D02, P01, H01, H02, H04, H06, H08, and F01. All other 15 catalog fixtures are recommended additions. This count uses the identifiers from the review; the machine-readable catalog's `critical` field is authoritative.

Expected decisions use the protocol enum: `ATTEST`, `ATTEST_WITH_TIMELOCK`, `REFUSE_UNSUPPORTED`, or `REFUSE_POLICY`. These are policy outcomes. Workflow statuses `QUARANTINED` and `REJECTED` are derived consistently from refusal decisions; do not mix terms or count them interchangeably.

`expectedRevert` describes what a deliberately attempted execution is expected to return. It is not a policy verdict and is not proof that the guard ran. For every run, record the actual `observedRevert` separately from the expected value. In particular, a proposal can have `decision=ATTEST` and later fail with `DigestMismatch`, `WrongSafe`, `WrongChain`, `Expired`, `NoAttestation`, or a code-hash error. Keep policy refusals with no execution attempt separate from negative guard tests that deliberately exercise a denied transaction.

Specific interpretation for the critical set:

- A01 demonstrates an unconditionally blocked delegatecall deception payload. Separate CALL-based fixtures verify missing/mismatched attestation paths.
- A07 checks that transaction nonce in the digest is the pre-increment nonce even though Safe 1.4.1's hook observes the incremented value.
- D01/D02 produce `REFUSE_UNSUPPORTED` and workflow `QUARANTINED`.
- P01, H01, H02, and H04 produce `REFUSE_POLICY` and workflow `REJECTED`.
- H06 tests premature execution of the one allowlisted guard-replacement timelock action.
- H08 proves Safe 1.4.1 module execution is not protected by the transaction guard; configured empty modules must make that execution impossible.
- F01 proves registry/RPC/verifier outages fail closed.

## 4. Metrics and formulas

Report raw counts first. Percentages are secondary and must state the exact denominator.

- **Attack rejection rate** = `kind=attack` fixtures expected to be blocked whose actual run matches the required refusal/revert and state assertions / all `kind=attack` fixtures expected to be blocked.
- **Benign acceptance rate** = `kind=benign` fixtures expected to execute whose actual receipt/state matches / all `kind=benign` fixtures expected to execute.
- **False-positive rate** = `kind=benign` fixtures incorrectly blocked / all `kind=benign` fixtures expected to execute.
- **Unknown fail-closed rate** = `kind=unknown` fixtures with no attestation and no execution / all `kind=unknown` fixtures.
- **Replay rejection rate** = replay attempts rejected / replay attempts.
- **High-risk timelock enforcement** = premature high-risk execution attempts rejected / premature attempts; also report successful ready execution and cancellation as separate counts.
- **State integrity** = attack failures with all protected state unchanged / attack failure fixtures.

Count policy `REFUSE_UNSUPPORTED` separately from `REFUSE_POLICY`, and workflow `QUARANTINED` separately from `REJECTED`. Count attempted guard failures by `observedRevert`, independently of the decision enum. Do not call quarantine “detection.” Availability fixtures are reported separately and excluded from benign/attack/unknown denominators.

The catalog removes B07, A10–A12, and A17 to retain an exact 40-row corpus. Their security properties remain required unit-level assertions: unknown/unsupported policy class; changed `targetCodeHash`; changed policy hash; changed verifier-set epoch; removed verifier signer. Include these assertions in the corresponding typed-data, guard, and registry tests even though they no longer add end-to-end catalog rows or metric denominators.

## 5. Baseline comparison

Use a transparent baseline: what a basic prompt shows (raw address/function/hex or an intentionally misleading label). Use identical fixture inputs and compare whether the baseline communicates the malicious effect versus IntentLock's independent decoded result and enforcement. This is a qualitative controlled comparison unless human-subject measurement is actually run. Do not claim improved user comprehension from a scripted demo alone.

## 6. Evidence artifacts

For each test/demo run, retain:

- Git commit/revision identifier, dependency lockfiles, Solidity/compiler settings.
- Anvil chain ID, deployment manifest, contract code hashes, scenario and fixture IDs.
- Raw Safe fields, calldata, computed Safe digest, canonical intent JSON/hash, policy version/hash.
- Verifier-set ID, threshold, public signer addresses, signatures or reproducible signature references (never private keys).
- Foundry test output and machine-readable per-fixture expected/actual outcome.
- Transaction hashes, receipts, revert data, events, and before/after relevant state.
- Evidence report generation command and timestamp.

Redact disposable local secrets if present in logs; never include private keys in evidence artifacts.

## 7. Report template

1. Build revision/configuration.
2. Test corpus definition and inclusion/exclusion rules.
3. Raw table of fixture ID, `kind`, policy `decision`, `attemptedOnchain`, `expectedRevert`, `observedRevert`, workflow status, receipt outcome, pass/fail, and artifact reference.
4. Counts and denominators for each metric.
5. Failure analysis and known unsupported classes.
6. Reproduction instructions.
7. Plain statement: prototype, local chain, synthetic fixtures, not audited or production-ready.

## 8. Release gate

Do not call the demo stable until the clean reset script passes repeatedly, the main attack is rejected with unchanged state, the legitimate transfer succeeds, and failure paths fail closed. Record a backup video after the final known-good run. A visual animation is never counted as test evidence.
