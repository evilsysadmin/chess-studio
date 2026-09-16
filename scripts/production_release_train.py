#!/usr/bin/env python3
"""Release-train helper for scheduled production promotion."""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

from cloudflare_health_contract import validate_health_payload

ARTIFACT_NAME = "staging-promotion-accreditation"
_SHA_RE = re.compile(r"^[0-9a-f]{40}$")


def _append(path: str, **values: object) -> None:
    with open(path, "a", encoding="utf-8") as handle:
        for key, value in values.items():
            handle.write(f"{key}={value}\n")


def _gh_json(repository: str, endpoint: str) -> object:
    if not os.environ.get("GH_TOKEN"):
        raise RuntimeError("GH_TOKEN no está definido")
    proc = subprocess.run(
        ["gh", "api", "-H", "Accept: application/vnd.github+json", f"/repos/{repository}/{endpoint}"],
        check=False,
        capture_output=True,
        text=True,
        env=os.environ.copy(),
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or f"gh api falló para {endpoint}")
    return json.loads(proc.stdout)


def candidate_runs(payload: object) -> list[tuple[int, int]]:
    if not isinstance(payload, dict):
        return []
    rows: list[tuple[int, int]] = []
    for row in payload.get("workflow_runs") or []:
        if not isinstance(row, dict):
            continue
        if row.get("event") != "workflow_run" or row.get("conclusion") != "success":
            continue
        run_id, run_number = row.get("id"), row.get("run_number")
        if isinstance(run_id, int) and isinstance(run_number, int):
            rows.append((run_id, run_number))
    return sorted(rows, key=lambda item: item[1], reverse=True)


def has_current_accreditation(payload: object) -> bool:
    if not isinstance(payload, dict):
        return False
    matches = [
        row
        for row in (payload.get("artifacts") or [])
        if isinstance(row, dict)
        and row.get("name") == ARTIFACT_NAME
        and row.get("expired") is False
    ]
    return len(matches) == 1


def select_latest(repository: str) -> tuple[int, int] | None:
    runs = _gh_json(
        repository,
        "actions/workflows/staging-ai-worker.yml/runs?event=workflow_run&status=success&branch=main&per_page=100",
    )
    for run_id, run_number in candidate_runs(runs):
        artifacts = _gh_json(repository, f"actions/runs/{run_id}/artifacts?per_page=100")
        if has_current_accreditation(artifacts):
            return run_id, run_number
    return None


def read_accreditation(path: str, run_id: int) -> str:
    payload = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    if payload.get("schema") != 1:
        raise ValueError(f"Schema de acreditación inesperado: {payload.get('schema')!r}")
    if payload.get("staging_ai_run_id") != run_id:
        raise ValueError(
            f"Artifact pertenece al Staging AI run {payload.get('staging_ai_run_id')!r}, esperaba {run_id}"
        )
    if payload.get("upstream_event") != "workflow_run":
        raise ValueError(f"Acreditación no automática: {payload.get('upstream_event')!r}")
    sha = str(payload.get("sha") or "").lower()
    if _SHA_RE.fullmatch(sha) is None:
        raise ValueError(f"SHA acreditado inválido: {sha!r}")
    return sha


def require_main_lineage(repository: str, sha: str) -> tuple[str, str]:
    branch = _gh_json(repository, "git/ref/heads/main")
    if not isinstance(branch, dict):
        raise RuntimeError("Respuesta inválida al resolver main")
    current = str(((branch.get("object") or {}).get("sha") if isinstance(branch.get("object"), dict) else "") or "").lower()
    if _SHA_RE.fullmatch(current) is None:
        raise RuntimeError(f"main SHA inválido: {current!r}")
    comparison = _gh_json(repository, f"compare/{sha}...{current}")
    status = str(comparison.get("status") if isinstance(comparison, dict) else "")
    if status not in {"identical", "ahead"}:
        raise RuntimeError(f"El SHA acreditado {sha} no pertenece a main {current} (compare={status or 'desconocido'})")
    return current, status


def _fetch_json(url: str, timeout: float = 12.0) -> object:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "Cache-Control": "no-cache", "User-Agent": "chess-studio-release-train/1"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status} para {url}")
        return json.loads(response.read().decode("utf-8"))


def _exact_build(payload: object, sha: str) -> bool:
    return isinstance(payload, dict) and str(payload.get("build") or "").lower() == sha


def production_is_current(sha: str, backend_url: str, frontend_url: str, ai_url: str) -> bool:
    try:
        backend = _fetch_json(f"{backend_url.rstrip('/')}/release?sha={sha}")
        frontend = _fetch_json(f"{frontend_url.rstrip('/')}/release.json?sha={sha}")
        ai = _fetch_json(f"{ai_url.rstrip('/')}/health")
    except (OSError, ValueError, RuntimeError, urllib.error.URLError, json.JSONDecodeError):
        return False
    return not validate_health_payload(ai) and all(_exact_build(payload, sha) for payload in (backend, frontend, ai))


def diagnose_staging(sha: str, backend_url: str, frontend_url: str, ai_url: str) -> None:
    probes = (
        ("backend", f"{backend_url.rstrip('/')}/release?sha={sha}"),
        ("frontend", f"{frontend_url.rstrip('/')}/release.json?sha={sha}"),
        ("ai", f"{ai_url.rstrip('/')}/health"),
    )
    for kind, url in probes:
        try:
            payload = _fetch_json(url, timeout=15.0)
            valid = _exact_build(payload, sha)
            if kind == "ai":
                valid = valid and not validate_health_payload(payload)
            if valid:
                print(f"Staging {kind} todavía sirve {sha}.")
                continue
            detail = "build/health distinto"
        except Exception as exc:  # diagnostic-only: immutable accreditation stays authoritative
            detail = str(exc)
        print(
            f"::notice title=Staging {kind} advanced::Staging {kind} ya no acredita exactamente {sha} ({detail}). "
            "La promoción conserva la acreditación inmutable previa."
        )


def write_record(path: str, sha: str, run_id: int, event: str) -> None:
    sha = sha.lower()
    if _SHA_RE.fullmatch(sha) is None:
        raise ValueError(f"SHA de promoción inválido: {sha!r}")
    if event not in {"schedule", "workflow_dispatch"}:
        raise ValueError(f"Evento de promoción inesperado: {event!r}")
    payload = {"schema": 1, "sha": sha, "promotion_run_id": run_id, "event": event}
    pathlib.Path(path).write_text(json.dumps(payload, sort_keys=True) + "\n", encoding="utf-8")


def self_test() -> None:
    runs = {
        "workflow_runs": [
            {"id": 2, "run_number": 20, "event": "workflow_run", "conclusion": "success"},
            {"id": 3, "run_number": 30, "event": "workflow_dispatch", "conclusion": "success"},
            {"id": 1, "run_number": 10, "event": "workflow_run", "conclusion": "success"},
            {"id": 4, "run_number": 40, "event": "workflow_run", "conclusion": "failure"},
        ]
    }
    assert candidate_runs(runs) == [(2, 20), (1, 10)]
    assert has_current_accreditation({"artifacts": [{"name": ARTIFACT_NAME, "expired": False}]})
    assert not has_current_accreditation({"artifacts": [{"name": ARTIFACT_NAME, "expired": True}]})
    assert not has_current_accreditation(
        {"artifacts": [{"name": ARTIFACT_NAME, "expired": False}, {"name": ARTIFACT_NAME, "expired": False}]}
    )
    with tempfile.TemporaryDirectory() as tmp:
        accreditation = pathlib.Path(tmp) / "accreditation.json"
        accreditation.write_text(
            json.dumps({"schema": 1, "sha": "a" * 40, "staging_ai_run_id": 22, "upstream_event": "workflow_run"}),
            encoding="utf-8",
        )
        assert read_accreditation(str(accreditation), 22) == "a" * 40
        record = pathlib.Path(tmp) / "record.json"
        write_record(str(record), "b" * 40, 77, "schedule")
        assert json.loads(record.read_text(encoding="utf-8")) == {
            "schema": 1,
            "sha": "b" * 40,
            "promotion_run_id": 77,
            "event": "schedule",
        }
    print("production-release-train self-test OK")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    sub = parser.add_subparsers(dest="command")

    select = sub.add_parser("select")
    select.add_argument("--repository", required=True)
    select.add_argument("--github-output", required=True)

    read = sub.add_parser("read")
    read.add_argument("--artifact", required=True)
    read.add_argument("--run-id", required=True, type=int)
    read.add_argument("--run-number", required=True, type=int)
    read.add_argument("--github-output", required=True)
    read.add_argument("--github-env", required=True)

    lineage = sub.add_parser("lineage")
    lineage.add_argument("--repository", required=True)
    lineage.add_argument("--sha", required=True)

    current = sub.add_parser("current")
    current.add_argument("--sha", required=True)
    current.add_argument("--backend-url", required=True)
    current.add_argument("--frontend-url", required=True)
    current.add_argument("--ai-url", required=True)

    diagnostic = sub.add_parser("diagnose-staging")
    diagnostic.add_argument("--sha", required=True)
    diagnostic.add_argument("--backend-url", required=True)
    diagnostic.add_argument("--frontend-url", required=True)
    diagnostic.add_argument("--ai-url", required=True)

    record = sub.add_parser("record")
    record.add_argument("--target", required=True)
    record.add_argument("--sha", required=True)
    record.add_argument("--run-id", required=True, type=int)
    record.add_argument("--event", required=True)

    args = parser.parse_args(argv)
    if args.self_test:
        self_test()
        return 0
    if args.command == "select":
        selected = select_latest(args.repository)
        if selected is None:
            _append(args.github_output, found="false")
            print("No hay una acreditación automática de staging vigente.")
        else:
            run_id, run_number = selected
            _append(args.github_output, found="true", staging_ai_run_id=run_id, staging_ai_run_number=run_number)
            print(f"Latest staging accreditation: Staging AI run {run_id} (#{run_number}).")
        return 0
    if args.command == "read":
        sha = read_accreditation(args.artifact, args.run_id)
        _append(args.github_output, deploy_sha=sha)
        _append(args.github_env, DEPLOY_SHA=sha)
        print(f"Production provenance: Staging AI run {args.run_id} (#{args.run_number}) acreditó {sha}")
        return 0
    if args.command == "lineage":
        current_sha, status = require_main_lineage(args.repository, args.sha.lower())
        print(f"Production lineage admission OK: {args.sha.lower()} pertenece a main {current_sha} ({status}).")
        return 0
    if args.command == "current":
        return 0 if production_is_current(args.sha.lower(), args.backend_url, args.frontend_url, args.ai_url) else 1
    if args.command == "diagnose-staging":
        diagnose_staging(args.sha.lower(), args.backend_url, args.frontend_url, args.ai_url)
        return 0
    if args.command == "record":
        write_record(args.target, args.sha, args.run_id, args.event)
        return 0
    parser.print_help(sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
