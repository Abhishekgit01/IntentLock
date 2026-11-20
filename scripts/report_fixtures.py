#!/usr/bin/env python3
"""
scripts/report_fixtures.py - IntentLock Fixture Validation and Evidence Reporter

Reads the canonical fixture catalog (`docs/fixtures/catalog.json`) and an actual
execution results file, validates schema and semantic constraints, compares observed
outcomes against expected catalog behaviors, and produces both human-readable
and machine-readable evidence reports.

Conforms to docs/TEAMMATE_TASK_BRIEF.md, docs/VERIFICATION.md, and docs/evidence/results.schema.json.
Uses only the Python standard library.
"""

import argparse
import datetime
import json
import os
import re
import sys
from typing import Any, Dict, List, Optional, Set, Tuple


# Allowed enums matching catalog and results schemas
VALID_DECISIONS = {
    "ATTEST",
    "ATTEST_WITH_TIMELOCK",
    "REFUSE_UNSUPPORTED",
    "REFUSE_POLICY",
}

VALID_WORKFLOW_STATUSES = {
    "AWAITING_THRESHOLD",
    "APPROVED",
    "TIMELOCK_PENDING",
    "TIMELOCK_READY",
    "QUARANTINED",
    "REJECTED",
    "EXECUTION_FAILED",
    "EXECUTED",
    "CANCELLED",
    "EXPIRED",
}

VALID_REVERTS = {
    "NoAttestation",
    "WrongSafe",
    "WrongChain",
    "WrongNonce",
    "DigestMismatch",
    "IntentMismatch",
    "ThresholdNotMet",
    "Expired",
    "AlreadyConsumed",
    "PolicyDenied",
    "TimelockNotReady",
    "TimelockCancelled",
    "UnsupportedOperation",
    "TargetCodeHashMismatch",
    "ImplementationMismatch",
    "WrongPolicyClass",
    "RegistryUnavailable",
    "OnlyGuard",
    "InvalidSignature",
    "InvalidVerifierSet",
    "GS104",
    None,
}

FIXTURE_ID_REGEX = re.compile(r"^(B|A|D|P|H|F)[0-9]{2}$")


class ValidationError(Exception):
    """Raised when the actual-results file fails schema or consistency checks."""
    pass


def load_json_file(file_path: str, description: str) -> Any:
    """Load and parse a JSON file, giving a clear error message on malformed JSON."""
    if not os.path.isfile(file_path):
        raise ValidationError(f"File not found ({description}): {file_path}")
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as exc:
        raise ValidationError(
            f"Malformed JSON in {description} ({file_path}) at line {exc.lineno}, column {exc.colno}: {exc.msg}"
        ) from exc
    except Exception as exc:
        raise ValidationError(f"Unable to read {description} ({file_path}): {exc}") from exc


def validate_catalog(catalog_data: Any, catalog_path: str) -> Dict[str, Dict[str, Any]]:
    """Validate structure of catalog.json and return dictionary keyed by fixture ID."""
    if not isinstance(catalog_data, dict):
        raise ValidationError(f"Catalog {catalog_path} must be a JSON object")
    if "fixtures" not in catalog_data or not isinstance(catalog_data["fixtures"], list):
        raise ValidationError(f"Catalog {catalog_path} missing 'fixtures' array")

    catalog_fixtures: Dict[str, Dict[str, Any]] = {}
    for idx, item in enumerate(catalog_data["fixtures"]):
        if not isinstance(item, dict):
            raise ValidationError(f"Catalog fixture #{idx} is not an object")
        fid = item.get("id")
        if not fid or not isinstance(fid, str):
            raise ValidationError(f"Catalog fixture #{idx} missing valid 'id'")
        if fid in catalog_fixtures:
            raise ValidationError(f"Duplicate fixture ID '{fid}' in catalog")
        catalog_fixtures[fid] = item

    return catalog_fixtures


def validate_results_data(
    results_data: Any,
    catalog_fixtures: Dict[str, Dict[str, Any]],
    results_path: str,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Validate actual-results JSON structure, checking:
    - Required root fields (schemaVersion, runId, source, results)
    - Unique fixture IDs (reject duplicates)
    - Unknown fixture IDs (reject IDs not in catalog)
    - Enums and impossible result combinations
    """
    if not isinstance(results_data, dict):
        raise ValidationError(f"Results file {results_path} must be a JSON object")

    # Required top-level fields
    for field in ("schemaVersion", "runId", "source", "results"):
        if field not in results_data:
            raise ValidationError(f"Results file {results_path} missing required root field '{field}'")

    if results_data["schemaVersion"] != 1:
        raise ValidationError(
            f"Unsupported schemaVersion {results_data['schemaVersion']}; expected 1"
        )

    if not isinstance(results_data["results"], list):
        raise ValidationError(f"Field 'results' in {results_path} must be an array")

    seen_ids: Set[str] = set()
    validated_rows: List[Dict[str, Any]] = []

    for idx, row in enumerate(results_data["results"]):
        if not isinstance(row, dict):
            raise ValidationError(f"Result entry #{idx} is not an object")

        # Check required row keys
        required_keys = (
            "fixtureId",
            "decision",
            "workflowStatus",
            "attemptedOnchain",
            "observedRevert",
            "executionSucceeded",
            "stateAssertionsPassed",
            "artifactRefs",
        )
        for rk in required_keys:
            if rk not in row:
                raise ValidationError(f"Result entry #{idx} missing required field '{rk}'")

        fid = row["fixtureId"]
        if not isinstance(fid, str) or not FIXTURE_ID_REGEX.match(fid):
            raise ValidationError(f"Result entry #{idx} has invalid fixtureId '{fid}'")

        # Requirement 2: Reject duplicate IDs
        if fid in seen_ids:
            raise ValidationError(f"Duplicate result row for fixture ID '{fid}'")
        seen_ids.add(fid)

        # Requirement 2: Reject unknown IDs
        if fid not in catalog_fixtures:
            raise ValidationError(f"Unknown fixture ID '{fid}' reported (not present in catalog)")

        # Enum validations
        decision = row["decision"]
        if decision not in VALID_DECISIONS:
            raise ValidationError(
                f"Invalid decision '{decision}' for fixture {fid}; must be one of {sorted(VALID_DECISIONS)}"
            )

        workflow_status = row["workflowStatus"]
        if workflow_status not in VALID_WORKFLOW_STATUSES:
            raise ValidationError(
                f"Invalid workflowStatus '{workflow_status}' for fixture {fid}; must be one of {sorted(VALID_WORKFLOW_STATUSES)}"
            )

        observed_revert = row["observedRevert"]
        if observed_revert not in VALID_REVERTS:
            raise ValidationError(
                f"Invalid observedRevert '{observed_revert}' for fixture {fid}; not in allowed revert set"
            )

        attempted_onchain = row["attemptedOnchain"]
        if not isinstance(attempted_onchain, bool):
            raise ValidationError(f"'attemptedOnchain' for fixture {fid} must be a boolean")

        execution_succeeded = row["executionSucceeded"]
        if not isinstance(execution_succeeded, bool):
            raise ValidationError(f"'executionSucceeded' for fixture {fid} must be a boolean")

        state_assertions_passed = row["stateAssertionsPassed"]
        if not isinstance(state_assertions_passed, bool):
            raise ValidationError(f"'stateAssertionsPassed' for fixture {fid} must be a boolean")

        artifact_refs = row["artifactRefs"]
        if not isinstance(artifact_refs, list):
            raise ValidationError(f"'artifactRefs' for fixture {fid} must be an array")

        # Impossible combinations validation
        # 1. attemptedOnchain == False cannot have observedRevert or executionSucceeded
        if not attempted_onchain:
            if observed_revert is not None:
                raise ValidationError(
                    f"Impossible combination for fixture {fid}: attemptedOnchain is False but observedRevert is '{observed_revert}'"
                )
            if execution_succeeded:
                raise ValidationError(
                    f"Impossible combination for fixture {fid}: attemptedOnchain is False but executionSucceeded is True"
                )

        # 2. executionSucceeded == True cannot revert
        if execution_succeeded:
            if observed_revert is not None:
                raise ValidationError(
                    f"Impossible combination for fixture {fid}: executionSucceeded is True but observedRevert is '{observed_revert}'"
                )
            if workflow_status == "EXECUTION_FAILED":
                raise ValidationError(
                    f"Impossible combination for fixture {fid}: executionSucceeded is True but workflowStatus is 'EXECUTION_FAILED'"
                )

        # 3. executionSucceeded == False cannot have EXECUTED status
        if not execution_succeeded and workflow_status == "EXECUTED":
            raise ValidationError(
                f"Impossible combination for fixture {fid}: executionSucceeded is False but workflowStatus is 'EXECUTED'"
            )

        # 4. On-chain attempt that failed execution must report an observedRevert
        if attempted_onchain and not execution_succeeded and observed_revert is None:
            raise ValidationError(
                f"Impossible combination for fixture {fid}: attemptedOnchain is True and execution failed, but observedRevert is null"
            )

        validated_rows.append(row)

    return results_data, validated_rows


def evaluate_fixture_result(
    cat_fix: Dict[str, Any],
    res_fix: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Compare actual observed result against catalog expectations without mutating the catalog.
    Treats expectedRevert strictly as an expectation.
    """
    fid = cat_fix["id"]
    exp_decision = cat_fix["decision"]
    exp_status = cat_fix["workflowStatus"]
    exp_attempted = cat_fix["attemptedOnchain"]
    exp_succeeds = cat_fix["executionSucceeds"]
    exp_revert = cat_fix.get("expectedRevert")

    act_decision = res_fix["decision"]
    act_status = res_fix["workflowStatus"]
    act_attempted = res_fix["attemptedOnchain"]
    act_succeeded = res_fix["executionSucceeded"]
    act_revert = res_fix["observedRevert"]
    act_assertions = res_fix["stateAssertionsPassed"]

    mismatches: List[str] = []

    if act_decision != exp_decision:
        mismatches.append(f"decision mismatch: expected '{exp_decision}', observed '{act_decision}'")
    if act_status != exp_status:
        mismatches.append(f"workflowStatus mismatch: expected '{exp_status}', observed '{act_status}'")
    if act_attempted != exp_attempted:
        mismatches.append(f"attemptedOnchain mismatch: expected {exp_attempted}, observed {act_attempted}")
    if act_succeeded != exp_succeeds:
        mismatches.append(f"executionSucceeded mismatch: expected {exp_succeeds}, observed {act_succeeded}")
    if act_revert != exp_revert:
        mismatches.append(f"revert mismatch: expected '{exp_revert}', observed '{act_revert}'")
    if not act_assertions:
        mismatches.append("state-integrity assertions failed")

    passed = len(mismatches) == 0

    return {
        "fixtureId": fid,
        "critical": cat_fix.get("critical", False),
        "kind": cat_fix["kind"],
        "category": cat_fix["category"],
        "title": cat_fix["title"],
        "passed": passed,
        "mismatches": mismatches,
        "expected": {
            "decision": exp_decision,
            "workflowStatus": exp_status,
            "attemptedOnchain": exp_attempted,
            "executionSucceeds": exp_succeeds,
            "expectedRevert": exp_revert,
        },
        "actual": {
            "decision": act_decision,
            "workflowStatus": act_status,
            "attemptedOnchain": act_attempted,
            "executionSucceeded": act_succeeded,
            "observedRevert": act_revert,
            "stateAssertionsPassed": act_assertions,
            "artifactRefs": res_fix.get("artifactRefs", []),
        },
    }


def categorize_execution(res_fix: Dict[str, Any]) -> str:
    """
    Distinguishes outcome class:
    - 'successful_receipt'
    - 'policy_refusal'
    - 'insufficient_threshold'
    - 'observed_guard_safe_revert'
    - 'unattempted'
    """
    act_attempted = res_fix["attemptedOnchain"]
    act_succeeded = res_fix["executionSucceeded"]
    act_status = res_fix["workflowStatus"]
    act_revert = res_fix["observedRevert"]
    act_decision = res_fix["decision"]

    if act_attempted and act_succeeded and act_status == "EXECUTED":
        return "successful_receipt"
    if act_status == "AWAITING_THRESHOLD" or act_revert in ("ThresholdNotMet", "NoAttestation"):
        return "insufficient_threshold"
    if act_attempted and act_revert is not None:
        return "observed_guard_safe_revert"
    if act_decision in ("REFUSE_POLICY", "REFUSE_UNSUPPORTED"):
        return "policy_refusal"
    return "unattempted"


def generate_report(
    catalog_fixtures: Dict[str, Dict[str, Any]],
    results_meta: Dict[str, Any],
    results_rows: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Aggregate statistics, per-kind counts, decisions, and outcomes."""
    evaluated_fixtures: List[Dict[str, Any]] = []
    reported_ids: Set[str] = set()

    for row in results_rows:
        fid = row["fixtureId"]
        reported_ids.add(fid)
        cat_fix = catalog_fixtures[fid]
        eval_res = evaluate_fixture_result(cat_fix, row)
        eval_res["executionCategory"] = categorize_execution(row)
        evaluated_fixtures.append(eval_res)

    # Separate catalog fixtures missing from the run
    missing_ids = [fid for fid in catalog_fixtures if fid not in reported_ids]
    missing_fixtures: List[Dict[str, Any]] = [
        {
            "fixtureId": fid,
            "critical": catalog_fixtures[fid].get("critical", False),
            "kind": catalog_fixtures[fid]["kind"],
            "category": catalog_fixtures[fid]["category"],
            "title": catalog_fixtures[fid]["title"],
            "expectedDecision": catalog_fixtures[fid]["decision"],
            "expectedStatus": catalog_fixtures[fid]["workflowStatus"],
            "expectedRevert": catalog_fixtures[fid].get("expectedRevert"),
        }
        for fid in missing_ids
    ]

    total_catalog = len(catalog_fixtures)
    total_reported = len(evaluated_fixtures)
    total_missing = len(missing_fixtures)
    total_passed = sum(1 for f in evaluated_fixtures if f["passed"])
    total_failed = total_reported - total_passed

    is_synthetic = results_meta.get("source") == "synthetic"

    # Aggregations by kind (benign, attack, unknown, availability)
    kinds = ["benign", "attack", "unknown", "availability"]
    counts_by_kind: Dict[str, Dict[str, int]] = {
        k: {"catalogTotal": 0, "reported": 0, "passed": 0, "failed": 0, "missing": 0}
        for k in kinds
    }
    for cat_fix in catalog_fixtures.values():
        k = cat_fix["kind"]
        if k in counts_by_kind:
            counts_by_kind[k]["catalogTotal"] += 1
            if cat_fix["id"] not in reported_ids:
                counts_by_kind[k]["missing"] += 1

    for ef in evaluated_fixtures:
        k = ef["kind"]
        if k in counts_by_kind:
            counts_by_kind[k]["reported"] += 1
            if ef["passed"]:
                counts_by_kind[k]["passed"] += 1
            else:
                counts_by_kind[k]["failed"] += 1

    # Aggregations by actual policy decision
    counts_by_decision: Dict[str, int] = {d: 0 for d in sorted(VALID_DECISIONS)}
    for row in results_rows:
        counts_by_decision[row["decision"]] += 1

    # Aggregations by execution category
    counts_by_execution_category: Dict[str, int] = {
        "successful_receipt": 0,
        "policy_refusal": 0,
        "insufficient_threshold": 0,
        "observed_guard_safe_revert": 0,
        "unattempted": 0,
        "not_run_missing": total_missing,
    }
    for ef in evaluated_fixtures:
        cat = ef["executionCategory"]
        counts_by_execution_category[cat] = counts_by_execution_category.get(cat, 0) + 1

    # Breakdown of observed reverts
    observed_reverts_breakdown: Dict[str, int] = {}
    for row in results_rows:
        rev = row["observedRevert"]
        if rev is not None:
            observed_reverts_breakdown[rev] = observed_reverts_breakdown.get(rev, 0) + 1

    # Critical fixtures coverage
    critical_in_catalog = sum(1 for f in catalog_fixtures.values() if f.get("critical", False))
    critical_reported = sum(1 for f in evaluated_fixtures if f["critical"])
    critical_passed = sum(1 for f in evaluated_fixtures if f["critical"] and f["passed"])
    critical_failed = critical_reported - critical_passed
    critical_missing = critical_in_catalog - critical_reported

    report: Dict[str, Any] = {
        "schemaVersion": 1,
        "reportGeneratedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "runId": results_meta.get("runId"),
        "source": results_meta.get("source"),
        "isSynthetic": is_synthetic,
        "commit": results_meta.get("commit"),
        "environment": results_meta.get("environment"),
        "summary": {
            "catalogTotal": total_catalog,
            "reportedTotal": total_reported,
            "missingTotal": total_missing,
            "passedTotal": total_passed,
            "failedTotal": total_failed,
            "criticalCoverage": {
                "catalogTotal": critical_in_catalog,
                "reported": critical_reported,
                "passed": critical_passed,
                "failed": critical_failed,
                "missing": critical_missing,
            },
        },
        "countsByKind": counts_by_kind,
        "countsByDecision": counts_by_decision,
        "countsByExecutionCategory": counts_by_execution_category,
        "observedReverts": observed_reverts_breakdown,
        "fixtures": evaluated_fixtures,
        "missingFixtures": missing_fixtures,
        "failures": [f for f in evaluated_fixtures if not f["passed"]],
    }

    return report


def render_human_readable_report(report: Dict[str, Any]) -> str:
    """Render a clean, informative terminal / text report."""
    lines: List[str] = []
    bar = "=" * 78
    subbar = "-" * 78

    lines.append(bar)
    lines.append("              IntentLock Fixture Verification & Evidence Report")
    lines.append(bar)

    run_id = report.get("runId", "unknown")
    source = report.get("source", "unknown")
    is_synth = report.get("isSynthetic", False)
    commit = report.get("commit") or "none"
    gen_time = report.get("reportGeneratedAt", "")

    lines.append(f"Run ID:            {run_id}")
    lines.append(f"Source:            {source}")
    lines.append(f"Commit:            {commit}")
    lines.append(f"Timestamp:         {gen_time}")

    if is_synth:
        lines.append("")
        lines.append("  [!] SYNTHETIC SAMPLE DATA: NOT REAL CHAIN EVIDENCE")
        lines.append("      Success rates and performance percentages are suppressed to prevent")
        lines.append("      citing synthetic demonstration samples as project benchmark metrics.")

    lines.append(subbar)
    summary = report["summary"]
    lines.append("CORPUS SUMMARY:")
    lines.append(f"  Catalog Total:   {summary['catalogTotal']} fixtures")
    lines.append(f"  Reported in Run: {summary['reportedTotal']} / {summary['catalogTotal']}")
    lines.append(f"  Missing/Not Run: {summary['missingTotal']} / {summary['catalogTotal']}")
    lines.append(f"  Passed:          {summary['passedTotal']} / {summary['reportedTotal']}")
    lines.append(f"  Failed:          {summary['failedTotal']} / {summary['reportedTotal']}")

    crit = summary["criticalCoverage"]
    lines.append(f"  Critical 25 Set: {crit['reported']} reported ({crit['passed']} passed, {crit['failed']} failed, {crit['missing']} missing)")

    lines.append(subbar)
    lines.append("EXECUTION CATEGORY BREAKDOWN:")
    exec_cats = report["countsByExecutionCategory"]
    lines.append(f"  Successful Receipt (EVM executed):        {exec_cats['successful_receipt']}")
    lines.append(f"  Policy Refusals (REFUSE_POLICY/UNSUPP):    {exec_cats['policy_refusal']}")
    lines.append(f"  Insufficient Verifier Threshold:          {exec_cats['insufficient_threshold']}")
    lines.append(f"  Observed Guard/Safe Reverts:              {exec_cats['observed_guard_safe_revert']}")
    lines.append(f"  Unattempted / Quarantined:                {exec_cats['unattempted']}")
    lines.append(f"  Missing From Run (Not Run):               {exec_cats['not_run_missing']}")

    lines.append(subbar)
    lines.append("COUNTS BY KIND (Catalog Grouping):")
    lines.append("  Kind          Catalog Total   Reported   Passed   Failed   Missing")
    for kind, stats in report["countsByKind"].items():
        lines.append(
            f"  {kind:<13} {stats['catalogTotal']:<15} {stats['reported']:<10} {stats['passed']:<8} {stats['failed']:<8} {stats['missing']:<7}"
        )

    lines.append(subbar)
    lines.append("COUNTS BY ACTUAL POLICY DECISION:")
    for decision, count in sorted(report["countsByDecision"].items()):
        lines.append(f"  {decision:<25} {count}")

    if report["observedReverts"]:
        lines.append(subbar)
        lines.append("OBSERVED GUARD / SAFE REVERTS DETAIL:")
        for revert_name, count in sorted(report["observedReverts"].items()):
            lines.append(f"  {revert_name:<28} {count}")

    lines.append(subbar)
    lines.append("REPORTED FIXTURE RESULTS TABLE:")
    lines.append(
        "  ID   Kind    Crit  Actual Decision       Observed Revert       Status              Pass?"
    )
    lines.append("  " + "-" * 76)
    for fix in report["fixtures"]:
        fid = fix["fixtureId"]
        kind = fix["kind"][:6]
        crit = "yes" if fix["critical"] else "no"
        act_dec = fix["actual"]["decision"][:20]
        act_rev = str(fix["actual"]["observedRevert"] or "-")[:20]
        act_stat = fix["actual"]["workflowStatus"][:18]
        status_str = "PASS" if fix["passed"] else "FAIL"
        lines.append(
            f"  {fid:<4} {kind:<7} {crit:<5} {act_dec:<21} {act_rev:<21} {act_stat:<19} {status_str}"
        )

    if report["failures"]:
        lines.append(subbar)
        lines.append("FAILURE DETAILS:")
        for fail in report["failures"]:
            lines.append(f"  * Fixture {fail['fixtureId']} ({fail['title']}):")
            for m in fail["mismatches"]:
                lines.append(f"      - {m}")

    if report["missingFixtures"]:
        lines.append(subbar)
        lines.append(f"CATALOG FIXTURES MISSING FROM RUN ({len(report['missingFixtures'])} not run):")
        # Print concise table or list
        chunk_ids = [f"{mf['fixtureId']}({mf['kind']})" for mf in report["missingFixtures"]]
        for i in range(0, len(chunk_ids), 6):
            lines.append("  " + "  ".join(chunk_ids[i:i + 6]))

    lines.append(bar)
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="IntentLock Fixture Validation and Evidence Reporter",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "results_file",
        nargs="?",
        help="Path to machine-readable actual results JSON file",
    )
    parser.add_argument(
        "-r",
        "--results",
        dest="results_flag",
        help="Path to machine-readable actual results JSON file (alternative to positional argument)",
    )
    parser.add_argument(
        "-c",
        "--catalog",
        default=os.path.join("docs", "fixtures", "catalog.json"),
        help="Path to fixture catalog JSON file (default: docs/fixtures/catalog.json)",
    )
    parser.add_argument(
        "-o",
        "--output-json",
        help="Path to write machine-readable evaluation report JSON",
    )
    parser.add_argument(
        "--format",
        choices=["text", "json", "both"],
        default="text",
        help="Output format to stdout: 'text' (default), 'json', or 'both'",
    )
    parser.add_argument(
        "-q",
        "--quiet",
        action="store_true",
        help="Suppress human-readable summary on stdout (useful when writing JSON output)",
    )

    args = parser.parse_args()

    results_file = args.results_flag or args.results_file
    if not results_file:
        parser.print_help(sys.stderr)
        sys.stderr.write("\nError: An actual-results JSON file is required (pass as argument or via --results).\n")
        sys.exit(1)

    try:
        # Load and validate catalog
        catalog_raw = load_json_file(args.catalog, "Fixture Catalog")
        catalog_fixtures = validate_catalog(catalog_raw, args.catalog)

        # Load and validate results
        results_raw = load_json_file(results_file, "Actual Results")
        results_meta, results_rows = validate_results_data(
            results_raw, catalog_fixtures, results_file
        )

        # Generate report
        report = generate_report(catalog_fixtures, results_meta, results_rows)

        # Render outputs
        rendered_text = render_human_readable_report(report)

        if not args.quiet and args.format in ("text", "both"):
            print(rendered_text)

        if args.format in ("json", "both") or (args.quiet and not args.output_json):
            print(json.dumps(report, indent=2))

        if args.output_json:
            out_dir = os.path.dirname(os.path.abspath(args.output_json))
            if out_dir:
                os.makedirs(out_dir, exist_ok=True)
            with open(args.output_json, "w", encoding="utf-8") as out_f:
                json.dump(report, out_f, indent=2)
            if not args.quiet:
                print(f"\n[+] Wrote machine-readable evidence report to: {args.output_json}")

        # Clean successful execution: exit 0
        sys.exit(0)

    except ValidationError as err:
        sys.stderr.write(f"\n[!] VALIDATION ERROR: {err}\n")
        sys.exit(1)
    except Exception as err:
        sys.stderr.write(f"\n[!] UNEXPECTED ERROR: {err}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
