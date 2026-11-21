# IntentLock documentation

This folder turns the project brief into an implementation reference. The Figma file is the source of truth for screen layout, styling, and visual assets; these documents define what the system must do, what information the interface needs, and how correctness is demonstrated.

## Start here

1. [Product and scope](PRODUCT.md) — user problem, outcomes, boundaries, and acceptance criteria.
2. [System architecture](ARCHITECTURE.md) — components, trust boundaries, and end-to-end flows.
3. [Protocol and data contracts](PROTOCOL.md) — transaction identity, canonical intent, EIP-712 attestations, API/event shapes.
4. [Smart-contract specification](CONTRACTS.md) — guard, registry, timelock, Safe integration, and contract-level behavior.
5. [Decoder and policy specification](DECODER_AND_POLICY.md) — supported transaction families, unknown-call handling, policy classes, and deterministic decoding.
6. [Threat model](THREAT_MODEL.md) — attacker capabilities, protections, residual risks, and explicit claims.
7. [Verification plan](VERIFICATION.md) — acceptance tests, adversarial fixtures, measurements, and evidence reporting.
8. [Demo and operations runbook](DEMO_RUNBOOK.md) — reproducible local demo, reset procedure, narration beats, and contingency steps.
9. [Scenario event contract](SCENES.md) — shared mock/live event envelope, UI state reduction, and evidence boundaries.
10. [Delivery plan](DELIVERY_PLAN.md) — dependency order, milestones, exit gates, and fallback decision.
11. [Decision register](DECISIONS.md) — defaults, owners, status, and lock criteria for unresolved technical choices.
12. [AI contributor instructions](../AGENTS.md) — repository-wide implementation and security rules.
13. [Pitch and judge Q&A](PITCH_AND_QA.md) — pitch outline mapped to the judging rubric.
14. [Claims register](CLAIMS_REGISTER.md) — public claims, sources, verification status, and safe wording.
15. [Setup skeleton](SETUP.md) — toolchain decisions and commands to complete as implementation lands.
16. [Fixture catalog](fixtures/catalog.json) and [schema](fixtures/catalog.schema.json) — machine-readable expected outcomes and criticality.
17. [Third-party notices](THIRD_PARTY.md) — candidate reference/reuse inventory and license checks.
18. [UI/backend integration prompt](UI_BACKEND_INTEGRATION_PROMPT.md) — copyable instructions for adapting the existing Figma UI without replacing its current work.
19. [Backend package](../backend/README.md) — local API endpoints, configuration, supported scope, and current integration limits.
20. [Quai Orchard integration](QUAI_ORCHARD.md) — sponsor network, isolated compiler/deployment path, key boundaries, and deployment evidence requirements.
21. [Production CLI build specification](CLI_PRODUCTION_SPEC.md) — target command UX, signer boundaries, execution safety, output contracts, reliability, packaging, testing, and production acceptance gates.

## Source and status

These documents specify IntentLock as a proof of concept using a local EVM for deterministic development, a Safe multisig, independent intent verifiers, and an on-chain guard. A separate Orchard Cyprus-1 path is required for sponsor evaluation and is tracked in [QUAI_ORCHARD.md](QUAI_ORCHARD.md). Safe hook/nonce/module details have been checked against Safe Smart Account `v1.4.1`; incident and product claims remain individually tracked in [CLAIMS_REGISTER.md](CLAIMS_REGISTER.md).

These are implementation specifications, not evidence that every feature is already implemented, audited, or production-safe. The current backend and CLI are development prototypes: proposal state is in memory, local Anvil behavior is separate from Orchard, and a full Orchard verifier-to-Safe execution has not been confirmed. The [production CLI specification](CLI_PRODUCTION_SPEC.md) defines a future target and is not proof that those requirements are implemented. Open design decisions are called out explicitly instead of being silently treated as settled facts.

## UI/Figma boundary

Figma owns the entire UI: visual composition, screen designs, interaction styling, color, responsive behavior, iconography, and animation. These specs define only system behavior and machine-readable information the UI may consume. Do not infer visual requirements from these documents; wire the supplied Figma implementation to the API/state contracts without changing security semantics.

## Scope rule

The primary project is IntentLock (B1). TRACE (B3) appears only as a contingency concept. Do not build TRACE in parallel unless the delivery-plan fallback gate is reached and the team explicitly changes the objective.
