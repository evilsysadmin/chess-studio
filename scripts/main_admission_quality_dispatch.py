#!/usr/bin/env python3
"""Exact-HEAD fallback for main admission: run the full Quality gate on main.

When a PR receipt cannot be reused (or main was pushed directly), admission used
to run ``make tests security-images compose-smoke`` serially in one job. That
replayed every Playwright spec, including visual-artifact and staging-only
producers that cannot pass on a hosted runner, and never finished inside the
job timeout, so staging stayed blocked.

This fallback proves the same families (frontend, backend, security, Docker
images, real compose stack and every required browser lane) by dispatching the
existing ``Quality · CI gate`` workflow on ``main`` in its fail-closed ``--all``
mode, in parallel, and waiting for that run on the exact admission SHA. No
bypass: the run must be green on this SHA. If main moves, the dispatched run is
for another SHA and admission fails (this generation is superseded anyway).
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

import main_ci_admission as admission

WORKFLOW_FILE = "cicd.yml"
DEFAULT_TIMEOUT_SECONDS = 95 * 60
DEFAULT_POLL_SECONDS = 30.0
DISPATCH_DISCOVERY_SECONDS = 180.0
CLOCK_SKEW_SECONDS = 30.0


def parse_time(value: str | None) -> float:
    if not value:
        return 0.0
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def dispatch_runs_for_sha(runs: list[dict[str, Any]], *, sha: str, since: float = 0.0) -> list[dict[str, Any]]:
    """Quality runs dispatched on main for exactly ``sha``, newest first."""
    target = sha.lower()
    selected = [
        run
        for run in runs
        if run.get("event") == "workflow_dispatch"
        and run.get("path") == admission.QUALITY_PATH
        and run.get("head_branch") == "main"
        and str(run.get("head_sha") or "").lower() == target
        and parse_time(run.get("created_at")) >= since - CLOCK_SKEW_SECONDS
    ]
    return sorted(selected, key=lambda run: parse_time(run.get("created_at")), reverse=True)


def reusable_run(runs: list[dict[str, Any]], *, sha: str) -> dict[str, Any] | None:
    """A green or still-running dispatched Quality for this SHA can be reused."""
    for run in dispatch_runs_for_sha(runs, sha=sha):
        if run.get("status") != "completed" or run.get("conclusion") == "success":
            return run
    return None


def verdict(run: dict[str, Any]) -> tuple[bool, str]:
    url = run.get("html_url") or f"run {run.get('id')}"
    if run.get("status") != "completed":
        return False, f"Quality sigue en curso: {url}"
    if run.get("conclusion") == "success":
        return True, f"Quality exacto en verde: {url}"
    return False, f"Quality exacto terminó {run.get('conclusion')}: {url}"


def api_post(path: str, token: str, body: dict[str, Any]) -> None:
    request: Request = admission.github_request(path, token)
    request.method = "POST"
    request.data = json.dumps(body).encode("utf-8")
    request.add_header("Content-Type", "application/json")
    try:
        with urlopen(request, timeout=15) as response:
            response.read()
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise admission.AdmissionError(f"GitHub API {path} devolvió HTTP {exc.code}: {detail}") from exc
    except (URLError, TimeoutError) as exc:
        raise admission.AdmissionError(f"GitHub API no disponible para {path}: {exc}") from exc


def list_dispatch_runs(base: str, token: str) -> list[dict[str, Any]]:
    payload = admission.api_get(
        f"{base}/actions/workflows/{WORKFLOW_FILE}/runs?event=workflow_dispatch&branch=main&per_page=20",
        token,
    )
    runs = (payload or {}).get("workflow_runs") if isinstance(payload, dict) else None
    if not isinstance(runs, list):
        raise admission.AdmissionError("respuesta inesperada al listar Quality · CI gate manuales")
    return runs


def run_fallback() -> int:
    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    sha = os.environ.get("GITHUB_SHA", "").strip().lower()
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if not repo or "/" not in repo:
        raise admission.AdmissionError("GITHUB_REPOSITORY ausente o inválido")
    if len(sha) != 40:
        raise admission.AdmissionError("GITHUB_SHA debe ser un SHA completo")
    if not token:
        raise admission.AdmissionError("GITHUB_TOKEN ausente")
    timeout = float(os.environ.get("MAIN_ADMISSION_QUALITY_TIMEOUT_SECONDS") or DEFAULT_TIMEOUT_SECONDS)
    poll = float(os.environ.get("MAIN_ADMISSION_QUALITY_POLL_SECONDS") or DEFAULT_POLL_SECONDS)
    owner, name = repo.split("/", 1)
    base = f"/repos/{quote(owner)}/{quote(name)}"

    run = reusable_run(list_dispatch_runs(base, token), sha=sha)
    if run:
        print(f"Reutilizando Quality manual existente para {sha[:12]}: {run.get('html_url')}")
    else:
        started = time.time()
        api_post(f"{base}/actions/workflows/{WORKFLOW_FILE}/dispatches", token, {"ref": "main"})
        print(f"Quality · CI gate (--all) lanzado sobre main para {sha[:12]}; esperando su run…")
        deadline = started + DISPATCH_DISCOVERY_SECONDS
        while run is None:
            runs = list_dispatch_runs(base, token)
            matches = dispatch_runs_for_sha(runs, sha=sha, since=started)
            if matches:
                run = matches[0]
                break
            newer = [r for r in runs if r.get("event") == "workflow_dispatch" and parse_time(r.get("created_at")) >= started - CLOCK_SKEW_SECONDS]
            if newer:
                raise admission.AdmissionError(
                    "main avanzó: el Quality lanzado corre sobre otro SHA; esta admisión queda superseded"
                )
            if time.time() > deadline:
                raise admission.AdmissionError("no apareció el run de Quality lanzado")
            time.sleep(10)
        print(f"Esperando a {run.get('html_url')}")

    deadline = time.time() + timeout
    run_id = run.get("id")
    while True:
        run = admission.api_get(f"{base}/actions/runs/{run_id}", token)
        ok, message = verdict(run)
        if run.get("status") == "completed":
            print(message)
            if not ok:
                print(f"::error title=Main admission fallback::{message}")
            return 0 if ok else 1
        if time.time() > deadline:
            print(f"::error title=Main admission fallback::{message} (timeout esperando)")
            return 1
        time.sleep(poll)


def self_test() -> None:
    sha = "a" * 40
    other = "b" * 40
    t0 = "2026-10-04T08:00:00Z"
    t1 = "2026-10-04T08:05:00Z"

    def mk(i: int, head: str, created: str, status: str = "completed", conclusion: str | None = "success", event: str = "workflow_dispatch", branch: str = "main") -> dict[str, Any]:
        return {"id": i, "head_sha": head, "created_at": created, "status": status, "conclusion": conclusion,
                "event": event, "head_branch": branch, "path": admission.QUALITY_PATH, "html_url": f"u{i}"}

    runs = [
        mk(1, sha, t0, conclusion="failure"),
        mk(2, sha, t1, status="in_progress", conclusion=None),
        mk(3, other, t1),
        mk(4, sha, t1, event="pull_request"),
        mk(5, sha, t1, branch="feature"),
    ]
    assert [r["id"] for r in dispatch_runs_for_sha(runs, sha=sha)] == [2, 1]
    assert [r["id"] for r in dispatch_runs_for_sha(runs, sha=sha, since=parse_time(t1))] == [2]
    assert reusable_run(runs, sha=sha)["id"] == 2
    assert reusable_run([mk(1, sha, t0, conclusion="failure")], sha=sha) is None
    assert reusable_run([mk(7, sha, t0)], sha=sha)["id"] == 7
    assert reusable_run(runs, sha="c" * 40) is None
    assert verdict(mk(1, sha, t0))[0] is True
    assert verdict(mk(1, sha, t0, conclusion="cancelled"))[0] is False
    assert verdict(mk(1, sha, t0, status="queued", conclusion=None))[0] is False
    print("main-admission-quality-dispatch self-test OK")


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        self_test()
        return 0
    try:
        return run_fallback()
    except admission.AdmissionError as exc:
        print(f"::error title=Main admission fallback::{exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
