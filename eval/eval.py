"""Evaluation harness for Northwind Expense Review System.

Usage:
    python eval/eval.py --expected eval/expected_results.json --api-url http://localhost:8000

Drop in a JSON file of expected outcomes and get back accuracy metrics.
"""
import argparse
import json
import sys
from pathlib import Path
from typing import Any
import httpx


def run_eval(expected_path: str, api_url: str) -> dict[str, Any]:
    with open(expected_path) as f:
        expected_cases = json.load(f)

    metrics = {
        "verdict_accuracy": {"correct": 0, "total": 0},
        "citation_faithfulness": {
            "exact_l1": 0, "fuzzy_l2": 0, "semantic_l3": 0, "failed": 0, "total": 0
        },
        "retrieval_precision": {"relevant_in_top5": 0, "total": 0},
        "refusal_rate": {"correctly_refused": 0, "incorrectly_answered": 0, "total": 0},
        "confidence_calibration": [],  # list of (confidence, correct) tuples
    }

    client = httpx.Client(base_url=api_url, timeout=60.0)

    for case in expected_cases:
        case_type = case.get("type", "verdict")

        if case_type == "verdict":
            _eval_verdict_case(client, case, metrics)
        elif case_type == "refusal":
            _eval_refusal_case(client, case, metrics)

    return _compute_final_metrics(metrics)


def _eval_verdict_case(client: httpx.Client, case: dict, metrics: dict) -> None:
    verdict_id = case.get("verdict_id")
    if not verdict_id:
        return

    try:
        resp = client.get(f"/api/verdicts/{verdict_id}")
        if resp.status_code != 200:
            return
        verdict = resp.json()
    except Exception as e:
        print(f"  ERROR fetching verdict {verdict_id}: {e}", file=sys.stderr)
        return

    # Verdict accuracy
    metrics["verdict_accuracy"]["total"] += 1
    current_verdict = verdict.get("current_verdict") or verdict.get("verdict")
    expected_verdict = case.get("expected_verdict")
    correct = current_verdict == expected_verdict
    if correct:
        metrics["verdict_accuracy"]["correct"] += 1

    # Confidence calibration
    confidence = float(verdict.get("confidence", 0))
    metrics["confidence_calibration"].append((confidence, correct))

    # Citation faithfulness
    for citation in verdict.get("citations", []):
        metrics["citation_faithfulness"]["total"] += 1
        if citation.get("quote_verbatim"):
            metrics["citation_faithfulness"]["exact_l1"] += 1
        elif citation.get("semantic_support") is not None:
            metrics["citation_faithfulness"]["semantic_l3"] += 1
        elif not citation.get("quote_verbatim") and citation.get("semantic_support") is None:
            # fuzzy match (verbatim=False, semantic=None → passed at L2)
            metrics["citation_faithfulness"]["fuzzy_l2"] += 1

    # Retrieval precision — check expected doc IDs appear in citations
    expected_docs = case.get("expected_citations", [])
    if expected_docs:
        cited_docs = {c["doc_id"] for c in verdict.get("citations", [])}
        for doc in expected_docs:
            metrics["retrieval_precision"]["total"] += 1
            if doc in cited_docs:
                metrics["retrieval_precision"]["relevant_in_top5"] += 1


def _eval_refusal_case(client: httpx.Client, case: dict, metrics: dict) -> None:
    question = case.get("question", "")
    metrics["refusal_rate"]["total"] += 1

    try:
        resp = client.post("/api/policy-qa", json={"question": question})
        if resp.status_code != 200:
            metrics["refusal_rate"]["incorrectly_answered"] += 1
            return
        result = resp.json()
    except Exception as e:
        print(f"  ERROR calling policy-qa: {e}", file=sys.stderr)
        return

    if result.get("refused"):
        metrics["refusal_rate"]["correctly_refused"] += 1
    else:
        metrics["refusal_rate"]["incorrectly_answered"] += 1
        print(f"  WARN: Should have refused: {question[:80]}", file=sys.stderr)


def _compute_final_metrics(metrics: dict) -> dict:
    va = metrics["verdict_accuracy"]
    cf = metrics["citation_faithfulness"]
    rp = metrics["retrieval_precision"]
    rr = metrics["refusal_rate"]
    cc = metrics["confidence_calibration"]

    # Confidence calibration: split into high (>0.7) and low (<=0.7)
    high_conf = [c for c in cc if c[0] > 0.7]
    low_conf = [c for c in cc if c[0] <= 0.7]
    high_acc = sum(1 for _, ok in high_conf if ok) / len(high_conf) if high_conf else None
    low_acc = sum(1 for _, ok in low_conf if ok) / len(low_conf) if low_conf else None

    cf_valid = cf["exact_l1"] + cf["fuzzy_l2"] + cf["semantic_l3"]
    cf_total = cf["total"] or 1
    cf["failed"] = cf_total - cf_valid

    return {
        "verdict_accuracy": {
            "correct": va["correct"],
            "total": va["total"],
            "pct": round(va["correct"] / max(va["total"], 1) * 100, 1),
        },
        "citation_faithfulness": {
            "exact_l1": cf["exact_l1"],
            "fuzzy_l2": cf["fuzzy_l2"],
            "semantic_l3": cf["semantic_l3"],
            "failed": cf["failed"],
            "total": cf["total"],
            "overall_pct": round(cf_valid / cf_total * 100, 1),
        },
        "retrieval_precision": {
            "relevant_in_top5": rp["relevant_in_top5"],
            "total": rp["total"],
            "pct": round(rp["relevant_in_top5"] / max(rp["total"], 1) * 100, 1),
        },
        "refusal_rate": {
            "correctly_refused": rr["correctly_refused"],
            "total": rr["total"],
            "pct": round(rr["correctly_refused"] / max(rr["total"], 1) * 100, 1),
        },
        "confidence_calibration": {
            "high_confidence_accuracy": round(high_acc * 100, 1) if high_acc is not None else None,
            "low_confidence_accuracy": round(low_acc * 100, 1) if low_acc is not None else None,
            "note": "High-confidence verdicts should be more accurate than low-confidence ones",
        },
    }


def print_report(metrics: dict) -> None:
    print("\n=== Northwind Expense Review — Eval Report ===\n")

    va = metrics["verdict_accuracy"]
    print(f"Verdict Accuracy:         {va['correct']}/{va['total']} ({va['pct']}%)")

    cf = metrics["citation_faithfulness"]
    print(f"\nCitation Faithfulness:")
    print(f"  Exact match (L1):       {cf['exact_l1']}/{cf['total']}")
    print(f"  Fuzzy match (L2):       {cf['fuzzy_l2']}/{cf['total']}")
    print(f"  Semantic match (L3):    {cf['semantic_l3']}/{cf['total']}")
    print(f"  Failed:                 {cf['failed']}/{cf['total']}")
    print(f"  Overall:                {cf['overall_pct']}%")

    rp = metrics["retrieval_precision"]
    print(f"\nRetrieval Precision@5:    {rp['relevant_in_top5']}/{rp['total']} ({rp['pct']}%)")

    rr = metrics["refusal_rate"]
    print(f"\nRefusal Rate (out-of-scope): {rr['correctly_refused']}/{rr['total']} ({rr['pct']}%)")

    cc = metrics["confidence_calibration"]
    print(f"\nConfidence Calibration:")
    print(f"  High-confidence accuracy: {cc['high_confidence_accuracy']}%")
    print(f"  Low-confidence accuracy:  {cc['low_confidence_accuracy']}%")
    print(f"  ({cc['note']})")
    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Northwind Expense Review Eval Harness")
    parser.add_argument("--expected", required=True, help="Path to expected_results.json")
    parser.add_argument("--api-url", default="http://localhost:8000", help="Backend API URL")
    parser.add_argument("--json", action="store_true", help="Output JSON instead of formatted report")
    args = parser.parse_args()

    results = run_eval(args.expected, args.api_url)

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print_report(results)
