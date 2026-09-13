#!/usr/bin/env python3
"""Create the immutable Quality receipt for a pull-request synthetic merge.

Keep Git topology validation and receipt serialization out of workflow YAML so the
contract can be exercised directly and reviewed without shell/Python heredocs.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path


class ProvenanceError(RuntimeError):
    pass


def _git(root: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def validate_checkout(
    *,
    tested_merge_sha: str,
    event_sha: str,
    parents: list[str],
    pr_head_sha: str,
) -> tuple[str, str]:
    tested = tested_merge_sha.strip().lower()
    event = event_sha.strip().lower()
    head = pr_head_sha.strip().lower()
    normalized_parents = [parent.strip().lower() for parent in parents if parent.strip()]

    if tested != event:
        raise ProvenanceError(f"Checkout mutable: HEAD={tested_merge_sha} pero github.sha={event_sha}")
    if len(normalized_parents) != 2:
        raise ProvenanceError(
            "El SHA probado por un PR debe ser un merge sintético de exactamente dos padres."
        )
    base_sha, tested_head_sha = normalized_parents
    if tested_head_sha != head:
        raise ProvenanceError(
            f"El segundo padre probado {tested_head_sha} no coincide con el head del PR {head}"
        )
    return base_sha, tested_head_sha


def build_payload(
    *,
    pr_number: str | int,
    tested_merge_sha: str,
    base_sha: str,
    head_sha: str,
    run_id: str | int,
    run_attempt: str | int,
) -> dict[str, int | str]:
    return {
        "schema": 1,
        "pr_number": int(pr_number),
        "tested_merge_sha": tested_merge_sha.lower(),
        "base_sha": base_sha.lower(),
        "head_sha": head_sha.lower(),
        "run_id": int(run_id),
        "run_attempt": int(run_attempt),
    }


def write_receipt(path: Path, payload: dict[str, int | str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, sort_keys=True, indent=2) + "\n", encoding="utf-8")


def capture_receipt(
    *,
    root: Path,
    event_sha: str,
    pr_number: str | int,
    pr_head_sha: str,
    run_id: str | int,
    run_attempt: str | int,
    output: Path,
) -> dict[str, int | str]:
    tested_merge_sha = _git(root, "rev-parse", "HEAD")
    parents = _git(root, "show", "-s", "--format=%P", "HEAD").split()
    base_sha, head_sha = validate_checkout(
        tested_merge_sha=tested_merge_sha,
        event_sha=event_sha,
        parents=parents,
        pr_head_sha=pr_head_sha,
    )
    payload = build_payload(
        pr_number=pr_number,
        tested_merge_sha=tested_merge_sha,
        base_sha=base_sha,
        head_sha=head_sha,
        run_id=run_id,
        run_attempt=run_attempt,
    )
    write_receipt(output, payload)
    return payload


def self_test() -> None:
    tested = "A" * 40
    base = "B" * 40
    head = "C" * 40
    validated_base, validated_head = validate_checkout(
        tested_merge_sha=tested,
        event_sha=tested.lower(),
        parents=[base, head],
        pr_head_sha=head.lower(),
    )
    assert validated_base == base.lower()
    assert validated_head == head.lower()

    payload = build_payload(
        pr_number="42",
        tested_merge_sha=tested,
        base_sha=base,
        head_sha=head,
        run_id="9001",
        run_attempt="2",
    )
    assert payload == {
        "schema": 1,
        "pr_number": 42,
        "tested_merge_sha": tested.lower(),
        "base_sha": base.lower(),
        "head_sha": head.lower(),
        "run_id": 9001,
        "run_attempt": 2,
    }

    with tempfile.TemporaryDirectory() as tmp:
        target = Path(tmp) / ".ci" / "quality-provenance.json"
        write_receipt(target, payload)
        assert json.loads(target.read_text(encoding="utf-8")) == payload
        assert target.read_text(encoding="utf-8").endswith("\n")

    failure_cases = (
        dict(tested_merge_sha=tested, event_sha="D" * 40, parents=[base, head], pr_head_sha=head),
        dict(tested_merge_sha=tested, event_sha=tested, parents=[base], pr_head_sha=head),
        dict(tested_merge_sha=tested, event_sha=tested, parents=[base, head], pr_head_sha="D" * 40),
    )
    for kwargs in failure_cases:
        try:
            validate_checkout(**kwargs)
        except ProvenanceError:
            pass
        else:
            raise AssertionError(f"quality provenance debía fallar: {kwargs}")

    print("quality-provenance self-test OK · synthetic merge + immutable receipt")


def _required(value: str | None, name: str) -> str:
    if value is None or not str(value).strip():
        raise ProvenanceError(f"falta {name}")
    return str(value)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--root", default=".")
    parser.add_argument("--output", default=".ci/quality-provenance.json")
    parser.add_argument("--event-sha", default=os.environ.get("EVENT_SHA"))
    parser.add_argument("--pr-number", default=os.environ.get("PR_NUMBER"))
    parser.add_argument("--pr-head-sha", default=os.environ.get("PR_HEAD_SHA"))
    parser.add_argument("--run-id", default=os.environ.get("RUN_ID"))
    parser.add_argument("--run-attempt", default=os.environ.get("RUN_ATTEMPT"))
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0

    try:
        payload = capture_receipt(
            root=Path(args.root).resolve(),
            event_sha=_required(args.event_sha, "EVENT_SHA"),
            pr_number=_required(args.pr_number, "PR_NUMBER"),
            pr_head_sha=_required(args.pr_head_sha, "PR_HEAD_SHA"),
            run_id=_required(args.run_id, "RUN_ID"),
            run_attempt=_required(args.run_attempt, "RUN_ATTEMPT"),
            output=Path(args.output),
        )
    except (ProvenanceError, subprocess.CalledProcessError, ValueError) as exc:
        print(f"::error::{exc}")
        return 1

    print(
        f"Quality receipt · PR #{payload['pr_number']} · "
        f"merge {str(payload['tested_merge_sha'])[:12]} · "
        f"base {str(payload['base_sha'])[:12]} · head {str(payload['head_sha'])[:12]}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
