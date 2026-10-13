#!/usr/bin/env python3
"""Prepare one coherent staging generation and all optional post-staging scopes."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from urllib.parse import quote

import main_ci_admission as admission
import staging_deploy_scope as deploy_scope
import staging_generation as generation
import staging_optional_scope as optional_scope
import staging_smoke_only as smoke_only
from main_ci_source import SourceError


SMOKE_VARIANTS = {
    "live": {"key": "live", "label": "War Room live", "spec": "staging-live.spec.js"},
    "restore": {"key": "restore", "label": "authoritative F5 restore", "spec": "staging-war-room-restore.spec.js"},
}


def browser_smoke_matrix(keys: tuple[str, ...]) -> str:
    """Single-line GITHUB_OUTPUT JSON. Invalid selection is a hard error."""
    if not keys or len(set(keys)) != len(keys) or any(key not in SMOKE_VARIANTS for key in keys):
        raise ValueError("invalid staging smoke selection")
    # Use canonical order, independent of diff order; full deploy always both.
    return json.dumps({"include": [value for key, value in SMOKE_VARIANTS.items() if key in keys]},
                      separators=(",", ":"))


def append_summary(text: str) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY", "").strip()
    if path:
        with Path(path).open("a", encoding="utf-8") as handle:
            handle.write(text.rstrip() + "\n")


def resolve_source(sha: str) -> str:
    repository = os.environ.get("GITHUB_REPOSITORY", "").strip()
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    try:
        if not repository or "/" not in repository or not token:
            raise SourceError("missing repository/token")
        return deploy_scope.source_for_sha(repository, sha, token)
    except (SourceError, admission.AdmissionError, OSError):
        return "unknown"



def manual_main_admission_green(sha: str, repository: str, token: str, *, get=admission.api_get) -> bool:
    """A manual deploy must prove the exact main SHA passed its push admission."""
    if not token or repository.count("/") != 1:
        return False
    owner, name = repository.split("/", 1)
    if not owner or not name:
        return False
    response = get(
        f"/repos/{quote(owner)}/{quote(name)}/actions/workflows/main-admission.yml/runs"
        f"?head_sha={sha}&per_page=30",
        token,
    )
    runs = response.get("workflow_runs") if isinstance(response, dict) else None
    if not isinstance(runs, list):
        return False
    # GitHub returns newest runs first. Never resurrect an older successful
    # admission if the latest exact-SHA run failed or is still running.
    matching = next((
        run for run in runs
        if isinstance(run, dict)
        and run.get("head_sha") == sha
        and run.get("event") == "push"
    ), None)
    return bool(
        matching
        and matching.get("status") == "completed"
        and matching.get("conclusion") == "success"
    )


def prepare(sha: str) -> dict[str, str]:
    head = generation.valid_sha(sha)
    source = resolve_source(head)
    required, reason = deploy_scope.decide(head, source)
    values = {
        "deploy_sha": head,
        "admitted": "false",
        "smoke_only": "false",
        "smoke_sha": "",
        "smoke_matrix": browser_smoke_matrix(smoke_only.SMOKE_KEYS),
        "pawn_slug_visual_required": "false",
        "resend_bootstrap_required": "false",
        "continuity_required": "false",
        "optional_scope_reason": "not-admitted",
        "optional_scope_base_sha": "",
    }
    if not required:
        append_summary(f"### Staging no-op · {head} · {reason}")
        return values

    current = generation.current_main()
    if current != head:
        append_summary(f"### Staging superseded · {head}")
        return values

    if os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch":
        # workflow_run is already gated by GitHub's upstream success in the
        # workflow job condition. Manual dispatch has no such event guarantee.
        try:
            green = manual_main_admission_green(
                head,
                os.environ.get("GITHUB_REPOSITORY", ""),
                os.environ.get("GITHUB_TOKEN", ""),
            )
        except (OSError, ValueError, admission.AdmissionError) as exc:
            append_summary(f"### Staging blocked · {head} · admission unreadable ({type(exc).__name__})")
            raise RuntimeError("Manual staging refused: exact-SHA Main admission cannot be verified") from exc
        if not green:
            append_summary(f"### Staging blocked · {head} · Main admission not green")
            raise RuntimeError("Manual staging refused: exact-SHA Main admission is not green")

    values["admitted"] = "true"
    # A test-only commit can exercise the last immutable deployed runtime.
    # This does not issue new deployment/promotion credit.
    smoke_sha, smoke_reason, smoke_keys = smoke_only.select(head, source)
    if smoke_sha:
        values["smoke_only"] = "true"
        values["smoke_sha"] = smoke_sha
        values["smoke_matrix"] = browser_smoke_matrix(smoke_keys)
        append_summary(f"### Staging smoke-only · tests {head} · runtime {smoke_sha} · {smoke_reason} · tests {','.join(smoke_keys)}")
        return values
    values.update(optional_scope.decide(head))
    return values


def emit(path: str, values: dict[str, str]) -> None:
    lines = "".join(f"{key}={value}\n" for key, value in values.items())
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(lines)
    print(lines, end="")


def self_test() -> None:
    assert [entry["key"] for entry in json.loads(browser_smoke_matrix(("restore",)))["include"]] == ["restore"]
    assert [entry["key"] for entry in json.loads(browser_smoke_matrix(("live",)))["include"]] == ["live"]
    assert [entry["key"] for entry in json.loads(browser_smoke_matrix(smoke_only.SMOKE_KEYS))["include"]] == ["live", "restore"]
    for bad in ((), ("live", "live"), ("unknown",)):
        try:
            browser_smoke_matrix(bad)
        except ValueError:
            pass
        else:
            raise AssertionError(f"accepted invalid smoke selection: {bad}")
    sha = "a" * 40
    approved = {"workflow_runs": [{
        "head_sha": sha, "event": "push", "status": "completed", "conclusion": "success",
    }]}
    lookup = lambda path, token: approved
    assert manual_main_admission_green(sha, "owner/repo", "token", get=lookup)
    assert not manual_main_admission_green(sha, "owner/repo", "", get=lookup)
    assert not manual_main_admission_green(sha, "owner/repo", "token", get=lambda p, t: {})
    assert not manual_main_admission_green(
        sha, "owner/repo", "token",
        get=lambda p, t: {"workflow_runs": [
            {"head_sha": sha, "event": "push", "status": "completed", "conclusion": "failure"},
            approved["workflow_runs"][0],
        ]},
    )
    assert not manual_main_admission_green(
        sha, "owner/repo", "token",
        get=lambda p, t: {"workflow_runs": [
            {"head_sha": sha, "event": "workflow_dispatch", "status": "completed", "conclusion": "success"},
        ]},
    )
    deploy_scope.self_test()
    generation.self_test()
    optional_scope.self_test()
    smoke_only.self_test()
    print("staging-deploy-prepare self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sha")
    parser.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT", ""))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    emit(args.github_output, prepare(args.sha or ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
