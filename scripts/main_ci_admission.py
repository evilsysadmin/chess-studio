#!/usr/bin/env python3
"""Fail-closed admission for a main SHA that reuses an already-green PR quality gate.

The pull request runs the expensive quality suites. After GitHub merges it, the
main push only needs to prove that the exact new main commit comes from a merged
PR whose current-base Quality · CI gate finished green with the required checks.
Staging can then consume the lightweight main workflow result without rerunning
the same browser, frontend, backend and security work.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
import subprocess
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

API_VERSION = "2022-11-28"
QUALITY_WORKFLOW = "Quality · CI gate"
QUALITY_PATH = ".github/workflows/cicd.yml"
REQUIRED_CHECKS: dict[str, set[str]] = {
    "Preflight · contracts": {"success"},
    "Tests · Frontend": {"success", "skipped"},
    "Tests · Backend": {"success", "skipped"},
    "Security · Trivy + Docker": {"success", "skipped"},
    "Tests · Playwright": {"success"},
}


class AdmissionError(RuntimeError):
    pass


@dataclass(frozen=True)
class Admission:
    pr_number: int
    pr_head_sha: str
    quality_run_id: int


def parse_time(value: str) -> datetime:
    if not value:
        raise AdmissionError("timestamp vacío en la acreditación")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def evaluate_admission(
    *,
    main_sha: str,
    first_parent: str,
    first_parent_time: datetime,
    pulls: list[dict[str, Any]],
    workflow_runs: list[dict[str, Any]],
    check_runs: list[dict[str, Any]],
) -> Admission:
    sha = main_sha.lower()
    parent = first_parent.lower()
    candidates = []
    for pr in pulls:
        base = pr.get("base") or {}
        if (
            pr.get("merged_at")
            and str(pr.get("merge_commit_sha") or "").lower() == sha
            and base.get("ref") == "main"
            and str(base.get("sha") or "").lower() == parent
        ):
            candidates.append(pr)

    if len(candidates) != 1:
        raise AdmissionError(
            f"main {main_sha[:12]} no acredita un único PR mergeado sobre su padre inmediato "
            f"({len(candidates)} candidatos)"
        )

    pr = candidates[0]
    head_sha = str((pr.get("head") or {}).get("sha") or "").lower()
    if len(head_sha) != 40:
        raise AdmissionError("el PR acreditado no expone un head SHA completo")
    merged_at = parse_time(str(pr.get("merged_at") or ""))

    eligible_runs = []
    for run in workflow_runs:
        if (
            run.get("event") == "pull_request"
            and run.get("name") == QUALITY_WORKFLOW
            and run.get("path") == QUALITY_PATH
            and str(run.get("head_sha") or "").lower() == head_sha
            and run.get("status") == "completed"
            and run.get("conclusion") == "success"
        ):
            created_at = parse_time(str(run.get("created_at") or ""))
            updated_at = parse_time(str(run.get("updated_at") or ""))
            if created_at >= first_parent_time and updated_at <= merged_at:
                eligible_runs.append(run)

    if not eligible_runs:
        raise AdmissionError(
            f"PR #{pr.get('number')} no tiene un {QUALITY_WORKFLOW!r} verde sobre la base actual"
        )

    eligible_runs.sort(key=lambda run: parse_time(str(run.get("updated_at") or "")), reverse=True)
    run = eligible_runs[0]
    suite_id = run.get("check_suite_id") or (run.get("check_suite") or {}).get("id")
    if not suite_id:
        raise AdmissionError("el run de calidad verde no expone check_suite_id")

    conclusions: dict[str, str] = {}
    for check in check_runs:
        check_suite = check.get("check_suite") or {}
        if check_suite.get("id") != suite_id:
            continue
        name = str(check.get("name") or "")
        if name in REQUIRED_CHECKS:
            conclusions[name] = str(check.get("conclusion") or "")

    bad = []
    for name, allowed in REQUIRED_CHECKS.items():
        conclusion = conclusions.get(name)
        if conclusion not in allowed:
            bad.append(f"{name}={conclusion or 'missing'} (esperado {sorted(allowed)})")
    if bad:
        raise AdmissionError("checks requeridos no acreditados: " + "; ".join(bad))

    return Admission(
        pr_number=int(pr.get("number") or 0),
        pr_head_sha=head_sha,
        quality_run_id=int(run.get("id") or 0),
    )


def api_get(path: str, token: str) -> Any:
    request = Request(
        f"https://api.github.com{path}",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": API_VERSION,
            "User-Agent": "chess-studio-main-ci-admission/1",
        },
    )
    try:
        with urlopen(request, timeout=15) as response:
            return json.load(response)
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise AdmissionError(f"GitHub API {path} devolvió HTTP {exc.code}: {detail}") from exc
    except (URLError, TimeoutError) as exc:
        raise AdmissionError(f"GitHub API no disponible para {path}: {exc}") from exc


def git_output(*args: str) -> str:
    try:
        return subprocess.check_output(["git", *args], text=True, stderr=subprocess.STDOUT).strip()
    except (OSError, subprocess.CalledProcessError) as exc:
        raise AdmissionError(f"git {' '.join(args)} falló: {exc}") from exc


def run_live() -> Admission:
    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    main_sha = os.environ.get("GITHUB_SHA", "").strip().lower()
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if not repo or "/" not in repo:
        raise AdmissionError("GITHUB_REPOSITORY ausente o inválido")
    if len(main_sha) != 40:
        raise AdmissionError("GITHUB_SHA debe ser un SHA completo")
    if not token:
        raise AdmissionError("GITHUB_TOKEN ausente")

    parents = git_output("show", "-s", "--format=%P", main_sha).split()
    if not parents:
        raise AdmissionError("main SHA no tiene padre; no se acredita un commit raíz")
    first_parent = parents[0].lower()
    first_parent_time = parse_time(git_output("show", "-s", "--format=%cI", first_parent))

    owner, repo_name = repo.split("/", 1)
    base = f"/repos/{quote(owner)}/{quote(repo_name)}"
    pulls = api_get(f"{base}/commits/{main_sha}/pulls", token)
    if not isinstance(pulls, list):
        raise AdmissionError("respuesta inesperada al buscar PR asociado")

    provisional = [
        pr for pr in pulls
        if pr.get("merged_at")
        and str(pr.get("merge_commit_sha") or "").lower() == main_sha
        and (pr.get("base") or {}).get("ref") == "main"
        and str((pr.get("base") or {}).get("sha") or "").lower() == first_parent
    ]
    if len(provisional) != 1:
        raise AdmissionError(
            f"main {main_sha[:12]} no procede de un único PR mergeado sobre {first_parent[:12]}"
        )
    head_sha = str((provisional[0].get("head") or {}).get("sha") or "").lower()

    runs_payload = api_get(
        f"{base}/actions/workflows/cicd.yml/runs?event=pull_request&head_sha={quote(head_sha)}&status=completed&per_page=20",
        token,
    )
    workflow_runs = (runs_payload or {}).get("workflow_runs") if isinstance(runs_payload, dict) else None
    if not isinstance(workflow_runs, list):
        raise AdmissionError("respuesta inesperada al buscar Quality · CI gate del PR")

    checks_payload = api_get(f"{base}/commits/{head_sha}/check-runs?per_page=100", token)
    check_runs = (checks_payload or {}).get("check_runs") if isinstance(checks_payload, dict) else None
    if not isinstance(check_runs, list):
        raise AdmissionError("respuesta inesperada al buscar checks del PR")

    return evaluate_admission(
        main_sha=main_sha,
        first_parent=first_parent,
        first_parent_time=first_parent_time,
        pulls=pulls,
        workflow_runs=workflow_runs,
        check_runs=check_runs,
    )


def fixture() -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    pr = {
        "number": 421,
        "merged_at": "2026-09-04T22:24:13Z",
        "merge_commit_sha": "b" * 40,
        "head": {"sha": "c" * 40},
        "base": {"ref": "main", "sha": "a" * 40},
    }
    run = {
        "id": 1566,
        "event": "pull_request",
        "name": QUALITY_WORKFLOW,
        "path": QUALITY_PATH,
        "head_sha": "c" * 40,
        "status": "completed",
        "conclusion": "success",
        "created_at": "2026-09-04T22:20:13Z",
        "updated_at": "2026-09-04T22:23:36Z",
        "check_suite_id": 99,
    }
    checks = [
        {"name": name, "conclusion": "success" if "success" in allowed else next(iter(allowed)), "check_suite": {"id": 99}}
        for name, allowed in REQUIRED_CHECKS.items()
    ]
    return pr, run, checks


def self_test() -> None:
    pr, run, checks = fixture()
    admission = evaluate_admission(
        main_sha="b" * 40,
        first_parent="a" * 40,
        first_parent_time=parse_time("2026-09-04T22:15:04Z"),
        pulls=[pr],
        workflow_runs=[run],
        check_runs=checks,
    )
    assert admission.pr_number == 421

    cases = []
    cases.append(("direct push", [], [run], list(checks)))
    cases.append(("stale PR gate", [pr], [{**run, "created_at": "2026-09-04T22:14:59Z"}], list(checks)))
    failed_checks = [
        {**item, "conclusion": "failure"} if item["name"] == "Tests · Playwright" else item
        for item in checks
    ]
    cases.append(("failed required check", [pr], [run], failed_checks))

    for label, pulls, runs, check_list in cases:
        try:
            evaluate_admission(
                main_sha="b" * 40,
                first_parent="a" * 40,
                first_parent_time=parse_time("2026-09-04T22:15:04Z"),
                pulls=pulls,
                workflow_runs=runs,
                check_runs=check_list,
            )
        except AdmissionError:
            pass
        else:
            raise AssertionError(f"self-test no rechazó: {label}")

    print("main-ci-admission self-test OK · green PR accepted; direct/stale/failed rejected")


def main() -> int:
    if "--self-test" in sys.argv:
        self_test()
        return 0
    try:
        admission = run_live()
    except AdmissionError as exc:
        print(f"MAIN ADMISSION FAIL: {exc}", file=sys.stderr)
        return 2
    print(
        f"Main admission OK · PR #{admission.pr_number} · head {admission.pr_head_sha[:12]} · "
        f"Quality run {admission.quality_run_id}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
