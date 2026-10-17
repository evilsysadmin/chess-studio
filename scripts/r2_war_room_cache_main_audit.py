#!/usr/bin/env python3
"""Read-only audit of the *main push* Cloudflare cache deployment workflow.

PR GitHub API connector results only enumerate PR runs. The existing GitHub
Actions token can inspect push runs from this PR instead; print only run/job/
step status metadata, never log text, request headers, or Cloudflare secrets.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

WORKFLOW = "war-room-r2-cache-rule.yml"
EXACT_JOB = "Reconcile narrow Cloudflare GLB Cache Rule"


def parse_runs(data: object) -> list[dict]:
    if not isinstance(data, dict) or not isinstance(data.get("workflow_runs"), list):
        raise ValueError("Unexpected GitHub workflow-runs response")
    records = []
    for item in data["workflow_runs"]:
        if not isinstance(item, dict) or item.get("event") != "push":
            continue
        if item.get("head_branch") != "main":
            continue
        records.append({
            "id": int(item["id"]),
            "sha": str(item.get("head_sha", ""))[:12],
            "createdAt": item.get("created_at"),
            "status": item.get("status"),
            "conclusion": item.get("conclusion"),
            "htmlUrl": item.get("html_url"),
        })
    return records


def parse_jobs(data: object) -> list[dict]:
    if not isinstance(data, dict) or not isinstance(data.get("jobs"), list):
        raise ValueError("Unexpected GitHub workflow-jobs response")
    jobs = []
    for job in data["jobs"]:
        if not isinstance(job, dict) or job.get("name") != EXACT_JOB:
            continue
        jobs.append({
            "name": EXACT_JOB,
            "status": job.get("status"),
            "conclusion": job.get("conclusion"),
            "steps": [
                {"name": str(s.get("name", ""))[:110],
                 "status": s.get("status"), "conclusion": s.get("conclusion")}
                for s in job.get("steps", [])
                if isinstance(s, dict)
            ],
        })
    return jobs


def api_get(path: str, *, token: str, request_open=urllib.request.urlopen) -> object:
    if not token:
        raise RuntimeError("Missing GH_TOKEN: PR job needs actions:read")
    request = urllib.request.Request(
        "https://api.github.com" + path,
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "chess-studio-warroom-cache-main-audit/1",
        },
    )
    try:
        with request_open(request, timeout=25) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        # No response body or auth header printed: GitHub may echo details.
        raise RuntimeError(f"GitHub Actions read returned HTTP {exc.code}") from exc


def audit(repo: str, *, token: str, get=api_get) -> dict:
    if not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]*/[A-Za-z0-9_][A-Za-z0-9_.-]*", repo):
        raise ValueError("Invalid repository")
    project = "/repos/" + repo
    workflow = urllib.parse.quote(WORKFLOW, safe="")
    runs = parse_runs(get(
        f"{project}/actions/workflows/{workflow}/runs?event=push&branch=main&per_page=12",
        token=token,
    ))[:6]
    for run in runs:
        run["reconcileJobs"] = parse_jobs(get(
            f'{project}/actions/runs/{run["id"]}/jobs?per_page=100',
            token=token,
        ))
    return {
        "workflow": WORKFLOW,
        "scope": "main push only, read-only job/step metadata",
        "runsFound": len(runs),
        "runs": runs,
        "note": (
            "A PR validation success does NOT prove the Cloudflare cache rule was "
            "applied. Reconcile main job needs success AND a second CDN GET HIT."
        ),
    }


def self_test() -> None:
    runs = parse_runs({"workflow_runs": [
        {"event": "pull_request", "head_branch": "main", "id": 1},
        {"event": "push", "head_branch": "main", "id": 2, "head_sha": "a" * 40,
         "status": "completed", "conclusion": "failure", "html_url": "https://github.com/example"},
        {"event": "push", "head_branch": "elsewhere", "id": 3},
    ]})
    assert len(runs) == 1 and runs[0]["id"] == 2
    jobs = parse_jobs({"jobs": [
        {"name": "Validate exact V3/V4-only cache expression", "conclusion": "success"},
        {"name": EXACT_JOB, "status": "completed", "conclusion": "failure",
         "steps": [{"name": "Require actual Zone Cache Rules permission",
                    "status": "completed", "conclusion": "success"},
                   {"name": "Idempotently add/update only our exact hash-key rule",
                    "status": "completed", "conclusion": "failure"}]},
    ]})
    assert len(jobs) == 1 and jobs[0]["steps"][-1]["conclusion"] == "failure"
    seen = []
    def fake_get(path, *, token):
        assert token == "test-token"
        seen.append(path)
        if "/jobs?" in path:
            return {"jobs": [{"name": EXACT_JOB, "status": "completed", "conclusion": "failure", "steps": []}]}
        return {"workflow_runs": [{"event": "push", "head_branch": "main", "id": 14}]}
    result = audit("evilsysadmin/chess-studio", token="test-token", get=fake_get)
    assert result["runsFound"] == 1 and len(seen) == 2
    assert "event=push" in seen[0] and "/runs/14/jobs" in seen[1]
    assert result["runs"][0]["reconcileJobs"][0]["conclusion"] == "failure"
    try:
        audit("../bad", token="test-token", get=fake_get)
    except ValueError:
        pass
    else:
        raise AssertionError("Unsafe repository must be rejected")
    print("War Room main cache-deploy audit self-test OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("self-test", "recent"))
    args = parser.parse_args()
    if args.command == "self-test":
        self_test()
    else:
        report = audit(os.environ.get("GITHUB_REPOSITORY", ""),
                       token=os.environ.get("GH_TOKEN", ""))
        print(json.dumps(report, indent=2, sort_keys=True))
        if not report["runsFound"]:
            print("NO MAIN PUSH RUN FOUND: verify workflow push trigger/path filter")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
