# Teammate task brief: setup and evidence tooling

**Owner:** Teammate / their coding AI  
**Project lead:** IntentLock owner  
**Priority:** Useful parallel work while the project lead handles Figma and the contract vertical slice  
**Risk level:** Low, provided the security boundaries below are followed

## Goal

Prepare the repeatable developer setup and a small fixture evidence tool. This gives the team a clean way to start the project and report actual results without changing Solidity policy or deciding what the guard should allow.

The repository now has an initial local backend/API slice. The Safe contracts, registry submission, Safe execution adapter, and UI connection are still pending. Treat every specified behavior as a requirement, not proof that the full behavior exists.

## Workstream A — Foundry setup record

Read [SETUP.md](SETUP.md), [DECISIONS.md](DECISIONS.md), [PROTOCOL.md](PROTOCOL.md), [CONTRACTS.md](CONTRACTS.md), and the root [AGENTS.md](../AGENTS.md) before editing.

1. Check the available development environment and determine the exact Foundry and `solc` versions needed for the first IntentLock contract scaffold. Do not change the already pinned backend Node/Fastify/viem versions without coordinating with the project lead.
2. Record the versions and reproducible install/check commands in `docs/SETUP.md`; record the same pins in the appropriate project configuration once that scaffold exists.
3. Keep Safe 1.4.1's release compiler (`solc 0.7.6`) distinct from the compiler selected for IntentLock contracts. Do not change the pinned Safe version.
4. Do not guess frontend Node.js, viem, package-manager, or application versions. Backend versions are already in `backend/package.json`; leave frontend entries pending until the existing UI's app manifest and a clean install are available.
5. Do not choose the timelock delay or alter policy decisions; those belong to the project lead and contract owner.

**Deliverable:** A setup section that another teammate can follow and that reports versions actually observed or installed. If there is not yet enough scaffold to verify a command, label it as pending instead of claiming it passed.

## Workstream B — Fixture validation and report generator

Implement a small command-line tool, preferably with the Python standard library so it does not depend on the unfinished app stack. Suggested location: `scripts/report_fixtures.py`. Add a short usage guide at `docs/evidence/RESULTS_FORMAT.md` and a JSON Schema for actual run results at `docs/evidence/results.schema.json`.

The tool should:

1. Read the source catalog at `docs/fixtures/catalog.json` and the machine-readable actual-results file supplied as a command-line argument.
2. Require a unique result row for each reported fixture ID, reject unknown IDs, and report catalog fixtures missing from the run separately from failures.
3. Compare actual outcome fields with the catalog without editing or regenerating the catalog. At minimum, retain separate values for `decision`, `workflowStatus`, `attemptedOnchain`, `expectedRevert`, `observedRevert`, execution success, and state-integrity assertions.
4. Report counts by `kind` (`benign`, `attack`, `unknown`, `availability`) and policy `decision`. Report observed guard/Safe reverts separately from policy refusals.
5. Treat `expectedRevert` as an expectation only. A fixture passes only when the actual observed result matches the expected behavior; never fill `observedRevert` from the catalog.
6. Produce a concise human-readable summary and a machine-readable JSON report suitable for attaching to an evidence run.
7. Clearly mark sample results as synthetic. Synthetic sample output must not be described as chain evidence or included in project performance metrics.

The actual-results schema should identify the run and source, for example:

```json
{
  "schemaVersion": 1,
  "runId": "local-run-001",
  "source": "synthetic",
  "commit": null,
  "results": [
    {
      "fixtureId": "A20",
      "decision": "ATTEST",
      "workflowStatus": "EXECUTION_FAILED",
      "attemptedOnchain": true,
      "observedRevert": "NoAttestation",
      "executionSucceeded": false,
      "stateAssertionsPassed": true,
      "artifactRefs": []
    }
  ]
}
```

For actual chain runs, `source` must identify that the result came from the configured local chain and the artifact references must point to real test output/receipts. Missing evidence is “not run” or “unknown,” never an inferred pass.

**Deliverables:** The report script, results schema, format guide, and one synthetic sample input that exercises at least a success, a policy refusal, a guard revert, an unattempted fixture, and a missing fixture.

## Boundaries and file ownership

The teammate may edit:

- `docs/SETUP.md`, limited to toolchain setup facts and commands.
- `scripts/report_fixtures.py`.
- `docs/evidence/RESULTS_FORMAT.md`.
- `docs/evidence/results.schema.json`.
- `docs/evidence/sample-results.synthetic.json`.

Do not edit:

- `docs/fixtures/catalog.json` or `docs/fixtures/catalog.schema.json` expected outcomes.
- `docs/PROTOCOL.md`, `docs/CONTRACTS.md`, `docs/DECODER_AND_POLICY.md`, or `docs/DECISIONS.md` security semantics.
- Solidity contract behavior, EIP-712 fields, Safe hook/nonce assumptions, verifier thresholds, timelock rules, or fixture criticality.
- Figma designs, visual styling, UI components, or mock/real evidence labels.

If implementation reveals a spec conflict, write a short finding with the affected document and fixture ID and ask the project lead to decide. Do not resolve security semantics by changing the catalog or contract spec unilaterally.

## Acceptance checklist

- A new teammate can follow the verified setup instructions from a clean checkout, or every unverified step is clearly marked pending.
- The tool fails clearly on malformed JSON, duplicate result IDs, unknown IDs, invalid enum values, and impossible result combinations.
- The report distinguishes “not run,” policy refusal, insufficient verifier threshold, observed guard/Safe revert, and successful receipt.
- Metrics use the catalog `kind`; category and policy `decision` are not substituted for that grouping.
- The report shows denominators and never claims a success rate from synthetic sample data.
- The tool does not mutate the source catalog or fill in actual outcomes from expected fields.
- No keys, credentials, real private material, or unrelated workspace files are added.
- Before handoff, provide changed-file list, exact commands run and results, known limitations, and any spec questions. Do not push directly to `main`; give the project lead a reviewable diff first.

## Suggested task sequence

1. Confirm the exact assigned file list with the project lead.
2. Record the setup facts first; do not block the evidence utility on Node or frontend dependencies.
3. Define the results schema, then implement the report command against that schema.
4. Create explicitly synthetic sample rows and run the command against them.
5. Compare report labels and denominators with [VERIFICATION.md](VERIFICATION.md) and fixture IDs with the catalog.
6. Send the project lead the diff and a short handoff note. Wait for review before broadening scope.

## Copy/paste instruction for the teammate's AI

> Work only on the “Teammate task brief: setup and evidence tooling” in `docs/TEAMMATE_TASK_BRIEF.md`. First read the linked project docs and inspect the existing repository. Keep your changes within the allowed files listed in the brief. Implement the Foundry setup record only from versions and commands you actually verify. Then build the fixture results schema and report tool described there. Keep expected policy decisions, expected reverts, and observed execution outcomes separate. Do not change contract/security semantics, fixture expectations, criticality, or UI/Figma. Do not push to `main`; return a reviewable diff, exact commands/results, and open questions to the project lead.
