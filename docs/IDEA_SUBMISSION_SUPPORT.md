# IntentLock

## Intent-bound approvals for blockchain multisig wallets

### The problem

Multisig wallets distribute transaction approval across several people, but the wallet's cryptographic signatures approve transaction data, not a trustworthy explanation of what that data will do. A proposal screen can mislabel or incompletely explain a transaction. If signers approve bytes whose effects they have not independently understood, the multisig threshold alone does not prevent a deceptive transaction from executing.

### The idea

IntentLock is an intent-bound execution guard for Safe multisig wallets. Independent verifiers read the raw Safe transaction, decode only a defined set of supported actions, and sign a structured intent together with the exact Safe transaction digest. A Safe transaction guard checks that the transaction being executed is the same one the verifiers reviewed, that the attestation threshold and policy are satisfied, and that the attestation is still valid and unused. If a transaction cannot be decoded safely or its execution data differs from the reviewed commitment, the guarded Safe fails closed.

IntentLock is designed as an enforcement layer, not just a warning. The blockchain is central because the guard checks the attestation at the point of Safe execution. The semantic decoder remains deliberately bounded: unknown or ambiguous calls are refused instead of being described as safe.

### How the prototype works

1. A user submits a Safe transaction with its complete execution fields.
2. Independent verifier processes read the raw transaction and deterministically derive a structured intent for supported actions.
3. Verifiers attest to the Safe digest, intent hash, Safe, chain, nonce, policy context, target code hash, and validity window using typed signatures.
4. The Safe guard checks the transaction and attestation on-chain immediately before execution, enforces policy, and prevents replay.
5. The interface shows the decoded action, verifier progress, policy decision, and observed execution or revert evidence.

The demonstration uses a local Anvil chain and synthetic fixtures. It contrasts an unguarded attack fixture with guarded execution, shows a valid allowlisted transfer, and demonstrates rejection when required verifier attestations are absent. `DELEGATECALL` is blocked as an unconditional defense-in-depth rule. A short timelock scene is planned only for a narrowly allowlisted guard replacement; other high-risk changes are refused.

### What is different

Transaction previews and warnings help a signer inspect a proposal, but they do not by themselves make a Safe enforce that a separately reviewed interpretation is bound to the exact transaction that executes. IntentLock adds a threshold of independent verifier attestations over both the canonical Safe digest and a structured, versioned intent, then checks that binding from the Safe guard. The project is intended as a transparent, testable reference design, not a claim to be the first product in this area.

### Intended users and impact

The intended users are teams and organizations in India that manage shared blockchain assets through multisig wallets: startup treasuries, exchanges, Web3 projects, and community organizations. IntentLock aims to make independent transaction review enforceable and auditable, reducing the chance that a misleading proposal presentation alone can lead to execution. The prototype does not claim to eliminate wallet compromise, verifier collusion, unsafe policy choices, or unsupported contract behavior.

### Evaluation plan

The prototype is evaluated with a machine-readable fixture catalog and reproducible local-chain scenarios. The critical scenarios include a legitimate transfer, a deceptive `DELEGATECALL`, a supported `CALL` with no verifier attestation, and mutations to transaction identity, nonce, chain, Safe, expiry, and code hash. Results will be reported from actual test output with fixture IDs and denominators; mock UI activity will be labeled as simulated and will not be presented as chain evidence.

### Scope and safety boundaries

- Initial support is limited to explicitly decoded, policy-checked transaction families; it does not cover arbitrary calldata.
- Unknown and ambiguous calls fail closed.
- The demo uses disposable local-chain accounts, synthetic balances, and local attack fixtures; it does not use real funds or target third-party systems.
- Safe module execution is outside the transaction-guard path in the selected Safe version. The prototype must keep the module set empty and must not claim that the guard protects module executions.
- IntentLock is a prototype, not an audited or production-ready wallet security product.
