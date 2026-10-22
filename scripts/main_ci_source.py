#!/usr/bin/env python3
"""Classify the current main HEAD as PR-derived or direct.

Main admission has two safe paths:
- PR-derived SHA: reuse the already-green immutable PR Quality receipt.
- Direct SHA: run the exceptional full exact-HEAD fallback gate.

The classifier is intentionally narrow. Ambiguous PR provenance fails closed
instead of silently choosing either path.
"""
from __future__ import annotations

import os
import re
import sys
import time
from typing import Any, Callable
from urllib.parse import quote

import main_ci_admission as admission


class SourceError(RuntimeError):
    pass


def matching_merged_main_prs(pulls: list[dict[str, Any]], main_sha: str) -> list[dict[str, Any]]:
    sha = main_sha.lower()
    return [
        pr
        for pr in pulls
        if pr.get("merged_at")
        and str(pr.get("merge_commit_sha") or "").lower() == sha
        and (pr.get("base") or {}).get("ref") == "main"
    ]


def classify_main_source(pulls: list[dict[str, Any]], main_sha: str) -> tuple[str, int | None]:
    matches = matching_merged_main_prs(pulls, main_sha)
    if len(matches) == 1:
        number = int(matches[0].get("number") or 0)
        if not number:
            raise SourceError("el PR asociado no expone número")
        return "pr", number
    if not matches:
        return "direct", None
    raise SourceError(f"main {main_sha[:12]} acredita {len(matches)} PR mergeados; origen ambiguo")



# A 500 from GitHub's commit→PR association endpoint is transport failure,
# not proof of a direct push. Retry a small, bounded number of *GETs* before
# failing closed. Never fall through to the less restrictive direct-source gate.
_TRANSIENT_COMMIT_PULL_HTTP = re.compile(r"\\bHTTP (?:500|502|503|504)\\b")
_COMMIT_PULL_RETRY_DELAYS = (1, 2, 4)


def fetch_commit_pulls(
    path: str, token: str, *,
    getter: Callable[[str, str], Any] = admission.api_get,
    pause: Callable[[float], None] = time.sleep,
) -> Any:
    for attempt in range(len(_COMMIT_PULL_RETRY_DELAYS) + 1):
        try:
            return getter(path, token)
        except admission.AdmissionError as exc:
            if attempt == len(_COMMIT_PULL_RETRY_DELAYS) or not _TRANSIENT_COMMIT_PULL_HTTP.search(str(exc)):
                raise
            print(
                f"::warning title=GitHub commit provenance retry::"
                f"Transient GitHub API HTTP 5xx; attempt {attempt + 2}/4.",
                file=sys.stderr,
            )
            pause(_COMMIT_PULL_RETRY_DELAYS[attempt])
    raise AssertionError("unreachable retry loop")


def emit_output(source: str, pr_number: int | None) -> None:
    output = os.environ.get("GITHUB_OUTPUT", "").strip()
    lines = [f"source={source}", f"pr_number={pr_number or ''}"]
    if output:
        with open(output, "a", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + "\n")
    for line in lines:
        print(line)


def run_live() -> int:
    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    main_sha = os.environ.get("GITHUB_SHA", "").strip().lower()
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if not repo or "/" not in repo:
        raise SourceError("GITHUB_REPOSITORY ausente o inválido")
    if len(main_sha) != 40:
        raise SourceError("GITHUB_SHA debe ser un SHA completo")
    if not token:
        raise SourceError("GITHUB_TOKEN ausente")

    owner, repo_name = repo.split("/", 1)
    api_base = f"/repos/{quote(owner)}/{quote(repo_name)}"
    pulls = fetch_commit_pulls(f"{api_base}/commits/{main_sha}/pulls", token)
    if not isinstance(pulls, list):
        raise SourceError("respuesta inesperada al buscar PR asociado")

    source, pr_number = classify_main_source(pulls, main_sha)
    emit_output(source, pr_number)
    if source == "pr":
        print(f"Main source · PR #{pr_number} · fast-path de acreditación")
    else:
        print(
            "::warning title=Direct main fallback::"
            f"main {main_sha[:12]} no procede de un PR mergeado; "
            "se exigirá Quality completo sobre el HEAD exacto"
        )
    return 0


def self_test() -> None:
    sha = "a" * 40
    pr = {
        "number": 42,
        "merged_at": "2026-09-06T20:00:00Z",
        "merge_commit_sha": sha,
        "base": {"ref": "main"},
    }
    assert classify_main_source([pr], sha) == ("pr", 42)
    assert classify_main_source([], sha) == ("direct", None)
    assert classify_main_source([{**pr, "merge_commit_sha": "b" * 40}], sha) == ("direct", None)
    assert classify_main_source([{**pr, "base": {"ref": "release"}}], sha) == ("direct", None)

    try:
        classify_main_source([pr, {**pr, "number": 43}], sha)
    except SourceError:
        pass
    else:
        raise AssertionError("dos PR acreditados deben fallar por ambigüedad")

    try:
        classify_main_source([{**pr, "number": 0}], sha)
    except SourceError:
        pass
    else:
        raise AssertionError("un PR sin número debe fallar")


    # Failure from the upstream commit→pulls API must never be interpreted as
    # direct-origin main or a successful PR accreditation.
    calls: list[int] = []
    delays: list[float] = []

    def flaky_getter(_path: str, _token: str) -> Any:
        calls.append(1)
        if len(calls) < 3:
            raise admission.AdmissionError("GitHub API commit/pulls devolvió HTTP 500")
        return [pr]

    assert fetch_commit_pulls("commit/pulls", "test", getter=flaky_getter, pause=delays.append) == [pr]
    assert len(calls) == 3 and delays == [1, 2]

    for status in (502, 503, 504):
        attempts: list[int] = []
        pauses: list[float] = []

        def always_transient(_path: str, _token: str) -> Any:
            attempts.append(status)
            raise admission.AdmissionError(f"GitHub API commit/pulls devolvió HTTP {status}")

        try:
            fetch_commit_pulls("commit/pulls", "test", getter=always_transient, pause=pauses.append)
        except admission.AdmissionError:
            pass
        else:
            raise AssertionError("HTTP 5xx agotado debe fallar cerrado")
        assert len(attempts) == 4 and pauses == [1, 2, 4]

    immediate: list[float] = []
    for status in (400, 403, 404, 422):
        try:
            fetch_commit_pulls(
                "commit/pulls", "test",
                getter=lambda _p, _t: (_ for _ in ()).throw(
                    admission.AdmissionError(f"GitHub API commit/pulls devolvió HTTP {status}")
                ),
                pause=immediate.append,
            )
        except admission.AdmissionError:
            pass
        else:
            raise AssertionError(f"HTTP {status} must fail immediately")
    assert not immediate

    print("main-ci-source self-test OK · pr/direct/ambiguous fail-closed")


def main() -> int:
    if "--self-test" in sys.argv:
        self_test()
        return 0
    try:
        return run_live()
    except (SourceError, admission.AdmissionError) as exc:
        print(f"MAIN SOURCE FAIL: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
