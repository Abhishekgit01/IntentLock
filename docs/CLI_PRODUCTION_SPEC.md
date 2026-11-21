# IntentLock CLI production build specification

## 1. Purpose

This document defines the target behavior for a production-quality IntentLock command-line client. It describes what a future implementation must build; it does not claim that the current CLI or backend already meets these requirements.

The CLI is an operator and developer interface for configuring policies, inspecting Safe state, analyzing proposals, coordinating independent verifier services, and reviewing execution evidence. It is not a wallet, custody system, or replacement for the Safe owner-signing workflow.

The CLI must follow the repository's security sources of truth:

1. [Decision register](DECISIONS.md)
2. [Protocol and API contract](PROTOCOL.md)
3. [Contract specification](CONTRACTS.md)
4. [Decoder and policy specification](DECODER_AND_POLICY.md)
5. [Threat model](THREAT_MODEL.md)
6. [Fixture catalog](fixtures/catalog.json)

If this document conflicts with those files, those files win. Any proposed change to Safe version, transaction hashing, EIP-712 fields/domain, decision enum, verifier threshold behavior, guard checks, module restrictions, key boundaries, or fixture outcomes requires the documented change procedure before implementation.

## 2. Current implementation versus target

The repository currently contains a development CLI with an interactive prompt and one-shot commands for health, doctor, context, policy tools, raw transaction decoding, proposal workflows, Safe-owner signing, verifier attestations, execution requests, conformance checks, and an experimental off-chain hybrid-signature utility. See [backend/README.md](../backend/README.md) for its actual behavior.

The current CLI is **not production-ready**. Known development constraints include:

- Proposal and signature workflow state is in memory and disappears when the backend restarts.
- The current signer-key workflow uses local key files for development; it is not a production custody or HSM integration.
- The `sign-safe` command returns signature bytes in its JSON output. Those bytes must be treated as sensitive.
- The backend has limited supported transaction decoding, limited network deployment validation, and no production multi-tenant service boundary.
- Orchard read-only backend checks have succeeded, but the full verifier-to-Safe execution path has not been proven end to end on Orchard. Anvil results do not count as Orchard evidence.
- Guard-replacement timelock execution is not implemented in the backend.
- The hybrid ECDSA + ML-DSA-65 feature is an off-chain experiment. It is not part of the Registry or Guard authorization path.

Keep the current development behavior available while adding production safeguards behind explicit profiles and signer providers. Do not make the CLI silently turn on broadcasts or reinterpret a development warning as production readiness.

## 3. Goals and non-goals

### Goals

- Make the CLI usable both interactively and in scripts, CI, and operations automation.
- Prevent accidental operation against the wrong chain, Safe, Registry, verifier set, or policy hash.
- Keep secrets out of command arguments, shell history, environment dumps, logs, crash reports, and ordinary output.
- Show operators the raw transaction fields and the independently decoded result before signing or execution.
- Preserve a verifiable record of policy hashes, proposal IDs, event cursors, transaction hashes, receipts, block hashes, and state reads.
- Make failure and pending states unambiguous and machine-readable.
- Keep protocol and policy semantics identical across the CLI, API, verifiers, Registry, Guard, and frontend.

### Non-goals

- Decoding arbitrary EVM calls or guessing unknown contract behavior.
- Storing or managing company treasury private keys on the coordinator/API.
- Bypassing Safe owner thresholds or authorizing through Safe modules.
- Treating CLI success, a verifier API response, a simulation, or a user-supplied label as proof of on-chain execution.
- Claiming the product is audited, production-ready, or able to stop every attack.
- Making the experimental hybrid post-quantum envelope an on-chain authorization path.

## 4. User roles and trust boundaries

| Role                 | CLI use                                                                                                        | Trust boundary                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Safe operator        | Inspect deployment, policy, Safe state, proposals, and execution receipts                                      | CLI display is advisory until chain state or a receipt confirms it                                                           |
| Policy administrator | Validate and compile policy drafts; submit a policy update through an explicitly supported governance workflow | The compiler is deterministic; human approval and on-chain policy update are separate actions                                |
| Verifier operator    | Run or inspect one verifier process, decode raw transaction fields, attest with its own key                    | Each verifier key and runtime must be independently controlled; one operator copying multiple keys is not independent quorum |
| Safe owner           | Review exact transaction fields and sign through the company's approved wallet or signing provider             | Owner signature is distinct from verifier attestation                                                                        |
| Auditor/reviewer     | Export evidence and reproduce a proposal's decision and execution status                                       | Must be able to trace values to source chain/API records, not CLI narrative                                                  |
| Release operator     | Install a signed CLI build and inspect its version/provenance                                                  | The binary/package must be tied to a reviewed source revision and dependency lock                                            |

The CLI must never claim that an API operator, a policy author, or a single verifier can unilaterally authorize execution. The Guard remains the final enforcement point for the covered Safe transaction path. Safe 1.4.1 module execution is outside that guard path; deployment must keep modules empty and refuse unprotected module routes as required by the locked architecture.

## 5. Invocation and interaction model

### 5.1 Interactive prompt

Running `intentlock` without a subcommand opens the prompt. The prompt must:

- Print one compact help screen with the active profile, endpoint, chain ID, and whether the connection is read-only or broadcast-enabled.
- Accept the same command syntax as one-shot use.
- Support `help`, `exit`, Ctrl-C, and Ctrl-D without corrupting state or printing secrets.
- Preserve quoted file paths and JSON strings safely; no shell expansion, command substitution, or implicit shell execution occurs inside the prompt.
- Show an explicit `intentlock>` prompt. Users must not confuse CLI subcommands such as `health` with operating-system shell commands.
- Display color only when supported; `NO_COLOR`, non-TTY output, and `--no-color` produce plain text.

Examples:

```text
$ intentlock
intentlock> help
intentlock> doctor --profile orchard-readonly
intentlock> context --profile orchard-readonly
intentlock> exit
```

### 5.2 One-shot use

Every command available in the prompt must also work non-interactively. Preserve the Node package's development invocation and provide a packaged executable for supported production environments.

```sh
intentlock health --profile orchard-readonly
intentlock policy compile policy.json --output canonical-policy.json
intentlock decode raw-transaction.json --profile orchard-readonly --output json
```

For the repository's current npm development command, include npm's argument separator:

```sh
npm run intentlock -- health --endpoint http://127.0.0.1:8787
```

### 5.3 Global options

The production CLI must define and document these options consistently:

| Option                         | Requirement                                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `--help`, `-h`                 | Show help for the current command without connecting to a network                                                                        |
| `--version`                    | Print CLI version, source revision, protocol/schema versions, and build provenance; do not print secrets                                 |
| `--profile NAME`               | Select an explicit named endpoint/config profile; no automatic network switching                                                         |
| `--endpoint URL`               | Override a profile endpoint for one invocation; validate HTTPS outside explicitly allowed local development                              |
| `--output human\|json\|ndjson` | Select stable output mode; default to human-readable text in a TTY and JSON in automation only if that behavior is explicitly documented |
| `--no-color`                   | Disable ANSI styling                                                                                                                     |
| `--timeout DURATION`           | Bound network, RPC, and stream setup time; timeout does not imply transaction failure                                                    |
| `--request-id ID`              | Carry a caller-provided correlation ID without changing signed transaction fields                                                        |
| `--verbose`                    | Emit redacted diagnostic detail to stderr only; never include keys or signature bytes                                                    |
| `--config PATH`                | Use an explicit non-secret configuration file; permissions and schema are validated                                                      |

Do not add a general `--yes` flag that bypasses high-risk execution confirmations. A non-interactive execution command must require confirmation bound to the full `safeTxHash`.

## 6. Profiles and network safety

The CLI must use an explicit profile with expected chain ID, RPC/API URL, Safe address, Registry address, Guard address, Safe version, verifier-set ID, threshold, and expected policy hash. It must read these from a versioned, schema-validated configuration file or a trusted backend and compare them with current chain state before any signing or broadcast.

Profile rules:

- `anvil-local` is a development profile restricted to loopback RPC and chain ID `31337`.
- `orchard-cyprus1` is a testnet profile restricted to the official Orchard Cyprus-1 endpoint and chain ID `15000`; broadcasts remain off unless separately enabled in the dedicated backend config.
- Any future production profile must be explicitly created, reviewed, and allowlisted. The CLI must not infer a production network from an RPC URL or silently fall back to another chain.
- A chain-ID mismatch, Safe code/version mismatch, missing Guard, unexpected Registry, policy-hash mismatch, changed verifier set, non-empty unsupported module set, RPC inconsistency, or failed code-hash/resolver check stops signing and execution.
- Profiles may contain public addresses and endpoint URLs, but no private keys, bearer tokens, seed phrases, or signature bytes.
- Configuration writes must be atomic, use restrictive filesystem permissions, and refuse to overwrite unless the operator explicitly selects a backup/replace flow.

The user must be able to print a redacted profile summary before using it. `doctor` is read-only and must not create keys, submit attestations, alter policies, or broadcast transactions.

## 7. Command tree and required behavior

### 7.1 `health`, `doctor`, and `context`

| Command   | Required behavior                                                                                                                                                                                                                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `health`  | Read API health, policy hash, decoder version, configured chain, RPC reachability, and execution-gate state. Clearly distinguish `service ready` from `execution available`.                                                                                                                                                                   |
| `doctor`  | Run read-only checks for API, chain ID, Safe code/version, owner threshold, nonce, Guard, Registry, verifier set/threshold, policy hash, module set, relayer configuration, clock/expiry, and RPC consistency. Report each check as `PASS`, `WARN`, `FAIL`, or `NOT_CHECKED` with the source and block context.                                |
| `context` | Return the current Safe and chain snapshot with block number/hash and timestamp. Include owners, owner threshold, Safe nonce/balance, Guard, modules, code hash, Registry configuration, verifier set, verifier threshold, and policy hash only when each value was actually read. Missing values are `null`/`not captured`, never fabricated. |

These commands must be safe to run repeatedly and must never broadcast.

### 7.2 `policy`

Required commands:

```text
policy validate POLICY.json
policy lint POLICY.json
policy compile POLICY.json [--output FILE]
policy compare POLICY.json --profile PROFILE
```

Requirements:

- Validate against the locked `intentlock.policy.v1` schema and strict field allowlist.
- Run the shared deterministic compiler; sort and normalize fields exactly as defined in `DECISIONS.md` and `PROTOCOL.md`.
- Print canonical JSON, canonical ABI bytes when requested, compiler/schema version, and registry-compatible `policyHash`.
- Lint for unlimited or missing caps, empty allowlists, conflicting rules, USD amounts lacking fixed base units, duplicate entries, and unsupported policy constructs. Explain whether each issue is an error or warning; do not silently repair policy semantics.
- `policy compare` reads the on-chain Registry hash and shows match/mismatch at a pinned block. It is read-only.
- A local compile does not activate policy. Policy activation requires a separately defined, authorized on-chain administrative operation and explicit confirmation; this CLI spec does not invent such a route.

### 7.3 `decode`

`decode` accepts only the raw Safe fields defined by `PROTOCOL.md`, either from a file or stdin (`-`). It must reject client-supplied `safeTxHash`, `intentHash`, `decision`, `label`, or unknown fields. It calls the verifier/API dry-run route and never signs, stores an attestation, or broadcasts.

Output must include:

- Source and block number/hash for the RPC-derived context.
- Chain, Safe, nonce, target, value, operation, calldata selector, and complete raw calldata (with a safe truncation option that preserves an export path to full bytes).
- Recomputed Safe transaction digest and canonical intent/hash when supported.
- The exact shared decision enum: `ATTEST`, `ATTEST_WITH_TIMELOCK`, `REFUSE_UNSUPPORTED`, or `REFUSE_POLICY`.
- A plain-language reason code and decoder version.
- Explicit `signingPerformed: false` and `broadcastPerformed: false`.

Unknown or ambiguous input must fail closed. The CLI must not add an AI label or infer an ABI name to turn an unsupported transaction into an attestable one.

### 7.4 `proposal`

Commands:

```text
proposal template FILE [--profile PROFILE]
proposal create FILE [--profile PROFILE]
proposal show PROPOSAL_ID [--profile PROFILE]
proposal watch PROPOSAL_ID [--profile PROFILE] [--since EVENT_ID]
proposal export PROPOSAL_ID --output FILE
```

Requirements:

- `template` reads live chain/Safe context and creates a non-overwriting mode-0600 transaction template. It does not submit or execute it. Placeholders and default one-wei values must be conspicuously identified as examples.
- `create` submits the exact raw transaction fields, rejects caller-computed hashes, and prints a proposal ID only after receiving one from the service. It must not print success if the service returns a conflict/error.
- The summary includes a short ID and copyable full ID, chain, Safe, nonce, target, value, operation, selector/data, policy result, and digest. UI labels are untrusted metadata and must be visually separated from decoded facts.
- `show` reports API workflow state separately from chain state. State such as `APPROVED` is not an execution receipt.
- `watch` uses resumable event IDs, handles disconnect/reconnect, detects gaps, and fetches authoritative current proposal state after reconnect. Mark API events separately from RPC/chain observations.
- `export` writes a redacted, machine-readable evidence bundle containing only observed data and explicit nulls for unavailable fields. It must include checksums/manifest linkage where the evidence format requires them.
- Proposal IDs and event streams must be durable in the production backend; the current in-memory store is not sufficient.

### 7.5 `attest`

`attest PROPOSAL_ID --profile PROFILE --signer NAME` selects a verifier identity from the configured signer provider. It must:

1. Re-fetch the proposal and live chain context.
2. Verify the proposal decision is attestable and that every digest field, policy hash, verifier-set ID, expiry, chain ID, Safe address, nonce, and code/resolver check matches.
3. Confirm that the selected public signer is an active member of the configured verifier set.
4. Show the decoded transaction summary, hashes, policy, expiry, verifier set, and current threshold count before requesting a signature.
5. Sign only the existing EIP-712 `IntentAttestation` specified in `PROTOCOL.md`; do not alter its fields/domain.
6. Submit the signature and verify the service's accepted response. Print signer public address and attestation state, never the private key.

Each verifier must run as a separately controlled trust domain. The CLI must warn when a development environment uses multiple verifier keys on one host. Duplicate signatures count once. A rejected or unsupported decision cannot be overridden with a CLI flag.

### 7.6 `sign-safe`

`sign-safe` is for local development/testing only unless an approved production Safe-owner signer provider is configured. It must:

- Re-fetch the transaction and current Safe owner configuration.
- Require the raw Safe transaction to decode to `ATTEST` and the signing key/address to be an active Safe owner.
- Display the exact transaction fields, `safeTxHash`, policy hash, destination/value, and chain before signing.
- Use a hardware/KMS/wallet-backed signer provider for production; prohibit raw private keys in CLI arguments, process environment, shell history, terminal logs, and output.
- Write signature material to a mode-0600 file or return it only through an explicit protected pipe. Do not print signatures by default.
- Never confuse a Safe-owner signature with a verifier attestation.

### 7.7 `execute`

`execute PROPOSAL_ID --profile PROFILE` submits Safe-owner signature material to the configured backend; the CLI does not invent missing signatures. Before execution, re-read and verify:

- Exact Safe and chain identity, Safe version/code, nonce, Guard, Registry, policy hash, verifier-set ID, and no unsupported modules.
- Decision is `ATTEST`, the required independent verifier threshold is met for the exact digest/intent, attestation is valid and unconsumed, and Safe-owner signatures satisfy the Safe threshold.
- The target code hash/resolver result is still the one attested.
- A fresh simulation or call where supported; simulation is advisory and never substitutes for Guard enforcement.

Interactive execution must display the full transaction summary, decoded intent, policy result, verifier signers/count, Safe owner threshold, expected chain/addresses, gas cap, and `safeTxHash`; the operator must type a confirmation token derived from the full hash. Non-interactive execution requires `--confirm-safe-tx-hash FULL_HASH`; no `--yes` bypass is allowed.

After submission, report `SUBMITTED`, `PENDING`, `CONFIRMED`, `REVERTED`, or `UNKNOWN` from observed RPC state. A timeout after broadcast is `UNKNOWN` until reconciled by transaction hash/nonce; do not automatically resubmit and risk duplicate execution. Include transaction hash, receipt status, block/hash, gas, revert name/selector/args if available, and state diff only when actually observed. A successful response from the API alone is not proof of execution.

`ATTEST_WITH_TIMELOCK` is not executable unless the timelock contract and service path are implemented and verified. Never silently route it through ordinary execution.

### 7.8 `conformance`

`conformance --endpoint URL [--catalog] [--json FILE]` must:

- Run shared digest, intentHash, EIP-712, policy-compiler, decoder, and error-selector known-answer vectors against the configured verifier endpoint.
- Run only catalog fixtures that have complete raw inputs and an explicit runnable adapter. Report all other entries as `NOT_RUN` with reason.
- Emit per-case fixture ID, expected result, observed result, pass/fail/not-run, endpoint, chain context, and source.
- Never infer a pass from fixture metadata, mock screens, or a missing response.
- Exit nonzero on failed required vectors or environment/config mismatch; use a separate nonzero/warning status for not-run catalog entries according to documented selection options.
- State that conformance is a test result, not a security audit or on-chain execution report.

### 7.9 `keygen` and experimental hybrid commands

- `keygen` in the development CLI may create disposable local test keys. It does not enroll them on-chain or make them production keys.
- Production verifier/Safe-owner keys must be generated and held by an approved custody boundary (HSM, KMS, hardware wallet, or company signer service). Choose and document supported signer providers before production implementation.
- `hybrid keygen`, `hybrid sign`, and `hybrid verify` remain explicitly experimental and off-chain. They must display that hybrid envelopes are not submitted to the Registry/Guard and do not alter execution authorization. No quantum-resistance claim is permitted.

## 8. Output contract

### Human output

- Use concise sections: `Target`, `Observed`, `Decision`, `Next action`, `Evidence`.
- Explain technical errors in plain English while preserving the original error code and selector.
- Distinguish `not configured`, `not captured`, `unavailable`, `pending`, `failed`, and `not applicable`.
- Do not use a green success state for an HTTP response where chain evidence is still pending.
- Truncate long calldata only in the display; provide a safe export path to the full calldata and hash.

### JSON output

- Use a versioned JSON schema and stable field names/types. Human-readable wording is additive and must not be the only machine result.
- Include `schemaVersion`, `command`, `profile`, `requestId`, `generatedAt`, `source`, and `status`.
- Represent chain quantities as decimal strings or hex according to the protocol; never convert uint256 values to floating-point numbers.
- Use `null` plus a `missingReason` when data was not captured. Do not replace absent fields with zeros, synthetic hashes, or guessed labels.
- Redact secrets and signatures by default. If a command must output a signature for an integration, require an explicit secure output destination.

### Exit codes

Publish and test a stable exit-code table. Minimum required distinctions:

| Exit code | Meaning                                                                                                        |
| --------: | -------------------------------------------------------------------------------------------------------------- |
|       `0` | Command completed; for read commands this means the requested reads completed, not that a transaction executed |
|       `2` | Invalid command, argument, configuration, or input schema                                                      |
|       `3` | Authentication/authorization or signer-membership failure                                                      |
|       `4` | Policy refusal or unsupported transaction; no signature/broadcast performed                                    |
|       `5` | RPC/API unavailable, chain mismatch, stale state, or inconsistent read                                         |
|       `6` | Required verifier/Safe threshold not met or approval expired                                                   |
|       `7` | Execution observed reverted or failed                                                                          |
|       `8` | Execution result unknown/pending after submission; reconcile by hash/nonce before retry                        |
|      `10` | Internal CLI error; include a redacted request ID for diagnosis                                                |

Exit codes supplement, but never replace, the shared decision enum and workflow status. They do not change protocol outcomes.

## 9. Key, signature, and privacy requirements

- Never accept private keys or seed phrases as ordinary positional arguments or flags.
- Never print, log, telemetry-capture, or attach private keys, seed phrases, raw signer-provider responses, or unredacted signatures to crash reports.
- Production signer interfaces must return signatures over the exact protocol digest and expose public signer identity/provider metadata for audit.
- Do not put production keys in `.env`, shell variables, frontend configuration, proposal files, policy files, or source control.
- Signature files and key files used by local development must have restrictive permissions, be non-overwriting by default, and be ignored by Git.
- Redact endpoint credentials, authorization headers, query tokens, RPC API keys, and signature bytes from all output.
- Keep signer operations separate: verifier attestation key, Safe owner key, relayer key, Registry administration key, and post-quantum experiment key are distinct roles. Never silently reuse one key across roles.
- Log command name, request ID, public target chain/address identifiers, and outcome only when configured; do not collect transaction payloads or personal identifiers by default.

## 10. Reliability and operations

- Use bounded retries only for idempotent reads. Do not retry signatures, attestation submissions, Registry writes, or Safe execution without checking idempotency key, proposal state, nonce, and transaction hash.
- Use request IDs and idempotency keys for mutating API calls. A timeout after a mutation is an ambiguous state that must be reconciled.
- SSE/event watch must reconnect using the last event ID, detect gaps, and refetch current proposal state before continuing.
- Validate the system clock and chain timestamp before computing attestation expiry; fail closed on excessive skew.
- Pin API schema, protocol version, Safe version, compiler/schema version, and decoder version in diagnostics.
- Support RPC rate limits and provider failures with explicit status, exponential backoff for reads, and cancellation. Never silently fall back to a different RPC/network.
- Provide a redacted `support bundle` containing version, profile summary, request IDs, selected health/context output, and diagnostic status. It must exclude secrets, signatures, and user transaction bytes unless the operator explicitly opts in after a preview.
- Production deployment must use durable proposal/event state, database migrations, encryption at rest, backup/restore, monitoring, access control, rate limiting, and tested incident response. The current in-memory store cannot be called production-ready.

## 11. Packaging and release requirements

- Publish a versioned CLI package with a lockfile and reproducible build instructions.
- Provide supported install instructions for the approved operating systems and Node runtime. If distributing binaries, publish checksums and signed provenance.
- Include a software bill of materials (SBOM), dependency/license inventory, vulnerability review, and release notes.
- Pin protocol/schema compatibility and refuse an incompatible major API/protocol version with an actionable error.
- Never embed API tokens, RPC keys, test private keys, or deployment secrets in a package or generated bundle.
- Document installation, profile setup, signer-provider setup, key rotation, incident recovery, RPC requirements, offline policy compilation, and uninstall/removal of local credentials.

## 12. Security and behavior test matrix

The implementation must add automated unit/integration tests for at least:

| Area           | Required checks                                                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI parser     | Prompt and one-shot equivalence, quoting, stdin JSON, help, unknown command, malformed flags, terminal/no-color modes, Fish/npm invocation examples                                                      |
| Config/profile | Invalid URL, wrong chain ID, wrong Safe/Registry/Guard, policy-hash mismatch, missing fields, endpoint credential redaction, atomic writes, permission checks                                            |
| Policy         | Schema, canonical order, known-answer policy hash, deny-all policy, cap boundaries, lint warnings/errors                                                                                                 |
| Decoder        | Raw fields only, extra label rejected, unknown selector fails closed, malformed calldata, target code/hash mismatch, operation rejection, exact decision/reason                                          |
| Signers        | Wrong role, inactive verifier, duplicate signer, altered digest, expired/future attestation, key provider failure, no secret in stdout/stderr/logs                                                       |
| Proposal watch | Disconnect/reconnect, duplicate event, missing event ID, sequence gap, API workflow versus chain log labels                                                                                              |
| Execution      | Wrong profile, stale nonce, mismatched policy/verifier set, no quorum, wrong Safe signature, confirmation mismatch, gas cap, timeout/reconciliation, reverted receipt, no automatic duplicate submission |
| Evidence       | Stable JSON schema, fixture ID mapping, real source fields only, null for unavailable data, reproducible export hash                                                                                     |
| Distribution   | Clean install, version/provenance, supported Node versions, dependency audit, no secret fixtures in package                                                                                              |

Foundry tests remain required for contract claims and fixture behaviors. CLI tests do not substitute for contract tests, human Solidity review, a second reviewer, or independent security audit.

## 13. Build sequence

Implement in this order so command UX does not outrun security boundaries:

1. Freeze this CLI spec and decide open production choices in `DECISIONS.md`.
2. Extract a shared typed command/API client with stable error and output schemas; preserve existing command names.
3. Implement profiles, target identity verification, config validation, redaction, structured output, and exit codes.
4. Replace in-memory-only assumptions with durable backend proposal/event interfaces and idempotent mutation semantics.
5. Add production signer-provider abstractions; keep raw test-key files in development mode only.
6. Harden `decode`, `proposal`, resumable `watch`, and conformance output against the locked API/protocol contracts.
7. Add confirmation and ambiguous-result reconciliation for `attest` and `execute`; prevent duplicate sends.
8. Add automated tests from §12 and capture actual outputs for the docs.
9. Package, sign, publish provenance/SBOM, and complete clean-install documentation.
10. Run threat review, dependency review, human review of security-critical changes, and an independent security review before any production claim.

## 14. Production acceptance gate

Do not describe the CLI or product as production-ready until all of these are true:

- All required commands and error/JSON contracts in this spec are implemented and tested.
- Production signer providers keep keys outside the CLI process or in an explicitly approved secure boundary; role separation and rotation are documented.
- Backend proposal/event storage is durable, multi-instance safe, authenticated, authorized, rate-limited, backed up, and recoverable.
- Chain/profile binding, policy hash, verifier set, Safe code/version, Guard, Registry, nonce, module set, and target code are rechecked before signatures and execution.
- All security-critical contract changes have human review and second review; contract behavior has reproducible Foundry evidence.
- End-to-end execution has been exercised on every supported target network with receipts and state diffs; local Anvil evidence is not represented as public-network evidence.
- Reverted, pending, ambiguous, unsupported, expired, and successful cases are separately handled and reported.
- Packaging, dependency provenance, threat review, incident response, key recovery/rotation, and user documentation are complete.
- No outstanding critical/high security findings remain without an explicitly accepted risk owner and mitigation.

Until then, label the current CLI **development prototype** and state its real network/execution status in README and demo materials.

## 15. Decisions to resolve before production implementation

Record selected options, owners, and deadlines in `DECISIONS.md` before implementing these boundaries:

| Decision                       | Recommended default                                                             | Why it needs a named owner                                             |
| ------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| CLI distribution               | Signed package release with provenance; binary only if reproducible             | Defines update trust and supported platforms                           |
| Production signer integration  | Company-managed HSM/KMS or dedicated signer service; no raw key file            | Defines custody boundary and authorization model                       |
| Backend tenancy/authentication | Company-operated isolated deployment with strong identity and role-based access | Defines data isolation and policy-administration authority             |
| Production network support     | Explicit allowlist per release; no arbitrary RPC endpoints for signing          | Limits chain-confusion and RPC substitution risk                       |
| Audit retention                | Organization-controlled durable event/evidence store with retention policy      | Defines incident response and privacy obligations                      |
| Policy activation              | Governed Safe/Registry transaction with multi-party approval                    | Prevents the CLI from turning a draft into active policy implicitly    |
| Support telemetry              | Opt-in, redacted diagnostics only                                               | Avoids exporting calldata or sensitive operational metadata by default |
