# Decoder and policy specification

## 1. Security objective

The decoder produces a bounded, reproducible interpretation of supported transaction types. It does not prove arbitrary contract behavior safe, and it is not the final execution authority. It feeds independent verifier decisions; the guard enforces the resulting signed commitment.

The decoder must prefer an explicit refusal over a plausible but ungrounded explanation. It must not use an LLM to determine actions, resolve ambiguity, or approve a transaction. AI may help phrase a summary after the deterministic structured result exists, but the original structured fields remain visible and hashed.

## 2. Input requirements

Required input is the complete Safe transaction context: chain ID, Safe address/version, nonce, destination, value, calldata, operation, and all digest-affecting Safe gas/refund fields. Decoder also reads target bytecode and relevant proxy implementation/storage state at an explicit block context. If state changes between verification and execution, refuse as unsupported or policy-denied unless the relevant code/state commitment is bound and checked on-chain. Do not route arbitrary changes through the one guard-replacement timelock.

Record source block number and block hash for all chain-derived facts. On Anvil, the block context is scripted. For a public chain extension, reorg and finality handling is additional required work.

## 3. Supported subset (initial prototype)

Keep the first supported set small and enumerate it in a versioned policy file. At minimum, aim to support:

1. Native token `CALL` transfer with empty calldata, explicit recipient and amount.
2. ERC-20 `transfer(address,uint256)` to an allowlisted token contract, with token metadata treated as display metadata rather than a security fact.
3. ERC-20 `approve(address,uint256)` only after a future explicit approval policy is specified; the current backend slice refuses every approval.
4. A narrowly defined benign fixture for an ordinary Safe-owned action if needed for the demo.
5. Explicit administrative calls needed to test guard/timelock self-protection, each with a structured action and high-risk classification.

The brief mentions swaps, permits, `setApprovalForAll`, proxy upgrades, ownership changes, and delegatecall as corpus categories. Do not claim these are safely decoded until each has a fully specified deterministic decoder, fixtures, and tests. Unsupported examples return `REFUSE_UNSUPPORTED` and map to workflow status `QUARANTINED`; they are not signed as understood. Known policy violations return `REFUSE_POLICY` and map to `REJECTED`.

## 4. Decode pipeline

1. **Validate envelope:** parse all fields and ensure chain, Safe address/version, nonce, operation, and byte lengths are valid.
2. **Compute canonical Safe digest:** use the pinned Safe implementation/domain. Cross-check against Safe library output.
3. **Resolve execution target:** retrieve code at the pinned block context; detect known proxy patterns only where implementation resolution is implemented and tested.
4. **Classify operation:** the initial policy unconditionally refuses every `DELEGATECALL` as `REFUSE_POLICY`. Do not create an attestation or timelock exception for it.
5. **Decode selector:** use locally pinned ABIs for known contracts. Optional signature databases/bytecode inference may provide hints, never an approval basis without a verified mapping and tested semantics.
6. **Normalize fields:** convert addresses to 20-byte values, amounts to base-unit integers, enums to canonical values, sort only fields whose order is semantically irrelevant, and preserve order where it matters.
7. **Derive effects:** emit concrete state/effect statements for the supported action. If important effect cannot be determined, mark ambiguous.
8. **Apply policy:** destination allowlist, amount caps, approval rules, operation restrictions, administrative action rules, timelock requirements, and verifier-set/policy version.
9. **Emit result:** supported + canonical intent + hash inputs, or `UNSUPPORTED`, `AMBIGUOUS`, `POLICY_DENIED`, or `INVALID`. Only `SUPPORTED` and policy-approved results can be attested.

## 5. Canonical output fields

Every decode result should include:

- `schemaVersion`, `decoderVersion`, `policyVersion` and their hashes.
- `decision`: exactly one of `ATTEST`, `ATTEST_WITH_TIMELOCK`, `REFUSE_UNSUPPORTED`, `REFUSE_POLICY` from [PROTOCOL.md](PROTOCOL.md).
- `status`: diagnostic decode state (`SUPPORTED`, `UNSUPPORTED`, `AMBIGUOUS`, `INVALID`); this is not the policy decision.
- `safeTxHash`, chain/Safe/nonce, target/value/data hash/operation.
- `actions[]`: action kind, target, asset, exact base-unit amount, counterparties, and expected effects.
- `riskClass` and stable reason codes.
- top-level `policyClass`, target bytecode hash (`targetCodeHash`), resolved implementation address/hash when applicable, and source block number/hash; include these same typed fields in the attestation so the guard can enforce them.
- canonical `intentHash` only when the result is complete and supported.
- human-readable summary derived from the structured fields, explicitly non-authoritative.

Do not put inferred symbol/name/decimals in the canonical hash unless verified and intentionally part of policy. UI can show them as supplemental metadata.

## 6. Policy classes

| Class | Example | Default decision |
|---|---|---|
| `STANDARD_TRANSFER` | Native/ERC-20 transfer within caps to allowed destination | Attest if all fields are supported and policy passes |
| `APPROVAL_LIMITED` | ERC-20 approval with bounded amount and approved spender | Attest only when explicit policy allows; show spender and amount |
| `APPROVAL_UNLIMITED` | Max uint allowance | `REFUSE_POLICY`; never label ordinary |
| `NFT_OPERATOR_APPROVAL` | `setApprovalForAll` | `REFUSE_POLICY` in initial policy |
| `PERMIT_OR_SIGNATURE_AUTH` | Permit-style authorization | `REFUSE_UNSUPPORTED` until full typed-data/nonce/expiry/spender semantics exist |
| `CONTRACT_INTERACTION` | Known method on a supported contract | Attest only for exact ABI/version, nonzero code hash, and effects model |
| `DELEGATECALL` | Safe delegatecall/MultiSend | Unconditional `REFUSE_POLICY`; guard independently hard-blocks operation |
| `PROXY_OR_IMPLEMENTATION_CHANGE` | Upgrade/admin slot or master-copy change | `REFUSE_POLICY` in initial policy |
| `SAFE_GUARD_REPLACEMENT` | `setGuard(nonzero allowlisted guard)` | Sole `ATTEST_WITH_TIMELOCK` action |
| `SAFE_ADMIN_CHANGE` | Guard removal, owners, threshold, modules, fallback handler | `REFUSE_POLICY` in initial policy |
| `UNKNOWN` | Unknown selector/ambiguous code/proxy | `REFUSE_UNSUPPORTED` and workflow `QUARANTINED` |

The implemented backend slice is narrower than the future policy table: it attests only allowlisted native transfers and allowlisted ERC-20 `transfer` calls. It refuses every `approve`, including bounded approvals, until a separate decision and fixture-backed policy explicitly enable that behavior.

A native transfer to an EOA legitimately has `targetCodeHash == 0`; this is not a missing-code error. An EOA used where a contract method is required is unsupported. Keep those cases distinct in the decoder and policy.

Policy defaults to `REFUSE_POLICY` on a known but unconfigured action and `REFUSE_UNSUPPORTED` when decoding is incomplete. Only the explicitly listed guard replacement may use `ATTEST_WITH_TIMELOCK`. Configuration updates are versioned and their hash is included in attestations.

## 7. Proxy code identity

The signed top-level `targetCodeHash` is checked against live `to.codehash` by the guard. That check detects target runtime-code changes but does not detect an implementation-slot change behind an unchanged proxy. For any proxy action allowed to attest, the policy must name an exact resolver adapter; the adapter reads the live implementation using a proxy-specific supported mechanism and compares the implementation address and `implementationCodeHash` against the signed attestation. If the implementation cannot be read on-chain by that adapter, return `REFUSE_UNSUPPORTED`. Do not trust an off-chain `implementation` field alone.

## 8. Semantic deception and policy

A decoder can correctly report “transfer 0.1 ETH to address X” while X is attacker-controlled. Decoding is not a risk oracle. Destination allowlists, value caps, verified asset lists, contract-specific policy, and human review are distinct policy checks. The result should distinguish “meaning decoded” from “policy approved.”

Contract behavior may depend on caller, block number, timestamp, storage, or external calls. A decoded method label is not a complete prediction of execution. Simulations can supplement review, but conditional or unmodeled behavior is unsupported or policy-denied. Only the explicitly configured guard replacement may be delayed through the timelock.

## 9. Unknown selector and external data policy

Signature databases and public ABI services can return incorrect, ambiguous, stale, or attacker-planted labels. Treat them as candidate metadata only. For attestable calls, use a pinned ABI/code hash mapping reviewed by the team or a formally bounded decoder rule. Record which source produced each field. If remote lookup is unavailable, do not silently fall back to a lower-confidence source and call the transaction verified.

## 10. Determinism and tests

For identical input, block context, code, ABI mappings, and policy, output bytes and `intentHash` must match exactly. Unit tests must include malformed calldata, short data, trailing bytes, integer/address boundary values, overloaded selectors, proxy implementation changes, unknown code, missing RPC data, and canonicalization edge cases. Fuzzing is useful for parsers and encoders; successful fuzzing does not replace explicit adversarial fixtures.
