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
| D-018 | Development chain | Public testnet; local EVM | **Anvil local EVM (31337) remains the deterministic development/test chain — locked**. Sponsor evaluation also requires a separate Orchard Cyprus-1 deployment, tracked under D-033; never point the local-only deployment script at Quai | Demo owner | Before deployment manifest |
| D-019 | Frontend ownership | Assistant-created UI; owner Figma/UI | **Project owner handles complete UI — locked**. Docs specify only system states/data contracts | Project owner | Parallel to backend; no visual spec authored here |
| D-020 | Mock API | Wait for contracts; parallel mock server | **Parallel mock follows PROTOCOL.md API; replace with live adapter before final demo — locked** | App/integration owner + project owner | Contract shape before screens connect; label mock data in dev |
| D-021 | Verifier private keys | Browser/local service/independent process | **Never browser/coordinator; local verifier process with disposable keys — locked** | Verifier lead | Before first signature |
| D-022 | Safe dependency pin | Floating package; tag + resolved revision | **Use immutable v1.4.1 source/tag and record resolved revision — locked** | Build owner | Before dependency install |
| D-023 | Solidity compiler | Single compiler; auto-select multiple | **Local Foundry remains pinned to 0.8.28; the Orchard-specific build must use Solidity 0.8.19 with London EVM until the conflicting Quai documentation is reconciled. Safe dependency bytecode must be reviewed for compiler compatibility before deployment** | Contracts lead + reviewer | Before Orchard deployment |
| D-024 | Foundry version | Floating stable; fixed toolchain release | **Exact Foundry release/commit in toolchain file — pending environment selection** | Build owner | Before first Forge run |
| D-025 | Node and viem versions | Floating semver; exact patches | **Backend pins Node 24.22.1, Fastify 5.12.8, viem 2.58.0, npm 11.19.1 — selected; clean install and lockfile validation pending. Frontend pins remain owned by the existing UI scaffold** | App/integration owner | Before API/UI integration is called reproducible |
| D-026 | Fixture suite size | All candidates; arbitrary cuts; critical set + target 40 | **25 specified critical fixtures, 15 recommended; exact 40-entry catalog — locked** | Evidence owner | Before first report generation |
| D-027 | Team assignments | Role-only; named responsibilities | **3+ people, Solidity capability varies — assign capable author and second human reviewer by name** | Project lead | Kickoff / before contract code |
| D-028 | Visual palette / Figma direction | Define here; owner-managed Figma | **Out of scope for this repo spec — project owner decides and documents in Figma** | Project owner | No code-spec deadline |
| D-029 | Canonical intent and policy hash encoding | Canonical JSON hash; EIP-712 typed intent; ad hoc ABI packing | **EIP-712 `IntentV1` / `IntentAction` with the `IntentLockIntent` domain; policy hash commits to sorted native/ERC-20 recipient sets, native/ERC-20 caps, and sorted token address/runtime-code-hash pairs — locked in PROTOCOL.md** | Protocol + contracts leads | Share known-answer vectors before attestation signatures are used |
| D-030 | Policy authoring file and canonical compiler output | Hash JSON text; accept arbitrary UI rules; compile the locked `PolicyV1` fields | **Strict `intentlock.policy.v1` JSON with `schemaVersion: 1`, `native.maxTransferWei`, `native.allowedRecipients`, `erc20.maxTransferBaseUnits`, `erc20.allowedRecipients`, and `erc20.tokens[{address,runtimeCodeHash}]`. Amounts are decimal strings; addresses and hashes normalize lowercase; address lists and token/hash pairs sort numerically. Compiler emits ABI bytes for `(POLICY_TYPEHASH,uint32(1),maxNativeTransferWei,nativeRecipientSetHash,erc20TokenMapHash,erc20RecipientSetHash,maxErc20TransferBaseUnits)` and `keccak256(bytes)` as `policyHash`, exactly matching D-029 and the registry. UI/source-quote metadata is not in the hashed file or decision path. Empty allowlists and zero caps are valid deny-all settings.** | Protocol + backend leads | Before onboarding compiler/API; add cross-language known-answer vector before enabling registry policy updates |
| D-032 | Read-only Anvil mainnet fork replay exception | Synthetic local mock only; live broadcast; read-only Anvil mainnet fork | **Read-only Anvil mainnet fork — locked for Phase 7 Bybit replay**. Exception to CONTRACTS §7 strictly permitting read-only mainnet fork for replaying one public incident. Send RPC local Anvil (assert chainId 31337). Fork URL read-only. Nothing broadcast to real network. Replay fixtures are a separate "R" suite and not part of the 40-fixture denominators. | Contracts lead + demo owner | Phase 7 implementation |
| D-034 | Post-quantum verifier signatures | UI roadmap only; off-chain hybrid signature envelope; on-chain hybrid verification | **Implement an isolated off-chain hybrid verifier prototype**: ECDSA-secp256k1 over the existing EIP-712 attestation digest plus NIST ML-DSA-65 (FIPS 204) over the same digest with a fixed IntentLock context. The CLI can keygen, sign, and verify an envelope. This envelope is not submitted to the registry and does not gate execution; the existing on-chain path remains ECDSA-only. No Safe owner, registry admin, EIP-712 ABI, contract, decision enum, or fixture semantics change. | Backend lead + cryptography reviewer | Before presenting PQ signing; on-chain work requires a new decision and human contract review |
| D-035 | Orchard policy recipient address | Reuse local Anvil recipient; use a Cyprus-1-valid test recipient; deny all native transfers | **Use a fresh Cyprus-1-valid test recipient in `quai/policy.orchard.json`; retain the existing 100 QUAI cap and deny-all ERC-20 policy. This changes only the Orchard deployment’s policy value, not policy encoding or the local Anvil policy. Keep the recipient key in ignored local storage.** | Project lead + verifier lead | Before Orchard deployment and before issuing attestations |
| D-036 | Orchard deployment metadata transport | Upload compiler metadata to Quai IPFS before deploy; use the current Foundry + Quais deployment flow and verify through Quaiscan Standard JSON | **Use the current Quai Foundry workflow. For the pinned Quais SDK's 46-character `IPFSHash` guard, pass each actual CID extracted from that artifact's Solidity CBOR metadata; do not claim the metadata was uploaded. Record the CIDs in the deployment manifest and keep Quaiscan source verification pending until it is checked.** | Project lead + build owner | Before Orchard broadcast; re-open if the pinned SDK changes |
| D-037 | Safe proxy CREATE2 salt on Quai | Fixed salt nonce; grind salt until predicted proxy is valid in target zone | **Find a `SafeProxyFactory.createProxyWithNonce` salt nonce whose predicted proxy address is valid for Cyprus-1 and not a Qi address. Verify prediction before sending; record salt nonce and resulting proxy address in the manifest.** | Contracts lead + Quai integration owner | Before Safe proxy creation on Orchard |

## Safe source verification

The v1.4.1 source was inspected directly:

- [`Safe.sol`](https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/Safe.sol): builds hash with current nonce; increments nonce; verifies owner signatures; calls transaction guard with transaction fields, owner signatures, and sender.
- [`GuardManager.sol`](https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/base/GuardManager.sol): defines the transaction guard hook parameters.
- [`ModuleManager.sol`](https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/base/ModuleManager.sol): module execution validates module membership and directly executes; no transaction-guard callback.

These conclusions are version-specific. If D-002 changes, reopen D-003–D-016 and update all tests/claims before implementation continues.

## Change procedure

For each decision change, add the reason, affected interfaces/contracts/fixtures/docs, migration impact, and reviewer. Do not silently change an enum, hash field, Safe version, or policy default. Update [PROTOCOL.md](PROTOCOL.md), [CONTRACTS.md](CONTRACTS.md), [DECODER_AND_POLICY.md](DECODER_AND_POLICY.md), and [`fixtures/catalog.json`](fixtures/catalog.json) together where relevant.

### Change records

#### Correction 2026-11-20: Remove out-of-scope hybrid PQ implementation
- **Reason**: The locked brief keeps quantum features on the UI roadmap only. The Phase 5 stretch added registry/guard PQ behavior and Q01/Q02 outside that scope.
- **Changes**: Restored the four affected contracts to their pre-PQ versions; removed the PQ verifier contracts and test, fixtures, claims, dependency attribution, gas entries, and stale full-catalog report. D-026 remains an exact 40-fixture catalog.
- **Review**: This is a security-critical Solidity rollback. A human contracts reviewer must inspect the contract diff and rerun Foundry before treating the rollback as accepted.

#### Change 2026-11-20: D-032 Read-Only Mainnet Fork Replay Exception (Phase 7 Bybit Replay)
- **Reason**: Permit replaying the real Bybit Safe transaction `0x46deef0f52e3a983b67abf4714448a41dd7ffd6d32d32da69d62081c68ad7882` against real Safe proxies and attacker contracts on an isolated read-only local Anvil fork.
- **Affected interfaces/contracts**: Test contract `test/BybitReplaySlice.t.sol` (no changes to core production contracts `IntentLockGuard.sol` or `IntentLockRegistry.sol`).
- **Affected fixtures**: Replay fixtures `R01`, `R02`, `R03`, `R04` (separate "R" suite, isolated from 40-fixture catalog denominators).
- **Security & Network Boundary**:
  - `MAINNET_RPC_URL` is sourced exclusively from `.env.local` and never committed, logged, or exported.
  - Anvil fork is strictly read-only; send RPC enforces local chainId 31337. Zero transactions broadcast to public networks.
- **EIP-712 / Enum / Policy impact**: Zero changes to transaction hashing, EIP-712 struct fields, policy decision enum, or D-009 delegatecall policy.
- **Reviewer**: Contracts lead + human reviewer.

#### Change 2026-11-20: D-033 Orchard Cyprus-1 sponsor deployment path
- **Reason**: The hackathon organizer requires each project’s smart-contract component to be deployed on Quai. Preserve the existing Anvil workflow for deterministic tests while preparing a separate Orchard Cyprus-1 deployment path.
- **Affected interfaces/contracts**: No ABI, EIP-712, decision enum, guard rule, or policy semantics change. Add an Orchard build/deployment package that consumes the existing Foundry artifacts and the official `quais` SDK; keep `script/DeployLocal.s.sol` chain-31337-only. Contract pragmas must admit the Orchard compiler target.
- **Network boundary**: Orchard testnet only, chain ID 15000, official Cyprus-1 RPC. Preflight is read-only. Any deployment command requires a dedicated testnet wallet and an explicit broadcast gate. No deployment was authorized by this decision.
- **Compiler note**: The supplied participant guide/tutorial says Solidity 0.8.20, while the current Quai Solidity page says up to 0.8.19. Use 0.8.19 and London EVM as the conservative target until the organizer/Quai documentation discrepancy is resolved. The 0.8.19 build is separate from local Foundry’s 0.8.28 build.
- **Review**: Security-critical Solidity source/compiler changes require contract-owner review and a second human reviewer before deployment.

#### Change 2026-11-20: D-034 Off-chain hybrid verifier signature prototype
- **Reason**: The project owner changed the earlier UI-roadmap-only scope and selected an off-chain hybrid-signature prototype.
- **Affected interfaces**: Add a versioned CLI-only envelope binding the existing EIP-712 `IntentAttestation` digest to an ECDSA signature and an ML-DSA-65 signature. Pin the post-quantum library and keep both private keys in local-only files.
- **Explicit boundary**: The envelope is an experimental artifact. It is not accepted by the current API or registry, does not alter the guard's authorization rule, and provides no post-quantum protection to Safe owner signatures or chain execution. Solidity ABI, EIP-712 fields/domain, Safe version, policy decisions, and fixture outcomes remain unchanged.
- **Review**: Cryptographic implementation and key-handling require human review before use beyond local experimentation. On-chain PQ verification is not authorized by this decision.

#### Change 2026-11-21: D-035 Orchard-valid policy recipient
- **Reason**: The Orchard policy reused the local Anvil recipient `0x71c7656ec7ab88b098defb751b7401b5f6d8e4a1`, which the pinned Quais SDK does not recognize as a Cyprus-1 address. Deploying that policy would make the intended benign Orchard transfer unusable.
- **Changes**: Replace only `quai/policy.orchard.json`'s recipient with a fresh Cyprus-1-valid test address; retain the 100 QUAI native cap and deny-all ERC-20 policy. The local policy and compiler/hash semantics do not change. The recipient private key is stored only under ignored `quai/.local/`.
- **Review**: The resulting policy hash and recipient must be included in the pre-broadcast review. No Solidity behavior or ABI changed.

#### Change 2026-11-21: D-036 Foundry deployment metadata path
- **Reason**: Quai's IPFS metadata API timed out, while the current Quai Foundry guide documents deployment from Foundry artifacts through Quais and source verification via Solidity Standard JSON. The pinned Quais alpha SDK also rejects `ContractFactory.deploy()` unless a 46-character `IPFSHash` value is supplied, despite its optional-looking constructor argument.
- **Changes**: Use the authentic CID embedded in each compiled runtime bytecode's Solidity CBOR metadata to satisfy that SDK guard. Do not upload metadata or claim IPFS pinning. Record the compiler CIDs, deploy, then mark source verification complete only if Quaiscan's Standard JSON verification is actually performed.
- **Review**: No contract ABI or policy semantics change. Deployment remains Orchard-only with the explicit broadcast gate.

#### Change 2026-11-21: D-037 Quai-safe Safe proxy salt
- **Reason**: The first Orchard attempt mined the Safe singleton and proxy factory but `createProxyWithNonce(..., 1)` reverted with `Create2 call failed`. The predicted proxy for salt nonce 1 was not a valid Quai zone address.
- **Changes**: Compute the SafeProxy CREATE2 address locally from the exact factory, initializer, singleton, and SafeProxy creation bytecode; choose and record a salt nonce whose address resolves to Cyprus-1 and is not a Qi address. No Safe ABI or transaction semantics change.
- **Review**: Must verify the prediction against the emitted `ProxyCreation` address on Orchard after the retry.
