# System architecture

## 1. Architecture goals

- Keep the enforcement decision on-chain at Safe execution time.
- Keep semantic decoding outside Solidity, where a deliberately bounded decoder can be tested and extended.
- Keep the proposal UI outside the trusted path: it may propose fields or display results, but it cannot supply trusted intent text.
- Separate verifier keys/processes from the proposal interface and from one another.
- Make all off-chain explanations traceable to a digest, canonical intent hash, policy version, and on-chain result.

## 2. Logical components

| Component | Responsibility | Trusted for |
|---|---|---|
| Local EVM (Anvil) | Deterministic chain state for the prototype | Execution semantics of the pinned local deployment only |
| Safe-style vault | Owns demo assets and executes owner-approved Safe transactions | Applies its configured threshold and invokes its configured guard on covered execution paths |
| IntentLock guard | Checks exact execution context and valid authorization before Safe execution | Final allow/revert decision for the covered Safe execution path |
| Attestation registry | Stores/verifies verifier-set config, signatures/approvals, freshness, consumption, and policy context | Whether a threshold approved this exact scoped intent |
| Timelock | Delays the one allowlisted nonzero guard replacement and exposes cancellation | Delay enforcement for that exact digest only; not a guarantee against compromised authorized actors |
| Proposal client | Creates/displays proposals and invokes workflow APIs/RPC | No security authority; all fields are revalidated elsewhere |
| Independent verifier process | Reads raw proposal, resolves supported call semantics, applies policy, signs EIP-712 attestation | Its own interpretation and key; not the execution truth by itself |
| Coordinator/API (optional) | Relays proposals, verifier responses, and receipts; serves read-only status | Availability and transport only; must not be able to mint attestations or override chain rules |
| Evidence collector | Captures fixture inputs, RPC results, logs, contract events, and test output | Completeness of captured evidence only; raw chain/test artifacts remain the source for claims |

## 3. Trust boundaries

1. **Proposal UI boundary:** all human-readable labels and declared intent from the proposal interface are untrusted. Raw transaction fields and digest must be recomputed.
2. **Verifier boundary:** verifier software and keys form a separate trust domain. A threshold compromise can approve harmful transactions, so key separation, configuration visibility, and timelock policy matter.
3. **Coordinator boundary:** API/database/queue outages or compromise may delay or misrepresent status, but cannot produce valid signatures or bypass the on-chain guard.
4. **Chain boundary:** Anvil models deterministic EVM behavior for this demo. It does not prove behavior on a production chain, under different dependency versions, or for module execution. Safe 1.4.1 module execution does not call the transaction guard; the prototype deploys with no modules enabled and refuses module enablement.
5. **Contract boundary:** guard and registry code are security-critical and un-audited. A bug may block valid actions, permit invalid actions, or permanently lock the Safe.

## 4. Data flow: proposal to execution

1. Proposal client constructs Safe transaction fields and submits them to the coordinator or directly to verifier processes.
2. Every verifier independently checks chain ID, Safe address/code/version, current nonce, target code/proxy implementation, value, calldata, operation, and all Safe digest fields.
3. The verifier decodes only supported transaction families and creates the versioned canonical intent. It checks policy (such as destination allowlist and amount limits).
4. The verifier computes the Safe digest and canonical `intentHash`; it signs the EIP-712 attestation only if the fields, interpretation, policy, and freshness are valid. Unknown/ambiguous calls return `REFUSE_UNSUPPORTED` and no signature; known policy violations return `REFUSE_POLICY` and no signature.
5. Signatures are collected. The frontend may show progress, but the registry/guard independently verifies signer membership, uniqueness, threshold, scope, and expiry.
6. Safe owner signatures are collected through the Safe transaction path. Safe execution invokes the guard for the supported `execTransaction` path.
7. The guard derives or receives the Safe execution context from the Safe hook, recomputes/validates the transaction identity, and checks the registry. It reverts if any binding is missing or mismatched.
8. On success, the Safe executes and chain receipts/events become the authoritative execution evidence. The coordinator records the receipt and reconciles UI status with chain state.

## 5. Component communication

For a prototype, use JSON-RPC to Anvil and a small typed Node.js service only if it materially simplifies orchestration. A coordinator is optional: avoid adding a database or signing service unless required. If an API exists, it relays opaque signatures and metadata; private attester keys must not live in the browser or coordinator.

Suggested boundaries:

- `proposal` package: Safe transaction creation, canonical field validation, digest computation.
- `decoder` package: read-only chain access and deterministic supported-call decoding.
- `verifier` package/process: policy evaluation and local key signing.
- `contracts` package: guard, registry, timelock, demo fixtures, deployment/setup scripts.
- `web` package: Figma implementation and read-only orchestration/display.
- `evidence` package/script: run named fixture scenarios, collect machine-readable outcomes, render report data.

This is a logical decomposition; adopt actual repository layout and language conventions when code is created.

## 6. Required invariants across components

- Every component refers to one canonical transaction identity format and one canonical intent schema version.
- The verifier and guard agree on the transaction digest algorithm and complete field set for the pinned Safe release. Guard also checks the top-level policy class against the actual call selector/action; it never trusts the class field alone.
- An attestation signs hashes/typed fields, never a UI-provided prose string.
- The decoder's output is deterministic for identical chain state, block context, code, ABI/selector resolution inputs, and schema version.
- A decoder cannot return “safe” when a required field is unknown. It returns a non-attestable state.
- The coordinator cannot change an attestation's signed fields without signature verification failing.
- The chain check is fail-closed if registry or policy configuration cannot be read.
- Every result shown as executed is reconciled to a successful chain receipt and expected state transition.

## 7. UI integration boundary (Figma-owned design)

The project owner supplies the UI. It consumes the system states and API/event data defined here; it is not the source of security policy. The system must expose `PROPOSED`, `DECODING`, `AWAITING_THRESHOLD`, `APPROVED`, `QUARANTINED`, `REJECTED`, `TIMELOCK_PENDING`, `TIMELOCK_READY`, `CANCELLED`, `EXECUTION_PENDING`, `EXECUTED`, `EXECUTION_FAILED`, and `EXPIRED` states with their reason/data fields. This repository does not define screen design, accessibility treatment, visual composition, animation, or interaction styling.

## 8. Operational configuration

Keep chain ID, RPC URL, Safe address/version, guard address, registry address, timelock address, verifier-set ID, threshold, expiry, policy version, and fixture scenario in explicit environment/configuration. Validate these at startup against deployed code and expected chain. Never silently switch RPC networks or reuse deployment addresses from a different Anvil state.

## 9. Locked architecture decisions

- Reference integration: Safe Smart Account `v1.4.1`; record its exact resolved commit and artifacts. Use an actual Safe integration for Safe-specific claims. Mocks are limited to isolated unit tests.
- Attestations are submitted to the registry before execution. Safe 1.4.1's transaction guard hook receives owners' signatures and transaction parameters but has no dedicated verifier bundle argument. Registry consumption is guard-only.
- Nonce at the Safe 1.4.1 pre-hook is already incremented. The guard derives the signed nonce as `ISafe(safe).nonce() - 1`, after checking caller and nonzero nonce.
- The standard transaction guard does not cover module execution in Safe 1.4.1. Deploy with no modules and reject enablement; test the module route and make no protection claim for it.
- `DELEGATECALL` is unconditionally denied. One allowlisted nonzero guard replacement may use the timelock; all other administrative changes and guard removal are denied.
- The UI is a parallel workstream owned by the project owner. It may build against the PROTOCOL mock API and later connect to the real service. Mock output is never chain evidence.

Source references and details are recorded in [PROTOCOL.md](PROTOCOL.md) and [DECISIONS.md](DECISIONS.md).
