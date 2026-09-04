#!/usr/bin/env python3
"""Fail-closed admission for a main SHA that reuses an already-green PR quality gate.

The expensive suites run on the pull request. Each PR Quality run publishes a
small immutable provenance artifact describing the exact synthetic merge commit
that its jobs tested. After merge, main admission accepts the new main SHA only
when that receipt proves the tested base is the final commit's first parent.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
import json
import os
import subprocess
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen
from zipfile import BadZipFile, ZipFile

API_VERSION = "2022-11-28"
QUALITY_WORKFLOW = "Quality · CI gate"
QUALITY_PATH = ".github/workflows/cicd.yml"
PROVENANCE_ARTIFACT = "quality-provenance"
PROVENANCE_FILE = "quality-provenance.json"
PROVENANCE_SCHEMA = 1
REDIRECT_CODES = {301, 302, 303, 307, 308}
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
    tested_merge_sha: str


class _NoRedirect(HTTPRedirectHandler):
    """Expose GitHub's artifact redirect instead of forwarding auth cross-host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def parse_time(value: str) -> datetime:
    if not value:
        raise AdmissionError("timestamp vacío en la acreditación")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def provenance_matches(
    provenance: dict[str, Any] | None,
    *,
    pr_number: int,
    head_sha: str,
    base_sha: str,
) -> bool:
    if not isinstance(provenance, dict):
        return False
    return (
        provenance.get("schema") == PROVENANCE_SCHEMA
        and int(provenance.get("pr_number") or 0) == pr_number
        and str(provenance.get("head_sha") or "").lower() == head_sha
        and str(provenance.get("base_sha") or "").lower() == base_sha
        and len(str(provenance.get("tested_merge_sha") or "")) == 40
    )


def evaluate_admission(
    *,
    main_sha: str,
    first_parent: str,
    first_parent_time: datetime,
    pulls: list[dict[str, Any]],
    workflow_runs: list[dict[str, Any]],
    check_runs: list[dict[str, Any]],
    provenances: dict[int, dict[str, Any]],
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
        ):
            candidates.append(pr)

    if len(candidates) != 1:
        raise AdmissionError(
            f"main {main_sha[:12]} no acredita un único PR mergeado a main "
            f"({len(candidates)} candidatos)"
        )

    pr = candidates[0]
    pr_number = int(pr.get("number") or 0)
    head_sha = str((pr.get("head") or {}).get("sha") or "").lower()
    if not pr_number or len(head_sha) != 40:
        raise AdmissionError("el PR acreditado no expone número/head SHA completos")
    merged_at = parse_time(str(pr.get("merged_at") or ""))

    eligible_runs = []
    for run in workflow_runs:
        run_id = int(run.get("id") or 0)
        provenance = provenances.get(run_id)
        if (
            run_id
            and run.get("event") == "pull_request"
            and run.get("name") == QUALITY_WORKFLOW
            and run.get("path") == QUALITY_PATH
            and str(run.get("head_sha") or "").lower() == head_sha
            and run.get("status") == "completed"
            and run.get("conclusion") == "success"
            and provenance_matches(
                provenance,
                pr_number=pr_number,
                head_sha=head_sha,
                base_sha=parent,
            )
        ):
            created_at = parse_time(str(run.get("created_at") or ""))
            updated_at = parse_time(str(run.get("updated_at") or ""))
            # The immutable receipt is authoritative. PR/run API base metadata
            # may lag while GitHub regenerates refs/pull/*/merge.
            if created_at >= first_parent_time and updated_at <= merged_at:
                eligible_runs.append(run)

    if not eligible_runs:
        raise AdmissionError(
            f"PR #{pr_number} no tiene un {QUALITY_WORKFLOW!r} verde cuyo "
            f"recibo pruebe la base exacta {parent[:12]}"
        )

    eligible_runs.sort(
        key=lambda run: parse_time(str(run.get("updated_at") or "")),
        reverse=True,
    )
    run = eligible_runs[0]
    run_id = int(run.get("id") or 0)
    provenance = provenances[run_id]
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
            bad.append(
                f"{name}={conclusion or 'missing'} (esperado {sorted(allowed)})"
            )
    if bad:
        raise AdmissionError("checks requeridos no acreditados: " + "; ".join(bad))

    return Admission(
        pr_number=pr_number,
        pr_head_sha=head_sha,
        quality_run_id=run_id,
        tested_merge_sha=str(provenance.get("tested_merge_sha") or "").lower(),
    )


def github_request(path: str, token: str) -> Request:
    return Request(
        f"https://api.github.com{path}",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": API_VERSION,
            "User-Agent": "chess-studio-main-ci-admission/3",
        },
    )


def external_download_request(location: str) -> Request:
    """Build the signed artifact request without leaking GitHub credentials."""
    target = urlsplit(location)
    if target.scheme != "https" or not target.hostname:
        raise AdmissionError("redirect de artefacto inválido o no HTTPS")
    if target.hostname.lower() == "api.github.com":
        raise AdmissionError("redirect de artefacto inesperadamente vuelve a api.github.com")
    return Request(
        location,
        headers={"User-Agent": "chess-studio-main-ci-admission/3"},
    )


def api_get(path: str, token: str) -> Any:
    try:
        with urlopen(github_request(path, token), timeout=15) as response:
            return json.load(response)
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise AdmissionError(
            f"GitHub API {path} devolvió HTTP {exc.code}: {detail}"
        ) from exc
    except (URLError, TimeoutError) as exc:
        raise AdmissionError(f"GitHub API no disponible para {path}: {exc}") from exc


def api_get_bytes(path: str, token: str) -> bytes:
    """Download a GitHub artifact without forwarding Authorization to storage.

    GitHub's artifact endpoint redirects to a short-lived signed object-storage
    URL. urllib otherwise carries the original Authorization header across that
    host boundary, which Azure rejects with InvalidAuthenticationInfo.
    """
    opener = build_opener(_NoRedirect())
    try:
        with opener.open(github_request(path, token), timeout=20) as response:
            return response.read()
    except HTTPError as exc:
        if exc.code not in REDIRECT_CODES:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise AdmissionError(
                f"GitHub API {path} devolvió HTTP {exc.code}: {detail}"
            ) from exc
        location = exc.headers.get("Location") or ""
    except (URLError, TimeoutError) as exc:
        raise AdmissionError(f"GitHub API no disponible para {path}: {exc}") from exc

    request = external_download_request(location)
    try:
        with urlopen(request, timeout=20) as response:
            return response.read()
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise AdmissionError(
            f"descarga firmada del artefacto devolvió HTTP {exc.code}: {detail}"
        ) from exc
    except (URLError, TimeoutError) as exc:
        raise AdmissionError(
            f"descarga firmada del artefacto no disponible: {exc}"
        ) from exc


def fetch_run_provenance(
    api_base: str,
    run_id: int,
    token: str,
) -> dict[str, Any] | None:
    payload = api_get(f"{api_base}/actions/runs/{run_id}/artifacts?per_page=100", token)
    artifacts = (payload or {}).get("artifacts") if isinstance(payload, dict) else None
    if not isinstance(artifacts, list):
        raise AdmissionError(
            f"respuesta inesperada al buscar artefactos del Quality run {run_id}"
        )
    matches = [
        item
        for item in artifacts
        if item.get("name") == PROVENANCE_ARTIFACT and not item.get("expired")
    ]
    if len(matches) != 1:
        return None

    artifact_id = int(matches[0].get("id") or 0)
    if not artifact_id:
        return None
    raw = api_get_bytes(f"{api_base}/actions/artifacts/{artifact_id}/zip", token)
    try:
        with ZipFile(BytesIO(raw)) as archive:
            names = [
                name
                for name in archive.namelist()
                if name.rsplit("/", 1)[-1] == PROVENANCE_FILE
            ]
            if len(names) != 1:
                return None
            payload = json.loads(archive.read(names[0]).decode("utf-8"))
    except (BadZipFile, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AdmissionError(
            f"artefacto de procedencia inválido en Quality run {run_id}: {exc}"
        ) from exc
    return payload if isinstance(payload, dict) else None


def git_output(*args: str) -> str:
    try:
        return subprocess.check_output(
            ["git", *args], text=True, stderr=subprocess.STDOUT
        ).strip()
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
    first_parent_time = parse_time(
        git_output("show", "-s", "--format=%cI", first_parent)
    )

    owner, repo_name = repo.split("/", 1)
    base = f"/repos/{quote(owner)}/{quote(repo_name)}"
    pulls = api_get(f"{base}/commits/{main_sha}/pulls", token)
    if not isinstance(pulls, list):
        raise AdmissionError("respuesta inesperada al buscar PR asociado")

    provisional = [
        pr
        for pr in pulls
        if pr.get("merged_at")
        and str(pr.get("merge_commit_sha") or "").lower() == main_sha
        and (pr.get("base") or {}).get("ref") == "main"
    ]
    if len(provisional) != 1:
        raise AdmissionError(
            f"main {main_sha[:12]} no procede de un único PR mergeado a main"
        )
    head_sha = str((provisional[0].get("head") or {}).get("sha") or "").lower()

    runs_payload = api_get(
        f"{base}/actions/workflows/cicd.yml/runs"
        f"?event=pull_request&head_sha={quote(head_sha)}&status=completed&per_page=20",
        token,
    )
    workflow_runs = (
        (runs_payload or {}).get("workflow_runs")
        if isinstance(runs_payload, dict)
        else None
    )
    if not isinstance(workflow_runs, list):
        raise AdmissionError(
            "respuesta inesperada al buscar Quality · CI gate del PR"
        )

    provenances: dict[int, dict[str, Any]] = {}
    for run in workflow_runs:
        if run.get("conclusion") != "success":
            continue
        run_id = int(run.get("id") or 0)
        if not run_id:
            continue
        provenance = fetch_run_provenance(base, run_id, token)
        if provenance is not None:
            provenances[run_id] = provenance

    checks_payload = api_get(
        f"{base}/commits/{head_sha}/check-runs?per_page=100",
        token,
    )
    check_runs = (
        (checks_payload or {}).get("check_runs")
        if isinstance(checks_payload, dict)
        else None
    )
    if not isinstance(check_runs, list):
        raise AdmissionError("respuesta inesperada al buscar checks del PR")

    return evaluate_admission(
        main_sha=main_sha,
        first_parent=first_parent,
        first_parent_time=first_parent_time,
        pulls=pulls,
        workflow_runs=workflow_runs,
        check_runs=check_runs,
        provenances=provenances,
    )


def fixture() -> tuple[
    dict[str, Any],
    dict[str, Any],
    list[dict[str, Any]],
    dict[int, dict[str, Any]],
]:
    pr = {
        "number": 421,
        "merged_at": "2026-09-04T22:24:13Z",
        "merge_commit_sha": "b" * 40,
        "head": {"sha": "c" * 40},
        "base": {"ref": "main", "sha": "e" * 40},
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
        # Deliberately stale API metadata: admission must ignore this base and
        # trust the immutable artifact below.
        "pull_requests": [
            {
                "number": 421,
                "head": {"sha": "c" * 40},
                "base": {"ref": "main", "sha": "e" * 40},
            }
        ],
    }
    checks = [
        {"name": name, "conclusion": "success", "check_suite": {"id": 99}}
        for name in REQUIRED_CHECKS
    ]
    provenances = {
        1566: {
            "schema": PROVENANCE_SCHEMA,
            "pr_number": 421,
            "tested_merge_sha": "f" * 40,
            "base_sha": "a" * 40,
            "head_sha": "c" * 40,
        }
    }
    return pr, run, checks, provenances


def assert_rejected(
    label: str,
    *,
    pr: dict[str, Any],
    run: dict[str, Any],
    checks: list[dict[str, Any]],
    provenances: dict[int, dict[str, Any]],
    first_parent: str = "a" * 40,
) -> None:
    try:
        evaluate_admission(
            main_sha="b" * 40,
            first_parent=first_parent,
            first_parent_time=parse_time("2026-09-04T22:15:04Z"),
            pulls=[pr],
            workflow_runs=[run],
            check_runs=checks,
            provenances=provenances,
        )
    except AdmissionError:
        return
    raise AssertionError(f"self-test no rechazó: {label}")


def self_test() -> None:
    pr, run, checks, provenances = fixture()
    admission = evaluate_admission(
        main_sha="b" * 40,
        first_parent="a" * 40,
        first_parent_time=parse_time("2026-09-04T22:15:04Z"),
        pulls=[pr],
        workflow_runs=[run],
        check_runs=checks,
        provenances=provenances,
    )
    assert admission.pr_number == 421
    assert admission.tested_merge_sha == "f" * 40

    scoped_checks = [
        {**item, "conclusion": "skipped"}
        if item["name"] in {"Tests · Backend", "Security · Trivy + Docker"}
        else item
        for item in checks
    ]
    scoped = evaluate_admission(
        main_sha="b" * 40,
        first_parent="a" * 40,
        first_parent_time=parse_time("2026-09-04T22:15:04Z"),
        pulls=[pr],
        workflow_runs=[run],
        check_runs=scoped_checks,
        provenances=provenances,
    )
    assert scoped.quality_run_id == 1566

    assert_rejected(
        "direct push",
        pr={**pr, "merge_commit_sha": "d" * 40},
        run=run,
        checks=checks,
        provenances=provenances,
    )
    assert_rejected(
        "wrong base parent",
        pr=pr,
        run=run,
        checks=checks,
        provenances=provenances,
        first_parent="d" * 40,
    )
    stale_provenance = {
        1566: {**provenances[1566], "base_sha": "d" * 40}
    }
    assert_rejected(
        "stale provenance base",
        pr=pr,
        run=run,
        checks=checks,
        provenances=stale_provenance,
    )
    assert_rejected(
        "missing provenance",
        pr=pr,
        run=run,
        checks=checks,
        provenances={},
    )
    assert_rejected(
        "stale PR gate",
        pr=pr,
        run={**run, "created_at": "2026-09-04T22:14:59Z"},
        checks=checks,
        provenances=provenances,
    )
    assert_rejected(
        "post-merge PR gate",
        pr=pr,
        run={**run, "updated_at": "2026-09-04T22:24:14Z"},
        checks=checks,
        provenances=provenances,
    )
    failed_checks = [
        {**item, "conclusion": "failure"}
        if item["name"] == "Tests · Playwright"
        else item
        for item in checks
    ]
    assert_rejected(
        "failed required check",
        pr=pr,
        run=run,
        checks=failed_checks,
        provenances=provenances,
    )

    external = external_download_request(
        "https://example.invalid/artifact.zip?sig=signed"
    )
    assert external.full_url.startswith("https://")
    assert external.get_header("Authorization") is None
    try:
        external_download_request("http://example.invalid/not-safe")
    except AdmissionError:
        pass
    else:
        raise AssertionError("self-test no rechazó: artifact redirect no HTTPS")

    print(
        "main-ci-admission self-test OK · full/scoped green accepted; "
        "historical PR base tolerated; direct/stale/wrong-base/failed rejected; "
        "artifact redirect strips auth"
    )


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
        f"Main admission OK · PR #{admission.pr_number} · "
        f"head {admission.pr_head_sha[:12]} · "
        f"Quality run {admission.quality_run_id} · "
        f"tested merge {admission.tested_merge_sha[:12]}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
