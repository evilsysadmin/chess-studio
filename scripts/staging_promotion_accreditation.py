#!/usr/bin/env python3
"""Write the immutable staging accreditation consumed by production promotion."""
from __future__ import annotations

import argparse
import json
import re
import tempfile
from pathlib import Path

SHA_RE = re.compile(r"[0-9a-f]{40}")
SCHEMA = 1


def normalize_sha(value: str) -> str:
    sha = value.strip().lower()
    if SHA_RE.fullmatch(sha) is None:
        raise ValueError(f"SHA acreditado inválido: {value!r}")
    return sha


def run_id(value: str | int, *, label: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label} inválido: {value!r}") from exc


def build_payload(
    *,
    sha: str,
    staging_deploy_run_id: str | int,
    staging_ai_run_id: str | int,
    upstream_event: str,
) -> dict:
    return {
        "schema": SCHEMA,
        "sha": normalize_sha(sha),
        "staging_deploy_run_id": run_id(staging_deploy_run_id, label="staging_deploy_run_id"),
        "staging_ai_run_id": run_id(staging_ai_run_id, label="staging_ai_run_id"),
        "upstream_event": str(upstream_event),
    }


def write_payload(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, sort_keys=True) + "\n", encoding="utf-8")


def self_test() -> None:
    sha = "a" * 40
    payload = build_payload(
        sha=sha.upper(),
        staging_deploy_run_id="123",
        staging_ai_run_id=456,
        upstream_event="workflow_run",
    )
    assert payload == {
        "schema": 1,
        "sha": sha,
        "staging_deploy_run_id": 123,
        "staging_ai_run_id": 456,
        "upstream_event": "workflow_run",
    }

    with tempfile.TemporaryDirectory() as tmp:
        target = Path(tmp) / "nested" / "staging-promotion-accreditation.json"
        write_payload(target, payload)
        raw = target.read_text(encoding="utf-8")
        assert raw.endswith("\n")
        assert json.loads(raw) == payload
        assert raw == json.dumps(payload, sort_keys=True) + "\n"

    for bad in ("", "abc", "g" * 40):
        try:
            build_payload(
                sha=bad,
                staging_deploy_run_id=1,
                staging_ai_run_id=2,
                upstream_event="workflow_run",
            )
        except ValueError:
            pass
        else:
            raise AssertionError(f"invalid SHA accepted: {bad!r}")

    for label, kwargs in (
        ("staging_deploy_run_id", {"staging_deploy_run_id": "x", "staging_ai_run_id": 2}),
        ("staging_ai_run_id", {"staging_deploy_run_id": 1, "staging_ai_run_id": "x"}),
    ):
        try:
            build_payload(sha=sha, upstream_event="workflow_run", **kwargs)
        except ValueError as exc:
            assert label in str(exc)
        else:
            raise AssertionError(f"invalid {label} accepted")

    print("staging promotion accreditation self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    parser.add_argument("--sha")
    # Underscore option names are deliberate: the workflow exposes the persisted
    # accreditation field names verbatim for static provenance contracts.
    parser.add_argument("--staging_deploy_run_id")
    parser.add_argument("--staging_ai_run_id")
    parser.add_argument("--upstream_event")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0
    required = {
        "--output": args.output,
        "--sha": args.sha,
        "--staging_deploy_run_id": args.staging_deploy_run_id,
        "--staging_ai_run_id": args.staging_ai_run_id,
        "--upstream_event": args.upstream_event,
    }
    missing = [name for name, value in required.items() if value is None]
    if missing:
        parser.error("missing required arguments: " + ", ".join(missing))

    try:
        payload = build_payload(
            sha=args.sha,
            staging_deploy_run_id=args.staging_deploy_run_id,
            staging_ai_run_id=args.staging_ai_run_id,
            upstream_event=args.upstream_event,
        )
        write_payload(args.output, payload)
    except (OSError, ValueError) as exc:
        print(f"::error::{exc}")
        return 1

    print(
        "Staging promotion accreditation written · "
        f"sha={payload['sha']} deploy_run={payload['staging_deploy_run_id']} "
        f"ai_run={payload['staging_ai_run_id']} event={payload['upstream_event']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
