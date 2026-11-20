# IntentLock Execution Results Format & Evidence Tooling Guide

This document defines the schema, semantic rules, and CLI reporting tool for IntentLock verification runs, in accordance with `docs/TEAMMATE_TASK_BRIEF.md` and `docs/VERIFICATION.md`.

---

## 1. Overview and Core Principles

IntentLock verification compares actual test runs against the immutable fixture corpus in [`docs/fixtures/catalog.json`](../fixtures/catalog.json).

Key integrity principles:
1. **Catalog Immutability:** The source catalog is read-only. Tooling never mutates the catalog or fills observed outcomes from expected values.
2. **Expectation vs. Observation:** `expectedRevert` in the catalog is strictly an expectation. Runs record `observedRevert`. A fixture passes only when observed execution matches expected behavior and state-integrity assertions succeed.
3. **Synthetic vs. Chain Evidence:** Results marked with `"source": "synthetic"` are for demonstration, pipeline testing, and schema validation. Metric percentages and claims of benchmark success rates are suppressed for synthetic data. Real evidence requires `"source": "local-chain"` and references to concrete test artifacts/receipts.
4. **Denominators and Completeness:** Fixtures in the catalog that are not present in a run are reported separately as **Missing / Not Run**, never silently ignored or counted as passes or execution failures.

---

## 2. Results File Schema (`results.schema.json`)

The machine-readable results file is validated against [`docs/evidence/results.schema.json`](./results.schema.json).

### Top-Level Document Structure

| Field | Type | Required | Description |
|---|---|---|---|
| `schemaVersion` | integer | Yes | Must be `1`. |
| `runId` | string | Yes | Unique run identifier (e.g., `local-run-001`, `synthetic-smoke-001`). |
| `source` | string | Yes | Data source: `"synthetic"`, `"local-chain"`, `"ci"`, `"manual"`, or `"unit-test"`. |
| `commit` | string / null | No | Git commit hash of the tested repository state, or `null`. |
| `timestamp` | string | No | ISO 8601 timestamp of execution. |
| `environment` | object | No | Optional metadata describing host, chain, or environment. |
| `results` | array | Yes | Array of fixture result objects. |

### Per-Fixture Result Item

Each item in `results` represents the outcome of an individual fixture:

| Field | Type | Description / Valid Values |
|---|---|---|
| `fixtureId` | string | Matches pattern `^(B\|A\|D\|P\|H\|F)[0-9]{2}$` and exists in `catalog.json`. |
| `decision` | string | Verifier/policy decision: `"ATTEST"`, `"ATTEST_WITH_TIMELOCK"`, `"REFUSE_UNSUPPORTED"`, `"REFUSE_POLICY"`. |
| `workflowStatus` | string | Workflow status: `"AWAITING_THRESHOLD"`, `"APPROVED"`, `"TIMELOCK_PENDING"`, `"TIMELOCK_READY"`, `"QUARANTINED"`, `"REJECTED"`, `"EXECUTION_FAILED"`, `"EXECUTED"`, `"CANCELLED"`, `"EXPIRED"`. |
| `attemptedOnchain` | boolean | `true` if an on-chain Safe execution was attempted; `false` otherwise. |
| `observedRevert` | string / null | Specific error name if reverted on-chain (e.g. `"UnsupportedOperation"`, `"PolicyDenied"`, `"NoAttestation"`, `"GS104"`), or `null`. |
| `executionSucceeded` | boolean | `true` only if transaction executed and receipt succeeded. |
| `stateAssertionsPassed` | boolean | `true` if all post-state integrity assertions hold (vault balance, Safe nonce, proxy code). |
| `artifactRefs` | array[string] | File paths or URIs to logs, receipts, or traces supporting the execution claim. |

### Impossible Combinations & Validation Rules

The schema and CLI tool reject invalid state combinations:
- If `attemptedOnchain == false`: `observedRevert` must be `null` and `executionSucceeded` must be `false`.
- If `executionSucceeded == true`: `attemptedOnchain` must be `true`, `observedRevert` must be `null`, and `workflowStatus` cannot be `EXECUTION_FAILED`.
- If `observedRevert != null`: `executionSucceeded` must be `false`.
- Duplicate `fixtureId` entries in a single run are rejected.
- Any `fixtureId` not present in the catalog is rejected.

---

## 3. Sample Results Format

A minimal valid synthetic sample (`docs/evidence/sample-results.synthetic.json`):

```json
{
  "$schema": "./results.schema.json",
  "schemaVersion": 1,
  "runId": "synthetic-smoke-001",
  "source": "synthetic",
  "commit": null,
  "results": [
    {
      "fixtureId": "B01",
      "decision": "ATTEST",
      "workflowStatus": "EXECUTED",
      "attemptedOnchain": true,
      "observedRevert": null,
      "executionSucceeded": true,
      "stateAssertionsPassed": true,
      "artifactRefs": ["artifacts/synthetic/b01-receipt.json"]
    },
    {
      "fixtureId": "P01",
      "decision": "REFUSE_POLICY",
      "workflowStatus": "REJECTED",
      "attemptedOnchain": false,
      "observedRevert": null,
      "executionSucceeded": false,
      "stateAssertionsPassed": true,
      "artifactRefs": ["artifacts/synthetic/p01-decision.json"]
    },
    {
      "fixtureId": "A01",
      "decision": "REFUSE_POLICY",
      "workflowStatus": "EXECUTION_FAILED",
      "attemptedOnchain": true,
      "observedRevert": "UnsupportedOperation",
      "executionSucceeded": false,
      "stateAssertionsPassed": true,
      "artifactRefs": ["artifacts/synthetic/a01-guard-revert.json"]
    },
    {
      "fixtureId": "A15",
      "decision": "ATTEST",
      "workflowStatus": "AWAITING_THRESHOLD",
      "attemptedOnchain": false,
      "observedRevert": null,
      "executionSucceeded": false,
      "stateAssertionsPassed": true,
      "artifactRefs": []
    }
  ]
}
```

---

## 4. Evidence Report Generator (`scripts/report_fixtures.py`)

The report generator requires only Python 3 standard library.

### Basic Usage

```sh
# Generate human-readable terminal report
python scripts/report_fixtures.py docs/evidence/sample-results.synthetic.json

# Generate machine-readable JSON evidence artifact
python scripts/report_fixtures.py docs/evidence/sample-results.synthetic.json --output-json evidence/run-001-report.json

# Generate both terminal output and write JSON
python scripts/report_fixtures.py docs/evidence/sample-results.synthetic.json -o report.json --format both
```

### Command-Line Options

- `results_file` (or `-r`, `--results`): Path to actual-results JSON file (required).
- `-c`, `--catalog`: Path to catalog JSON (default: `docs/fixtures/catalog.json`).
- `-o`, `--output-json`: Path to write machine-readable evaluation report JSON.
- `--format {text,json,both}`: Output format sent to stdout (default: `text`).
- `-q`, `--quiet`: Suppress text table output on stdout.

### Exit Codes

- `0`: Valid results file evaluated and report generated successfully.
- `1`: Validation error (malformed JSON, duplicate fixture IDs, unknown fixture IDs, invalid enum values, or impossible result combinations).

---

## 5. Metrics and Reporting Categories

The report evaluates results across five dimensions:

1. **Outcome Classification:**
   - **Successful Receipt:** On-chain execution succeeded (`workflowStatus == "EXECUTED"`).
   - **Policy Refusal:** Verifiers refused proposal (`REFUSE_POLICY` or `REFUSE_UNSUPPORTED`).
   - **Insufficient Threshold:** Proposal did not reach verifier quorum (`AWAITING_THRESHOLD` or `ThresholdNotMet`/`NoAttestation`).
   - **Observed Guard/Safe Revert:** Guard or Safe reverted on-chain (e.g. `PolicyDenied`, `UnsupportedOperation`, `GS104`).
   - **Not Run / Missing:** Fixture was not attempted or omitted from results.

2. **Metrics Grouped by Catalog `kind`:**
   Counts and denominators are tracked strictly by `kind`:
   - `benign` (e.g. B01, B03, B04, B06, A07, H09)
   - `attack` (e.g. A01–A06, A08, A09, A13, A15, A16, A19, A20, D05, D06, P01–P04, H01–H06, H08, H10, H11)
   - `unknown` (e.g. D01–D04, P05)
   - `availability` (e.g. F01)

3. **Critical 25 Set Coverage:**
   Separately tracks progress across the 25 required critical fixtures defined in `docs/VERIFICATION.md`.
