#!/usr/bin/env python3
"""Read-only timing receipt for a completed staging generation.

Runs inside the existing staging summary job. Its output is diagnostic only:
it must never decide deployment, accreditation, rollback or promotion.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import re
from urllib.request import Request, urlopen

SHA_RE = re.compile(r"^[0-9a-f]{40}$")
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
STAGING_JOBS = (
    "Prepare coherent staging generation",
    "Backend · exact OCI generation",
    "Frontend · exact Pages generation",
    "Worker · exact AI generation",
    "Browser smoke · War Room live",
    "Browser smoke · authoritative F5 restore",
)
MAIN_JOBS = (
    "Main · classify HEAD provenance",
    "Main · accredited PR gate",
    "Main · direct HEAD full fallback gate",
    "Main · prebuild staging frontend",
)


def seconds(start: str | None, end: str | None) -> float | None:
    try:
        if not start or not end:
            return None
        a = datetime.fromisoformat(start.replace("Z", "+00:00"))
        b = datetime.fromisoformat(end.replace("Z", "+00:00"))
        value = (b - a).total_seconds()
        return value if value >= 0 else None
    except (TypeError, ValueError, OverflowError):
        return None


def step_conclusion(job: dict, name: str) -> str:
    for step in job.get("steps") or ():
        if step.get("name") == name:
            return str(step.get("conclusion") or "pending")
    return "unknown"


def report_path(jobs: list[dict], upstream_jobs: list[dict]) -> tuple[str, str, str]:
    by_name = {job.get("name"): job for job in jobs}
    frontend = by_name.get("Frontend · exact Pages generation", {})
    backend = by_name.get("Backend · exact OCI generation", {})
    built = step_conclusion(frontend, "Build frontend for staging")
    if built == "skipped":
        artifact = "reutilizado (build omitido)"
    elif built == "success":
        artifact = "recompilado en staging"
    else:
        artifact = "no determinado"

    watcher = step_conclusion(backend, "Wait for zero-cost host watcher fast-path")
    admission = step_conclusion(backend, "Re-check main before OCI fallback")
    sdk = step_conclusion(backend, "Restore cached OCI SDK toolchain")
    if watcher == "success" and admission == "skipped":
        backend_path = "watcher acreditado (sin SDK)"
    elif sdk == "success":
        backend_path = "fallback OCI preparado; Run Command no confirmado"
    elif admission == "success" and sdk == "skipped":
        backend_path = "fallback evitado / generación obsoleta"
    else:
        backend_path = "no determinado"

    upstream = {job.get("name"): job for job in upstream_jobs}
    gate = upstream.get("Main · accredited PR gate") or upstream.get("Main · direct HEAD full fallback gate") or {}
    fallback = step_conclusion(gate, "Full exact-HEAD quality fallback")
    if fallback == "success":
        admission_path = "Quality exact-HEAD (fallback)"
    elif fallback == "skipped":
        admission_path = "recibo Quality de PR reutilizado"
    else:
        admission_path = "sin detalle de admisión"
    return artifact, backend_path, admission_path


def table_rows(jobs: list[dict], names: tuple[str, ...]) -> list[str]:
    indexed = {j.get("name"): j for j in jobs}
    rows = []
    for name in names:
        job = indexed.get(name)
        if not job:
            continue
        elapsed = seconds(job.get("started_at"), job.get("completed_at"))
        value = f"{elapsed / 60:.2f}" if elapsed is not None else "—"
        conclusion = str(job.get("conclusion") or "en curso")
        rows.append(f"| {name} | {conclusion} | {value} |")
    return rows


def totals(jobs: list[dict], names: tuple[str, ...]) -> tuple[float, float | None]:
    selected = [j for j in jobs if j.get("name") in names and j.get("conclusion") not in ("skipped", None)]
    durations = [seconds(j.get("started_at"), j.get("completed_at")) for j in selected]
    runner_seconds = sum(s for s in durations if s is not None)
    starts = [j.get("started_at") for j in selected if j.get("started_at") and j.get("completed_at")]
    ends = [j.get("completed_at") for j in selected if j.get("started_at") and j.get("completed_at")]
    wall = seconds(min(starts), max(ends)) if starts and ends else None
    return runner_seconds, wall


def render(sha: str, jobs: list[dict], upstream_jobs: list[dict]) -> str:
    artifact, backend, admission = report_path(jobs, upstream_jobs)
    runner, wall = totals(jobs, STAGING_JOBS)
    upstream_runner, upstream_wall = totals(upstream_jobs, MAIN_JOBS)
    lines = [
        f"### Staging timings · {sha[:12]}",
        "",
        f"- Frontend artifact: **{artifact}**",
        f"- OCI path: **{backend}**",
        f"- Main admission: **{admission}**",
        f"- Staging stages: **{runner / 60:.2f} accumulated job-min**"
        + (f", **{wall / 60:.2f} min wall span**" if wall is not None else ""),
        f"- Main admission/prebuild: **{upstream_runner / 60:.2f} accumulated job-min**"
        + (f", **{upstream_wall / 60:.2f} min wall span**" if upstream_wall is not None else ""),
        "",
        "Job-min is a concurrency-aware duration proxy, not GitHub billing; wall span excludes queue delay and summary.",
        "",
        "| Stage | Result | Job minutes |",
        "| --- | --- | ---: |",
        *table_rows(upstream_jobs, MAIN_JOBS),
        *table_rows(jobs, STAGING_JOBS),
        "",
    ]
    return "\n".join(lines)


def fetch_jobs(repository: str, run_id: int, token: str) -> list[dict]:
    if not REPO_RE.fullmatch(repository) or run_id < 1 or not token:
        raise ValueError("invalid metrics request")
    url = f"https://api.github.com/repos/{repository}/actions/runs/{run_id}/jobs?per_page=100"
    request = Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "chess-studio-staging-metrics/1",
    })
    with urlopen(request, timeout=12) as response:
        payload = json.load(response)
    jobs = payload.get("jobs")
    if not isinstance(jobs, list) or len(jobs) >= 100:
        raise ValueError("incomplete workflow job list")
    return jobs


def upstream_id() -> int:
    try:
        path = os.environ.get("GITHUB_EVENT_PATH", "")
        event = json.loads(Path(path).read_text(encoding="utf-8"))
        return int((event.get("workflow_run") or {}).get("id") or 0)
    except (OSError, ValueError, TypeError, AttributeError, json.JSONDecodeError):
        return 0


def self_test() -> None:
    sha = "a" * 40
    start, end = "2026-10-13T10:00:00Z", "2026-10-13T10:01:00Z"
    mk = lambda name, steps=(): dict(name=name, started_at=start, completed_at=end,
                                      conclusion="success", steps=list(steps))
    step = lambda name, conclusion: dict(name=name, conclusion=conclusion)
    backend = mk(STAGING_JOBS[1], [
        step("Wait for zero-cost host watcher fast-path", "success"),
        step("Re-check main before OCI fallback", "skipped"),
        step("Restore cached OCI SDK toolchain", "skipped"),
    ])
    frontend = mk(STAGING_JOBS[2], [step("Build frontend for staging", "skipped")])
    main = [mk(MAIN_JOBS[1], [step("Full exact-HEAD quality fallback", "skipped")])]
    jobs = [mk(STAGING_JOBS[0]), backend, frontend]
    assert seconds(start, end) == 60.0
    assert seconds(end, start) is None
    assert seconds("invalid", end) is None
    assert report_path(jobs, main) == (
        "reutilizado (build omitido)", "watcher acreditado (sin SDK)",
        "recibo Quality de PR reutilizado",
    )
    assert totals(jobs, STAGING_JOBS) == (180.0, 60.0)
    assert "| Backend · exact OCI generation | success | 1.00 |" in render(sha, jobs, main)
    assert "accumulated job-min" in render(sha, jobs, main)
    backend["steps"] = [step("Restore cached OCI SDK toolchain", "success")]
    frontend["steps"] = [step("Build frontend for staging", "success")]
    assert "fallback OCI preparado" in report_path(jobs, main)[1]
    assert report_path(jobs, main)[0] == "recompilado en staging"
    assert report_path(jobs, [mk(MAIN_JOBS[1], [step("Full exact-HEAD quality fallback", "success")])])[2].startswith("Quality exact-HEAD")
    assert step_conclusion({}, "missing") == "unknown"
    print("staging-deploy-metrics self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    sha = os.environ.get("DEPLOY_SHA", "")
    destination = os.environ.get("GITHUB_STEP_SUMMARY", "")
    if not SHA_RE.fullmatch(sha) or not destination:
        print("::warning title=Staging metrics::missing SHA or summary path")
        return 0
    headline = f"### Staging {sha} · backend={os.environ.get('BACKEND', '?')} · frontend={os.environ.get('FRONTEND', '?')} · worker={os.environ.get('WORKER', '?')} · smoke={os.environ.get('SMOKE', '?')}\n\n"
    try:
        repository = os.environ.get("GITHUB_REPOSITORY", "")
        token = os.environ.get("GH_TOKEN", "")
        jobs = fetch_jobs(repository, int(os.environ.get("GITHUB_RUN_ID", "0")), token)
        source_id = upstream_id()
        upstream = fetch_jobs(repository, source_id, token) if source_id else []
        detail = render(sha, jobs, upstream)
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
        detail = f"Staging timing receipt unavailable ({type(exc).__name__}); release gating unchanged.\n"
        print(f"::warning title=Staging metrics unavailable::{type(exc).__name__}")
    with Path(destination).open("a", encoding="utf-8") as handle:
        handle.write(headline + detail + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
