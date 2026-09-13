#!/usr/bin/env python3
"""Pure selection rules for superseding a stale production promotion.

Network calls, cancellation and the fail-closed runner loop intentionally remain in
GitHub Actions. This helper owns only the deterministic decisions that were
previously embedded as Python heredocs in production-promote.yml.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
from pathlib import Path
from typing import Any


ARTIFACT_NAME = "staging-promotion-accreditation"
_SOURCE_RUN_RE = re.compile(r"^[0-9]+$")


class SupersedeDataError(ValueError):
    pass


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise SupersedeDataError(f"JSON raíz inválido en {path}: se esperaba objeto")
    return payload


def parse_source_run_number(value: str | int) -> int:
    text = str(value)
    if _SOURCE_RUN_RE.fullmatch(text) is None:
        raise SupersedeDataError("SOURCE_STAGING_AI_RUN_NUMBER inválido")
    return int(text)


def candidate_run_ids(payload: dict[str, Any], source_run_number: str | int) -> list[int]:
    source_number = parse_source_run_number(source_run_number)
    rows = payload.get("workflow_runs") or []
    candidates: list[tuple[int, int]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            number = int(row.get("run_number") or 0)
            run_id = int(row.get("id") or 0)
        except (TypeError, ValueError) as exc:
            raise SupersedeDataError(f"run_number/id inválido en workflow run: {row}") from exc
        if (
            run_id
            and number > source_number
            and row.get("event") == "workflow_run"
            and row.get("status") == "completed"
            and row.get("conclusion") == "success"
        ):
            candidates.append((number, run_id))
    return [run_id for _, run_id in sorted(candidates, reverse=True)]


def has_exact_current_accreditation(payload: dict[str, Any]) -> bool:
    matches = [
        item
        for item in (payload.get("artifacts") or [])
        if isinstance(item, dict)
        and item.get("name") == ARTIFACT_NAME
        and not item.get("expired")
    ]
    return len(matches) == 1


def self_test() -> None:
    runs = {
        "workflow_runs": [
            {"id": 900, "run_number": 90, "event": "workflow_run", "status": "completed", "conclusion": "success"},
            {"id": 1202, "run_number": 120, "event": "workflow_run", "status": "completed", "conclusion": "success"},
            {"id": 1201, "run_number": 120, "event": "workflow_run", "status": "completed", "conclusion": "success"},
            {"id": 1100, "run_number": 110, "event": "workflow_run", "status": "completed", "conclusion": "success"},
            {"id": 1300, "run_number": 130, "event": "push", "status": "completed", "conclusion": "success"},
            {"id": 1290, "run_number": 129, "event": "workflow_run", "status": "in_progress", "conclusion": None},
            {"id": 1280, "run_number": 128, "event": "workflow_run", "status": "completed", "conclusion": "failure"},
            {"id": 0, "run_number": 127, "event": "workflow_run", "status": "completed", "conclusion": "success"},
            None,
        ]
    }
    assert candidate_run_ids(runs, "100") == [1202, 1201, 1100]
    assert candidate_run_ids(runs, 120) == []
    assert candidate_run_ids({}, "100") == []
    assert parse_source_run_number("0012") == 12
    for invalid in ("", "-1", "+1", "1.0", "abc", " 1"):
        try:
            parse_source_run_number(invalid)
        except SupersedeDataError:
            pass
        else:
            raise AssertionError(f"source run number debía rechazarse: {invalid!r}")

    valid_artifact = {"artifacts": [{"name": ARTIFACT_NAME, "expired": False}]}
    assert has_exact_current_accreditation(valid_artifact)
    assert not has_exact_current_accreditation({"artifacts": []})
    assert not has_exact_current_accreditation({"artifacts": [{"name": ARTIFACT_NAME, "expired": True}]})
    assert not has_exact_current_accreditation({"artifacts": [{"name": "other", "expired": False}]})
    assert not has_exact_current_accreditation(
        {"artifacts": [
            {"name": ARTIFACT_NAME, "expired": False},
            {"name": ARTIFACT_NAME, "expired": False},
        ]}
    )
    assert has_exact_current_accreditation(
        {"artifacts": [
            {"name": ARTIFACT_NAME, "expired": False},
            {"name": ARTIFACT_NAME, "expired": True},
            {"name": "other", "expired": False},
        ]}
    )

    try:
        candidate_run_ids(
            {"workflow_runs": [{"id": "not-an-int", "run_number": 140, "event": "workflow_run", "status": "completed", "conclusion": "success"}]},
            "100",
        )
    except SupersedeDataError:
        pass
    else:
        raise AssertionError("workflow run malformada debe fallar cerrado")

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "runs.json"
        path.write_text(json.dumps(runs), encoding="utf-8")
        assert candidate_run_ids(load_json(path), "100") == [1202, 1201, 1100]

    print("production-promotion-supersede self-test OK · candidates + accreditation")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    subparsers = parser.add_subparsers(dest="command")

    candidates = subparsers.add_parser("candidates")
    candidates.add_argument("runs_file")
    candidates.add_argument("source_run_number")

    artifact = subparsers.add_parser("artifact-valid")
    artifact.add_argument("artifacts_file")

    args = parser.parse_args(argv)
    if args.self_test:
        self_test()
        return 0

    try:
        if args.command == "candidates":
            payload = load_json(Path(args.runs_file))
            for run_id in candidate_run_ids(payload, args.source_run_number):
                print(run_id)
            return 0
        if args.command == "artifact-valid":
            payload = load_json(Path(args.artifacts_file))
            return 0 if has_exact_current_accreditation(payload) else 1
        parser.error("se requiere subcomando candidates o artifact-valid")
    except (OSError, json.JSONDecodeError, SupersedeDataError) as exc:
        print(f"::error::{exc}", file=sys.stderr)
        return 2

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
