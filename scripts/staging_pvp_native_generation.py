#!/usr/bin/env python3
"""Pin manual native CDP diagnosis to an accredited, still-live staging SHA.

Never mix a newer test checkout with an older deployed runtime; the workflow
checks out the selected *runtime* SHA before running staging-live.spec.js.
"""
from __future__ import annotations

import argparse
import os
import sys

import staging_generation as generation
import staging_smoke_only as smoke


def validate(source: str, runtime: str, *, ancestor: bool, parity: bool) -> str:
    source = generation.valid_sha(source)
    runtime = generation.valid_sha(runtime)
    if source != runtime and not ancestor:
        raise RuntimeError("runtime SHA is not an ancestor of the manual source SHA")
    if not parity:
        raise RuntimeError("the latest complete staging SHA is no longer served by all three surfaces")
    return runtime


def resolve(source: str) -> str:
    if os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch" or os.environ.get("GITHUB_REF") != "refs/heads/main":
        raise RuntimeError("native CDP diagnosis is manual-only on main")
    if source != os.environ.get("GITHUB_SHA"):
        raise RuntimeError("manual workflow source SHA mismatch")
    repository = os.environ.get("GITHUB_REPOSITORY", "")
    token = os.environ.get("GITHUB_TOKEN", "")
    if not token or repository.count("/") != 1:
        raise RuntimeError("GitHub read-only API credentials are required")
    runtime, run_id = smoke.latest_automatic_generation(repository, token)
    result = validate(
        source, runtime,
        ancestor=smoke.comparison_ahead(repository, runtime, source, token),
        parity=smoke.surfaces_are_exact(runtime),
    )
    print(f"Native diagnostic pinned to complete automatic staging run {run_id}, runtime {result[:12]}", file=sys.stderr)
    return result


def self_test() -> None:
    a, b = "a" * 40, "b" * 40
    assert validate(a, a, ancestor=False, parity=True) == a
    assert validate(b, a, ancestor=True, parity=True) == a
    for source, runtime, ancestor, parity in (
        (b, a, False, True),
        (a, a, True, False),
        (b, a, True, False),
    ):
        try:
            validate(source, runtime, ancestor=ancestor, parity=parity)
        except RuntimeError:
            continue
        raise AssertionError("incoherent native diagnostic runtime was accepted")
    from pathlib import Path
    workflow = (Path(__file__).resolve().parents[1] / ".github/workflows/staging-pvp-compositor-ab.yml").read_text(encoding="utf-8")
    assert 'git show "$GITHUB_SHA:e2e/staging-live.spec.js" > e2e/staging-live.spec.js' in workflow
    assert '|NATIVE|WEBGL|LAYERS|LOAF)' in workflow
    # The optional native-only trace must keep thread CPU and elapsed-wall
    # clocks distinct: a missing tdur is not equivalent to zero CPU cost.
    spec = (Path(__file__).resolve().parents[1] / "e2e/staging-live.spec.js").read_text(encoding="utf-8")
    for marker in (
        "Number.isFinite(event.tdur) && event.tdur >= 0",
        "critical_commit_thread_cpu_ms=",
        "critical_commit_non_cpu_wall_ms=",
        "critical_commit_cpu_pct=",
        "critical_task_thread_cpu_ms=",
        "'unavailable'",
    ):
        assert marker in spec, f"native CPU/wall probe missing: {marker}"
    print("staging-pvp-native-generation self-test: OK")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--source-sha")
    arguments = parser.parse_args()
    if arguments.self_test:
        self_test()
    else:
        if not arguments.source_sha:
            parser.error("--source-sha is required")
        print(resolve(arguments.source_sha))
