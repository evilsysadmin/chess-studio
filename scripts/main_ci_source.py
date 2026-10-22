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


def emit_output(source: str, pr_number: int | None) -> None:
    output = os.environ.get("GITHUB_OUTPUT", "").strip()
    lines = [f"source={source}", f"pr_number={pr_number or ''}"]
    if output:
        with open(output, "a", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + "\n")
    for line in lines:
        print(line)


def merged_pulls_with_retry(
    path: str, token: str, *, get: Callable[[str, str], Any] = admission.api_get,
    sleep: Callable[[float], None] = time.sleep,
) -> list[dict[str, Any]]:
    """Retry only transient transport/API errors; never invent commit ancestry."""
    for attempt in range(3):
        try:
            pulls = get(path, token)
        except admission.AdmissionError as exc:
            message = str(exc)
            retryable = (
                re.match(r"^GitHub API .+ devolvió HTTP (429|500|502|503|504):", message)
                or message.startswith("GitHub API no disponible para ")
            )
            if not retryable or attempt == 2:
                raise
            print(
                f"::warning title=Main source API transient::attempt {attempt + 1}/3; retrying",
                file=sys.stderr,
            )
            sleep(1 << attempt)
            continue
        if not isinstance(pulls, list):
            raise SourceError("respuesta inesperada al buscar PR asociado")
        return pulls
    raise AssertionError("unreachable")


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
    pulls = merged_pulls_with_retry(f"{api_base}/commits/{main_sha}/pulls", token)

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

    # Retry a transient 500 or 429 without bypassing the exact merge SHA proof.
    path = f"/repos/owner/repo/commits/{sha}/pulls"
    for transient in (429, 500, 502, 503, 504):
        calls = []
        delays = []
        def flaky(path_arg, token_arg):
            calls.append((path_arg, token_arg))
            if len(calls) < 3:
                raise admission.AdmissionError(f"GitHub API {path_arg} devolvió HTTP {transient}:")
            return [pr]
        assert classify_main_source(
            merged_pulls_with_retry(path, "test-token", get=flaky, sleep=delays.append), sha
        ) == ("pr", 42)
        assert calls == [(path, "test-token")] * 3
        assert delays == [1, 2]

    for permanent in (400, 401, 403, 404, 422):
        calls = []
        def denied(path_arg, token_arg):
            calls.append(path_arg)
            raise admission.AdmissionError(f"GitHub API {path_arg} devolvió HTTP {permanent}:")
        try:
            merged_pulls_with_retry(path, "test-token", get=denied,
                                    sleep=lambda _: (_ for _ in ()).throw(AssertionError("sleep on permanent failure")))
        except admission.AdmissionError:
            assert calls == [path]
        else:
            raise AssertionError(f"HTTP {permanent} must fail closed")

    attempts = []
    def unavailable(path_arg, token_arg):
        attempts.append(path_arg)
        raise admission.AdmissionError(f"GitHub API no disponible para {path_arg}: timeout")
    try:
        merged_pulls_with_retry(path, "token", get=unavailable, sleep=lambda _: None)
    except admission.AdmissionError:
        assert len(attempts) == 3
    else:
        raise AssertionError("exhausted transient responses must fail closed")

    malformed = lambda *_: {"pulls": [pr]}
    try:
        merged_pulls_with_retry(path, "token", get=malformed, sleep=lambda _: None)
    except SourceError:
        pass
    else:
        raise AssertionError("invalid GitHub pull list must not pass as direct")

    print("main-ci-source self-test OK · pr/direct/ambiguous + bounded API retries")


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
