# IntentLock decision register

Record changes here before changing protocol or contract semantics. “Default locked” means the implementation should follow the decision; a change needs a documented reason and updates to dependent specs and fixtures. “Pending” means a value still needs to be selected before implementation.

The team has 3+ people and Solidity capability varies. Assign named owners at kickoff; until then, owners below are role-based. Deadlines are relative to the first implementation commit or event clock because no calendar/event start was supplied.

| ID | Decision | Options considered | Default / status | Owner | Deadline / lock gate |
|---|---|---|---|---|---|
| D-001 | Primary hackathon problem | B1 IntentLock; B3 TRACE | **B1 IntentLock — locked** | Project lead | Already selected; change only at hour-12 fallback gate |
| D-002 | Safe integration | Real Safe; Safe-style mock only | **Real Safe Smart Account v1.4.1 — locked**; mocks only for isolated unit tests | Contracts lead + reviewer | Before Solidity scaffold; commit/artifact hashes go in manifest |
| D-003 | Guard attestations transport | Pre-submit to registry; bundle in guard call | **Pre-submit to registry — locked**. Hook includes owner `signatures`, no dedicated verifier-bundle parameter; do not invent a packed format | Protocol lead | Before registry ABI |
| D-004 | Safe nonce at guard hook | Read as-is; subtract one; custom pre-hook | **Subtract one — locked for Safe 1.4.1**. Safe hashes current nonce, increments, then calls guard | Contracts lead | A07 and digest vectors before integration |
| D-005 | Registry consumption authority | Any caller; submitter; guard only | **Guard-only consume — locked**. Public/relayed submission may be allowed, but only configured guard can consume | Contracts lead | Before registry implementation |
| D-006 | Policy decision vocabulary | Free-form labels; one shared enum | **Shared enum — locked**: `ATTEST`, `ATTEST_WITH_TIMELOCK`, `REFUSE_UNSUPPORTED`, `REFUSE_POLICY` | Protocol + decoder leads | Before API and fixture implementation |
| D-007 | Unsupported actions | Best-effort decode; refuse | **`REFUSE_UNSUPPORTED` → `QUARANTINED`, no signature — locked** | Decoder lead | Before verifier implementation |
| D-008 | Known policy violations | Generic quarantine; reject | **`REFUSE_POLICY` → `REJECTED`, no signature — locked** | Decoder lead | Before verifier implementation |
| D-009 | Delegatecall | Decode a subset; timelock; block | **Always hard-reject in guard — locked**; no attestation or timer can override | Contracts lead | First guard implementation |
| D-010 | High-risk action policy | Timelock all; reject all; narrow exception | **Reject all high-risk actions except one specific allowlisted, nonzero guard replacement with threshold + timelock — locked** | Contracts lead + project lead | Before policy constants/ABI |
| D-011 | Guard removal | Timelock removal; refuse removal | **Always refuse `setGuard(address(0))` — locked** | Contracts lead | H01 |
| D-012 | Timelocked action | Which specific high-risk action gets delay | **Only `SAFE_GUARD_REPLACEMENT`, nonzero allowlisted guard code hash — locked**. No generic arbitrary action scheduling | Contracts lead | Exact allowlisted code hash and delay set in deployment config before demo |
| D-013 | Timelock delay and attestation lifetime | Realistic multi-day; short demo delay | **Short, visible local-demo delay — default**; exact seconds pending. Attestation `validUntil` must be at or after `readyAt`; never represented as production policy | Demo owner + contracts lead | Before rehearsal |
| D-014 | Target code hash | Off-chain ABI/code lookup; on-chain code check | **Attestation includes top-level `targetCodeHash`; guard checks live `to.codehash` — locked** | Contracts lead | Before EIP-712 type hash |
| D-015 | Proxy implementation integrity | Trust off-chain lookup; implementation resolver; refuse proxies | **Only support proxy types with a tested on-chain resolver binding implementation address + code hash; otherwise refuse — locked** | Contracts + decoder leads | Before any proxy is attestable; D05 must exercise implementation mutation |
| D-016 | Safe modules | Allow modules; module guard; no modules | **Deploy with empty module set and refuse enablement — locked**. Safe 1.4.1 module execution bypasses the transaction guard | Contracts lead | Deployment check and H08 |
| D-017 | Verifier threshold | One; 2-of-3; configurable general | **2-of-3 for demo — locked**; threshold configurable in registry, but deployment asserts 2/3 | Verifier lead | Before e2e demo |
| D-018 | Chain | Public testnet; local EVM | **Anvil local EVM — locked for prototype** | Demo owner | Before deployment manifest |
| D-019 | Frontend ownership | Assistant-created UI; owner Figma/UI | **Project owner handles complete UI — locked**. Docs specify only system states/data contracts | Project owner | Parallel to backend; no visual spec authored here |
| D-020 | Mock API | Wait for contracts; parallel mock server | **Parallel mock follows PROTOCOL.md API; replace with live adapter before final demo — locked** | App/integration owner + project owner | Contract shape before screens connect; label mock data in dev |
| D-021 | Verifier private keys | Browser/local service/independent process | **Never browser/coordinator; local verifier process with disposable keys — locked** | Verifier lead | Before first signature |
| D-022 | Safe dependency pin | Floating package; tag + resolved revision | **Use immutable v1.4.1 source/tag and record resolved revision — locked** | Build owner | Before dependency install |
| D-023 | Solidity compiler | Single compiler; auto-select multiple | **Safe dependency builds with the release compiler; IntentLock compiler pin recorded separately in config/lockfile — pending exact repo setup** | Contracts lead | Before first compile |
| D-024 | Foundry version | Floating stable; fixed toolchain release | **Exact Foundry release/commit in toolchain file — pending environment selection** | Build owner | Before first Forge run |
| D-025 | Node and viem versions | Floating semver; exact patches | **Backend pins Node 24.22.1, Fastify 5.12.8, viem 2.58.0, npm 11.19.1 — selected; clean install and lockfile validation pending. Frontend pins remain owned by the existing UI scaffold** | App/integration owner | Before API/UI integration is called reproducible |
| D-026 | Fixture suite size | All candidates; arbitrary cuts; critical set + target 40 | **25 specified critical fixtures, 15 recommended; exact 40-entry catalog — locked** | Evidence owner | Before first report generation |
| D-027 | Team assignments | Role-only; named responsibilities | **3+ people, Solidity capability varies — assign capable author and second human reviewer by name** | Project lead | Kickoff / before contract code |
| D-028 | Visual palette / Figma direction | Define here; owner-managed Figma | **Out of scope for this repo spec — project owner decides and documents in Figma** | Project owner | No code-spec deadline |
| D-029 | Canonical intent and policy hash encoding | Canonical JSON hash; EIP-712 typed intent; ad hoc ABI packing | **EIP-712 `IntentV1` / `IntentAction` with the `IntentLockIntent` domain; policy hash is the typed ABI commitment to the sorted native recipient set and cap — locked in PROTOCOL.md** | Protocol + contracts leads | Share known-answer vectors before attestation signatures are used |

## Safe source verification

The v1.4.1 source was inspected directly:

- [`Safe.sol`](https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/Safe.sol): builds hash with current nonce; increments nonce; verifies owner signatures; calls transaction guard with transaction fields, owner signatures, and sender.
- [`GuardManager.sol`](https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/base/GuardManager.sol): defines the transaction guard hook parameters.
- [`ModuleManager.sol`](https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/base/ModuleManager.sol): module execution validates module membership and directly executes; no transaction-guard callback.

These conclusions are version-specific. If D-002 changes, reopen D-003–D-016 and update all tests/claims before implementation continues.

## Change procedure

For each decision change, add the reason, affected interfaces/contracts/fixtures/docs, migration impact, and reviewer. Do not silently change an enum, hash field, Safe version, or policy default. Update [PROTOCOL.md](PROTOCOL.md), [CONTRACTS.md](CONTRACTS.md), [DECODER_AND_POLICY.md](DECODER_AND_POLICY.md), and [`fixtures/catalog.json`](fixtures/catalog.json) together where relevant.
