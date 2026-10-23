#!/usr/bin/env python3
"""Resolve the last complete staging generation and diff a new SHA against it."""
from __future__ import annotations

import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor
from collections.abc import Callable
from urllib.request import Request, urlopen

import staging_deploy_proof as proof
import staging_generation as generation

Runner = Callable[..., subprocess.CompletedProcess]
WORKFLOW_FILE = "staging-deploy.yml"


def successful_runs(repository: str, token: str) -> list[dict]:
    api = os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")
    request = Request(
        f"{api}/repos/{repository}/actions/workflows/{WORKFLOW_FILE}/runs"
        "?branch=main&status=success&per_page=100",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "chess-studio-staging-generation-diff/2",
        },
    )
    with urlopen(request, timeout=20) as response:
        payload = json.load(response)
    runs = payload.get("workflow_runs")
    if not isinstance(runs, list):
        raise RuntimeError("GitHub workflow_runs payload inválido")
    return runs


def select_complete_generation(
    runs: list[dict],
    jobs_for_run: Callable[[int], list[dict]],
) -> tuple[str, int]:
    """Prove the newest complete generation, not merely a green workflow.

    Most recent staging workflows may be intentionally superseded/no-op yet
    conclude success. Probe their job receipts in small read-only batches,
    but consume evidence in strict newest-first order. Never allow a later
    successful probe to eclipse an earlier complete generation.
    """
    candidates: list[tuple[str, int]] = []
    for run in runs:
        if not isinstance(run, dict) or str(run.get("conclusion") or "") != "success":
            continue
        sha = str(run.get("head_sha") or "").lower()
        run_id = int(run.get("id") or 0)
        if generation.SHA_RE.fullmatch(sha) and run_id > 0:
            candidates.append((sha, run_id))

    batch_size = 4  # Bound parallel GitHub read-only API requests.
    for start in range(0, len(candidates), batch_size):
        batch = candidates[start:start + batch_size]
        with ThreadPoolExecutor(max_workers=len(batch)) as pool:
            job_receipts = pool.map(jobs_for_run, (run_id for _, run_id in batch))
            for (sha, run_id), jobs in zip(batch, job_receipts):
                if proof.deployed_generation(jobs):
                    return sha, run_id
    raise RuntimeError("no previous complete staging generation found")


def previous_complete_generation(repository: str, token: str) -> tuple[str, int]:
    return select_complete_generation(
        successful_runs(repository, token),
        lambda run_id: proof.fetch_jobs(repository, run_id, token),
    )


def changed_files(base_sha: str, head_sha: str, runner: Runner = subprocess.run) -> list[str]:
    base = generation.valid_sha(base_sha)
    head = generation.valid_sha(head_sha)
    if base == head:
        return []
    # Fail bounded: an unavailable baseline must trigger the normal guarded
    # full-deploy path, not a speculative skip or an indefinitely stuck runner.
    try:
        fetched = runner(
            ["git", "fetch", "--no-tags", "--depth=1", "origin", base],
            capture_output=True, text=True, check=False, timeout=20,
        )
        if fetched.returncode != 0:
            raise RuntimeError("could not fetch previous complete staging generation")
        diff = runner(
            ["git", "diff", "--name-only", base, head],
            capture_output=True, text=True, check=True, timeout=15,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise RuntimeError("could not prove cumulative staging diff") from exc
    return [line.strip().replace("\\", "/") for line in (diff.stdout or "").splitlines() if line.strip()]


def diff_since_previous_complete(
    head_sha: str,
    *,
    repository: str | None = None,
    token: str | None = None,
    runner: Runner = subprocess.run,
) -> tuple[list[str], str, int]:
    head = generation.valid_sha(head_sha)
    repo = (repository or os.environ.get("GITHUB_REPOSITORY") or "").strip()
    auth = (token or os.environ.get("GITHUB_TOKEN") or "").strip()
    if not repo or "/" not in repo or not auth:
        raise RuntimeError("repository/token required for staging baseline")
    base, run_id = previous_complete_generation(repo, auth)
    return changed_files(base, head, runner), base, run_id


def self_test() -> None:
    a = "a" * 40
    b = "b" * 40
    green = [{"name": name, "conclusion": "success"} for name in proof.REQUIRED_JOBS]
    partial = green[:-1]
    runs = [
        {"id": 30, "head_sha": a, "conclusion": "success"},
        {"id": 29, "head_sha": b, "conclusion": "success"},
    ]
    jobs = {30: partial, 29: green}
    assert select_complete_generation(runs, lambda rid: jobs[rid]) == (b, 29)

    # Many green-but-superseded workflows must never displace the newest fully
    # proved generation, even when their read-only job requests run concurrently.
    ten = [
        {"id": rid, "head_sha": f"{rid:040x}", "conclusion": "success"}
        for rid in range(100, 90, -1)
    ]
    completions = {rid: (green if rid == 93 or rid == 91 else partial)
                   for rid in range(100, 90, -1)}
    result = select_complete_generation(ten, lambda rid: completions[rid])
    assert result == (f"{93:040x}", 93)
    assert not select_complete_generation.__defaults__  # No configurable unbounded parallelism.
    try:
        select_complete_generation(ten, lambda _: (_ for _ in ()).throw(RuntimeError("API offline")))
    except RuntimeError as exc:
        assert "API offline" in str(exc)
    else:
        raise AssertionError("unproven GitHub jobs must fail open to guarded deploy")

    assert changed_files(a, a, runner=lambda *args, **kwargs: None) == []

    class Done:
        def __init__(self, returncode=0, stdout="") -> None:
            self.returncode = returncode
            self.stdout = stdout

    calls: list[list[str]] = []

    def fake_runner(argv, **_kwargs):
        calls.append(list(argv))
        if argv[1] == "fetch":
            return Done()
        return Done(stdout="backend-python/app.py\nfrontend/src/App.jsx\n")

    assert changed_files(a, b, runner=fake_runner) == [
        "backend-python/app.py",
        "frontend/src/App.jsx",
    ]
    assert calls[0][:3] == ["git", "fetch", "--no-tags"]
    assert calls[1][:3] == ["git", "diff", "--name-only"]

    # Timeouts and invalid Git history are not evidence of no pending deploy.
    # The caller catches RuntimeError and enters the guarded full-deploy path.
    def timeout_fetch(argv, **kwargs):
        assert argv[1] == "fetch" and kwargs["timeout"] == 20
        raise subprocess.TimeoutExpired(argv, kwargs["timeout"])

    def timeout_diff(argv, **kwargs):
        if argv[1] == "fetch":
            assert kwargs["timeout"] == 20
            return Done()
        assert argv[1] == "diff" and kwargs["timeout"] == 15
        raise subprocess.TimeoutExpired(argv, kwargs["timeout"])

    def invalid_diff(argv, **kwargs):
        if argv[1] == "fetch":
            return Done()
        raise subprocess.CalledProcessError(128, argv)

    for failing_runner in (timeout_fetch, timeout_diff, invalid_diff):
        try:
            changed_files(a, b, runner=failing_runner)
        except RuntimeError as exc:
            assert "cumulative staging diff" in str(exc)
        else:
            raise AssertionError("unproven cumulative diff must fail open")

    print("staging-generation-diff self-test: OK")


if __name__ == "__main__":
    self_test()
