# Delivery plan and build order

## 1. Planning assumptions

This plan assumes the selected project is B1 IntentLock, the first local backend/API slice is in place, the Safe contracts and execution adapter are not implemented yet, and the project owner is responsible for the complete UI/Figma implementation. The team has 3+ people and Solidity capability varies; assign a capable contract owner and a separate reviewer before contract implementation. It is ordered by dependency and risk, not calendar duration. The original brief's hour-12 fallback is preserved as an event-time gate.

## 2. Build sequence and exit criteria

### Phase 0 — Assign owners and prepare setup

Record the already selected defaults in [DECISIONS.md](DECISIONS.md): Safe 1.4.1, registry pre-submission, `nonce - 1` at the guard hook, canonical intent encoding, decision enum, strict proxy resolver behavior, no modules, unconditional delegatecall rejection, and one timelocked nonzero guard replacement. Confirm named owners, Solidity compiler/Foundry pins, and exact versions for the existing UI before integrating it. Backend Node/Fastify/viem pins are in `backend/package.json` and require clean-install confirmation.

**Exit:** digest and intent test vectors exist; dependencies are pinned; no unresolved choice affects contract interfaces.

### Phase 1 — Minimal on-chain vertical slice

Implement local deployment using actual Safe 1.4.1, registry, guard, one valid intent path, unconditional delegatecall rejection, and a separate CALL path that requires registry attestations. Implement the configured 2-of-3 verifier threshold from the first end-to-end slice; do not ship a demo mode that silently weakens the threshold. Build reset scripts immediately.

**Exit:** protected attack reverts and benign transfer succeeds in Foundry from clean state; relevant state assertions pass.

### Phase 2 — Deterministic decoder and verifier

Implement supported transaction subset and canonical intent hashing. Run verifier separately from the proposal client and sign EIP-712 attestations with local disposable keys. Unknown/ambiguous calls return no signature.

**Exit:** shared known-answer digest/intent vectors pass across TypeScript and Solidity; altered fields fail verification.

### Phase 3 — End-to-end attack and legitimate scenarios

Implement the baseline and protected demo fixtures, orchestrate verifier responses, Safe owner execution, receipt handling, and reproducible state snapshots.

**Exit:** three-minute narrative is backed by chain receipts and actual process outputs; reset/replay is deterministic.

### Parallel UI track — owner-led

The project owner may implement the Figma UI in parallel against a mock service that follows [PROTOCOL.md](PROTOCOL.md) §7. The mock must produce contract-shaped statuses and payloads but must be visibly marked as mock/demo data in development. Keep the backend adapter boundary stable so the owner can switch from mock to the live service without changing screen semantics. UI progress is independent of contract progress and must never be reported as chain evidence.

**Exit:** Figma UI is wired to live API/RPC state for the final demo; every execution claim reconciles to a real local-chain receipt. All visual decisions remain with the project owner.

### Phase 4 — Timelock and policy hardening

Harden the 2-of-3 verifier path with freshness/replay defenses and policy-version binding; finish guard self-protection, module restrictions, proxy resolver checks, and the sole allowlisted nonzero guard-replacement timelock.

**Exit:** required attack matrix passes; no module/alternate path is claimed protected without a corresponding test against the pinned implementation.

### Phase 5 — Evidence and rehearsal

Complete a meaningful corpus (target about 40 fixtures), measure metrics, generate report, rehearse clean startup and reset, verify factual pitch claims, and record backup video.

**Exit:** all report values are generated from actual test output, limitations are stated, and demo remains stable through repeated clean runs.

## 3. Hour-12 fallback gate

At the event's hour 12, evaluate only the critical vertical slice:

- Protected deceptive transaction is rejected by the guard in scripted Anvil state.
- Legitimate supported transfer succeeds.
- Both outcomes are repeatable from clean reset, with correct state assertions.
- No execution route used in the demo bypasses the guard.

If any of those fail repeatedly and cannot be fixed within the gate, switch the project/demo to TRACE (B3) as described in the source brief. A fallback switch should include a fresh, explicit scope and evidence plan; it is not permission to imply TRACE exists before it is built. If the gate passes, continue IntentLock and spend remaining time on threshold, self-protection, evidence, and polish in that order.

## 4. Role-based ownership

| Role | Owns | Must review |
|---|---|---|
| Protocol/contracts engineer | Guard, registry, timelock, Safe integration, Foundry fixtures | All contract changes and digest/hook assumptions; another human reviews each security-critical Solidity change |
| Decoder/verifier engineer | Decoder, canonical schema, policy, EIP-712 signatures | Hash vectors and unknown-call behavior |
| App/integration engineer | Coordinator/RPC, API compatibility, status reconciliation | UI never becoming trust authority; project owner owns the Figma implementation |
| Evidence/demo owner | Fixtures/report, reset script, rehearsal, backup recording | Metrics, denominators, stated claims |

The team has 3+ people; assign each role to a named person during Phase 0. Solidity capability varies, so do not assign contract authorship to someone who cannot explain the final code. Security-critical Solidity changes need a second human review. If capacity is limited, delay optional features rather than dropping review.

## 5. Defer until core is stable

- Browser extension or third-party wallet integrations.
- Support for arbitrary ABI/contract decoding.
- Public-chain deployment.
- Offline QR hash checker.
- Globe/3D effects or complex visual polish (Figma decides final visual direction).
- TRACE implementation unless fallback gate is triggered.
- Product comparisons and novelty claims that have not been independently checked.

## 6. Definition of done

IntentLock is ready for the hackathon demonstration when implementation matches the acceptance criteria in [PRODUCT.md](PRODUCT.md), contract and decoder behavior meet their respective specifications, critical tests in [VERIFICATION.md](VERIFICATION.md) pass, the runbook works from a clean checkout/environment, and every public claim is bounded by observed evidence.
