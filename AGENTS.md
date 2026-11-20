# IntentLock contributor instructions

These instructions apply to AI coding agents and human contributors working in this repository.

## Sources of truth

1. [`docs/DECISIONS.md`](docs/DECISIONS.md) records locked architecture/policy choices.
2. [`docs/PROTOCOL.md`](docs/PROTOCOL.md), [`docs/CONTRACTS.md`](docs/CONTRACTS.md), [`docs/DECODER_AND_POLICY.md`](docs/DECODER_AND_POLICY.md), and [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) define security semantics.
3. [`docs/fixtures/catalog.json`](docs/fixtures/catalog.json) defines fixture IDs and expected outcomes.
4. The project owner's Figma files define the UI. Do not invent or modify visual design as part of unrelated implementation work.
5. The original root project brief provides context; where it conflicts with the updated version-pinned docs, the updated docs and decision register are authoritative.

## Required working rules

- Read the relevant existing files before editing. Make the smallest change that satisfies the task and preserve local conventions.
- Do not change transaction hashing, EIP-712 fields/domain, the shared decision enum, guard checks, Safe version, module restrictions, key boundaries, or fixture expected outcomes without updating the decision register and every dependent spec/test.
- Never hard-code real credentials or commit private keys. Demo keys must be disposable, local-only, and excluded from frontend bundles and logs.
- Do not call a system “working,” “verified,” or “passing” without actual reproducible evidence. When implementation is present and the user asks for verification (or the claim depends on test results), run `forge test` and report the exact result. Do not substitute AI review for tests or human security review.
- A human must read and understand every security-critical Solidity change. Require a second human review before treating a contract change as accepted.
- Fail closed on unknown selectors/proxies, absent verifier quorum, stale/mismatched attestations, code-hash/resolver failure, RPC inconsistency, and module/alternate paths not explicitly protected.
- Keep policy decisions distinct: `ATTEST`, `ATTEST_WITH_TIMELOCK`, `REFUSE_UNSUPPORTED`, `REFUSE_POLICY`. `QUARANTINED` and `REJECTED` are workflow statuses, not synonyms.
- Mock API/UI data is never chain evidence. Only receipts/state reads from the configured local chain and saved test output support execution claims.
- Reference fixture IDs in Foundry test names (for example, `test_A03_digestMismatch`) so test output maps directly to catalog/report rows.
- Do not build TRACE (B3) in parallel. It becomes primary only if the hour-12 gate in `docs/DELIVERY_PLAN.md` is reached and the project lead switches scope.
- Do not alter the project owner's UI/Figma decisions. Keep frontend work aligned to the published API/state contract.
- Quai sponsor work uses only the isolated Orchard Cyprus-1 target in [docs/QUAI_ORCHARD.md](docs/QUAI_ORCHARD.md). Keep Anvil keys and manifests separate; never broadcast unless a human explicitly approves the exact deployment after review. Anvil results are not Quai deployment evidence.

## Before completing a change

- Summarize files/behavior changed and why.
- State what was run and the actual result. If no tests or checks were run, say so clearly.
- Note any decision or claim that remains pending; never present a planned behavior as implemented.
