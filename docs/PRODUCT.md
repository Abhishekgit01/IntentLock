# IntentLock product and scope specification

## 1. Product summary

IntentLock is a reference implementation of an intent-bound transaction guard for a Safe-style multisig on a local EVM chain. Before a proposed vault transaction can execute, a threshold of independent verifiers must decode the actual transaction and attest that its structured intent corresponds to the exact transaction digest. The guard checks that the Safe is executing that digest and that a valid, fresh, threshold-satisfying attestation exists. It does not attempt to infer arbitrary calldata semantics inside Solidity.

**Core thesis:** clear signing advises; the guard enforces.

## 2. Problem and intended outcome

Multisig signers can approve a transaction whose actual effect differs from the interface description they relied on. A valid signature over transaction bytes establishes what was signed; it does not prove that the signer independently understood those bytes. An attacker who controls a proposal interface can mislabel a dangerous call as an ordinary transfer.

IntentLock's intended outcome is narrowly testable: for supported transaction types, the vault executes only when the transaction being executed has the same chain, Safe, nonce, call fields, and canonical intent commitment as the transaction independently reviewed by the configured verifier threshold. Unsupported or ambiguous calls map to `REFUSE_UNSUPPORTED` and workflow `QUARANTINED`; understood policy violations map to `REFUSE_POLICY` and workflow `REJECTED`. Only the explicitly allowed guard replacement uses the timelock.

## 3. Users and roles

| Role | Responsibility | Trust assumption |
|---|---|---|
| Safe owner/signer | Approves Safe transactions through the ordinary multisig process | May see a misleading proposal UI; Safe owner signatures alone are not IntentLock attestations |
| Intent verifier | Independently obtains the proposal, decodes raw transaction fields, checks the canonical intent and policy, then signs an EIP-712 attestation | Each verifier key and execution environment is independently controlled; a threshold compromise defeats this layer |
| Operator/demo runner | Deploys and resets the local chain, loads deterministic fixtures, starts app/services, and runs scenarios | Can control the demo environment but should not be able to silently rewrite verifier output after signing |
| Reviewer/judge | Inspects raw call data, digest, verifier results, chain receipt, and test evidence | Must be able to reproduce core claims from artifacts, not trust animation or narrative |

The prototype may run multiple verifier processes on one development machine for convenience, but the demo must label that as a simulation of independent trust domains. For the strongest demonstration, run separate processes and keys, ideally on separate devices.

## 4. Goals

1. Show a normal multisig executing a deceptive call in a controlled local-chain scenario.
2. Show the malicious `DELEGATECALL` blocked by an unconditional on-chain rule, then show a separate `CALL` blocked when required independent attestations are absent or inconsistent.
3. Show a supported, benign transfer accepted, demonstrating that the guard is not simply a blanket pause.
4. Bind each attestation to chain ID, Safe address, Safe nonce, exact transaction digest, canonical intent hash, verifier-set/policy context, and freshness.
5. Fail closed when the verifier threshold is not met, the transaction fields differ, the attestation is stale/replayed, or the call cannot be safely classified.
6. Produce reproducible test output and an evidence report that states corpus size, fixture classes, denominators, and limitations.
7. Keep the security mechanism blockchain-native: the guard enforces at Safe execution time and emits on-chain evidence.

## 5. Non-goals

- Universal semantic analysis of arbitrary EVM bytecode or calldata.
- Replacing Safe's owner threshold or its normal transaction-signing flow.
- A browser extension, a production wallet, or support for every wallet/multisig.
- Treating transaction simulation, an AI model, a signature database, or a human-readable interface as the enforcement mechanism.
- Claiming that a decoded transfer is safe solely because it is a transfer. Destination and amount policy are separate checks.
- Production deployment, audit certification, legal admissibility, or compliance guarantees.
- Building the B3 TRACE fallback while the B1 delivery gate remains healthy.
- Defining Figma visuals. Figma determines screen design; these docs define functional requirements and data.

## 6. Required user-visible behavior (not visual design)

The application must be able to expose these facts to the Figma-designed experience:

- Proposed Safe address, chain ID, Safe nonce, target, value, operation, calldata, and computed Safe transaction digest.
- Independently decoded intent, decoder status/source, policy class, and any unknown/ambiguous fields.
- Each verifier's identity/key, decision, attested transaction digest, attested intent hash, timestamp/expiry, and reason code.
- Threshold progress (for example, 1 of 2 required attestations) without implying approval before the threshold is satisfied.
- Guard result, exact reject reason, execution receipt, and before/after vault balances when a scenario is executed.
- Clear distinction among `AWAITING_THRESHOLD`, `APPROVED`, `QUARANTINED`, `REJECTED`, `TIMELOCK_PENDING`, `TIMELOCK_READY`, `CANCELLED`, `EXECUTION_PENDING`, `EXECUTED`, `EXECUTION_FAILED`, and `EXPIRED` states.
- A persistent indication that demo addresses, balances, and attack payloads are synthetic local-chain fixtures.

The frontend must never make an unverified proposal look verified just because it has a friendly label. A label supplied by the proposal UI is untrusted metadata; the verifier's decoded output is authoritative for the supported decoder set.

## 7. Functional requirements

### FR-1: Proposal identity

Given a Safe transaction, the system computes the Safe transaction digest from the configured Safe version/domain and the full Safe transaction fields. The digest shown by the app must match the digest checked by the guard. Field edits, changed nonce, chain, Safe, target, value, data, operation, gas/refund fields included by the Safe version, or other digest fields invalidate prior attestations.

### FR-2: Independent decoding

Each verifier independently obtains the raw proposal and resolves the target/proxy context according to the decoder policy. It produces the same versioned canonical intent object or refuses to attest. A verifier must not sign a semantic description supplied only by the frontend.

### FR-3: Attestation threshold

For the demo, configure three attester keys and require two distinct valid keys. Duplicate signatures from one key count once. Only configured, active keys count. Threshold, verifier set, and policy version are explicit configuration, not constants hidden in UI code.

### FR-4: On-chain enforcement

Immediately before execution, the guard validates the execution context and asks the attestation registry for a valid threshold approval for the exact transaction digest, Safe, chain, nonce, intent hash, policy context, and freshness window. Any missing or invalid condition reverts the Safe execution atomically.

### FR-5: Policy classification

Supported low-risk transactions may execute after threshold approval and policy checks. `DELEGATECALL` is unconditionally refused. All high-risk administrative changes are refused except one allowlisted nonzero guard replacement, which requires threshold approval plus the exact configured timelock. Unknown/ambiguous calls return `REFUSE_UNSUPPORTED` and workflow status `QUARANTINED`; understood policy violations return `REFUSE_POLICY` and `REJECTED`.

### FR-6: Replay and freshness resistance

Attestations are scoped to one chain, Safe, Safe nonce, and digest. They expire after a configured short window, cannot be reused for another Safe/nonce/chain, and are consumed or made unusable after execution. A reverted execution must not create a path to reuse an attestation for a different transaction.

### FR-7: Audit trail

The system emits events for attestation submission/acceptance, policy/timelock actions, execution authorization/rejection where observable, and verifier-set changes. Do not rely on an event that cannot be emitted because a transaction reverted; the app should also retain the transaction hash and decoded revert data from its RPC response.

### FR-8: Failure behavior

Failure to decode, reach a verifier, obtain enough valid attestations, query the registry, or validate the Safe integration must not fall back to execute. Display a concrete status/reason and preserve enough information to retry safely.

## 8. Acceptance criteria

The prototype is demo-ready only when all are true:

- A scripted unguarded baseline attack produces the defined malicious effect.
- IntentLock unconditionally blocks the delegatecall attack, leaves vault/configuration state unchanged, and separately blocks a CALL-based transaction that lacks or mismatches the required registry attestation.
- A supported legitimate transfer executes and produces the expected balance delta.
- Wrong chain, wrong Safe, wrong nonce, altered transaction fields, wrong runtime code hash, changed supported proxy implementation, expired signatures, duplicate signer, insufficient threshold, unknown call, disabled verifier, module execution, and guard self-removal attempts fail as specified.
- Repeating the run from a clean scripted chain produces the same outcome and stable report.
- The actual Foundry output is captured; percentages in slides/report are computed from that output, with fixture denominator shown.
- The demo narration calls this a proof of concept, describes the supported transaction subset, and names material residual risks.

## 9. Product language

Preferred: “IntentLock binds an independently reviewed intent to a specific Safe transaction and makes the guard enforce that binding at execution.”

Avoid: “understands every contract,” “makes multisigs unhackable,” “guarantees safe transactions,” “audited,” “production-ready,” or vendor comparisons presented as verified facts unless independently sourced and checked for the versions/date of the pitch.
