#!/usr/bin/env python3
"""Read-only warning when GitHub did not admit the Madrid daily release slot.

A green workflow run can be the DST companion cron with all deployment jobs
skipped. Inspect the gate job, never the workflow conclusion alone.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
import subprocess
import sys
from zoneinfo import ZoneInfo

MADRID = ZoneInfo("Europe/Madrid")
WORKFLOW = "production-promote.yml"
GATE_JOB = "Gate · staging accredited SHA"


def _gh_json(repository: str, path: str) -> dict:
    if not os.environ.get("GH_TOKEN"):
        raise RuntimeError("GH_TOKEN is required")
    proc = subprocess.run(
        ["gh", "api", "-H", "Accept: application/vnd.github+json", f"/repos/{repository}/{path}"],
        capture_output=True, text=True, check=False,
    )
    if proc.returncode:
        raise RuntimeError(proc.stderr.strip() or "GitHub API unavailable")
    payload = json.loads(proc.stdout)
    if not isinstance(payload, dict):
        raise ValueError("GitHub API returned non-object payload")
    return payload


def _parse_utc(value: str) -> datetime:
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("timestamp lacks timezone")
    return result.astimezone(timezone.utc)


def todays_runs(payload: dict, now: datetime) -> list[dict]:
    today = now.astimezone(MADRID).date()
    runs = payload.get("workflow_runs")
    if not isinstance(runs, list):
        raise ValueError("workflow_runs missing")
    result = []
    for run in runs:
        if not isinstance(run, dict) or run.get("event") != "schedule":
            continue
        if _parse_utc(str(run.get("created_at") or "")).astimezone(MADRID).date() == today:
            result.append(run)
    return result


def classify(runs: list[dict], jobs_by_run: dict[int, list[dict]]) -> tuple[bool, str]:
    if not runs:
        return False, "No scheduled production release workflow run was recorded today"
    companions = []
    for run in runs:
        run_id = run.get("id")
        if not isinstance(run_id, int):
            raise ValueError("run id invalid")
        jobs = jobs_by_run.get(run_id)
        if not isinstance(jobs, list):
            raise ValueError("jobs unavailable")
        gate = next((job for job in jobs if job.get("name") == GATE_JOB), None)
        if gate is None:
            companions.append(f"{run_id}: gate not created yet")
            continue
        if gate.get("conclusion") == "skipped":
            companions.append(f"{run_id}: companion slot skipped")
            continue
        status = gate.get("status")
        conclusion = gate.get("conclusion")
        if status == "completed" and conclusion not in {"success", "failure", "cancelled", "timed_out", "action_required"}:
            raise ValueError(f"unexpected gate conclusion: {conclusion!r}")
        return True, f"Release slot admitted in run {run_id}; gate {status}/{conclusion or 'pending'} (not proof of deployment)"
    return False, "No release slot admitted; " + "; ".join(companions)


def self_test() -> None:
    now = datetime(2026, 10, 30, 14, tzinfo=timezone.utc)
    today = {"id": 10, "event": "schedule", "created_at": "2026-10-30T12:04:22Z"}
    yesterday = {"id": 9, "event": "schedule", "created_at": "2026-10-29T12:04:22Z"}
    assert todays_runs({"workflow_runs": [today, yesterday]}, now) == [today]
    assert not classify([], {})[0]
    assert not classify([today], {10: [{"name": GATE_JOB, "conclusion": "skipped", "status": "completed"}]})[0]
    assert classify([today], {10: [{"name": GATE_JOB, "conclusion": "success", "status": "completed"}]})[0]
    assert classify([today], {10: [{"name": GATE_JOB, "conclusion": "failure", "status": "completed"}]})[0]
    assert not classify([today], {10: []})[0]
    assert not classify([today], {10: [{"name": "Other job", "conclusion": "success"}]})[0]
    assert todays_runs({"workflow_runs": [{"id": 3, "event": "workflow_dispatch", "created_at": today["created_at"]}]}, now) == []
    assert todays_runs({"workflow_runs": [{"id": 4, "event": "schedule", "created_at": "2026-10-29T23:30:00Z"}]}, now) != []
    assert todays_runs({"workflow_runs": [{"id": 5, "event": "schedule", "created_at": "2026-10-30T23:30:00Z"}]}, now) == []
    print("production release schedule watch: self-test OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.repository:
        parser.error("--repository is required")
    now = datetime.now(timezone.utc)
    try:
        payload = _gh_json(args.repository, f"actions/workflows/{WORKFLOW}/runs?event=schedule&branch=main&per_page=30")
        runs = todays_runs(payload, now)
        jobs = {}
        for run in runs:
            response = _gh_json(args.repository, f"actions/runs/{run['id']}/jobs?per_page=100")
            if not isinstance(response.get("jobs"), list):
                raise ValueError("jobs missing")
            jobs[run["id"]] = response["jobs"]
        admitted, message = classify(runs, jobs)
    except (RuntimeError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        print(f"::error title=Release schedule evidence unavailable::{exc}")
        return 1
    print(message)
    if not admitted:
        print("::error title=Daily release slot missing::No eligible Madrid 08:00 slot has been admitted; do not infer production deployment from green companion workflows.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
