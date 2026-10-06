#!/usr/bin/env python3
"""Resolve the last complete staging generation and diff a new SHA against it."""
from __future__ import annotations

import json
import os
import subprocess
from collections.abc import Callable
from urllib.request import Request, urlopen

import staging_deploy_proof as proof
import staging_generation as generation

Runner = Callable[..., subprocess.CompletedProcess]
WORKFLOW_FILE = "staging-deploy.yml"


def successful_runs(repository: str, token: str) -> list[dict]:
    api = os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")
    url = (
        f"{api}/repos/{repository}/actions/workflows/{WORKFLOW_FILE}/runs"
        "?branch=main&status=success&per_page=20"
    )
    request = Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "chess-studio-staging-generation-diff/1",
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
    for run in runs:
        if not isinstance(run, dict) or str(run.get("conclusion") or "") != "success":
            continue
        sha = str(run.get("head_sha") or "").lower()
        run_id = int(run.get("id") or 0)
        if not generation.SHA_RE.fullmatch(sha) or run_id <= 0:
            continue
        if proof.deployed_generation(jobs_for_run(run_id)):
            return sha, run_id
    raise RuntimeError("no previous complete staging generation found")


def previous_complete_generation(repository: str, token: str) -> tuple[str, int]:
    runs = successful_runs(repository, token)
    return select_complete_generation(
        runs,
        lambda run_id: proof.fetch_jobs(repository, run_id, token),
    )


def changed_files(base_sha: str, head_sha: str, runner: Runner = subprocess.run) -> list[str]:
    base = generation.valid_sha(base_sha)
    head = generation.valid_sha(head_sha)
    if base == head:
        return []
    fetched = runner(
        ["git", "fetch", "--no-tags", "--depth=1", "origin", base],
        capture_output=True,
        text=True,
        check=False,
    )
    if fetched.returncode != 0:
        raise RuntimeError("could not fetch previous complete staging generation")
    diff = runner(
        ["git", "diff", "--name-only", base, head],
        capture_output=True,
        text=True,
        check=True,
    )
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
    sha, run_id = select_complete_generation(runs, lambda rid: jobs[rid])
    assert (sha, run_id) == (b, 29)

    same = changed_files(a, a, runner=lambda *args, **kwargs: None)
    assert same == []

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
    paths = changed_files(a, b, runner=fake_runner)
    assert paths == ["backend-python/app.py", "frontend/src/App.jsx"]
    assert calls[0][:3] == ["git", "fetch", "--no-tags"]
    assert calls[1][:3] == ["git", "diff", "--name-only"]
    print("staging-generation-diff self-test: OK")


if __name__ == "__main__":
    self_test()
