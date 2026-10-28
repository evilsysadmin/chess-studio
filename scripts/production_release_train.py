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


def select_latest(repository: str, pinned_run_id: int | None = None) -> tuple[int, int] | None:
    runs = _gh_json(
        repository,
        "actions/workflows/staging-ai-worker.yml/runs?event=workflow_run&status=success&branch=main&per_page=100",
    )
    candidates = candidate_runs(runs)
    if not candidates and pinned_run_id is None:
        return None
    # Automatic selection remains strictly newest-only. Explicit rollback is
    # only permitted by selecting a successful main Staging AI run by ID
    # and separately matching its immutable artifact to expected_sha.
    if pinned_run_id is not None:
        if pinned_run_id <= 0:
            raise ValueError("pinned_run_id debe ser positivo")
        selected = next((item for item in candidates if item[0] == pinned_run_id), None)
        if selected is None:
            raise RuntimeError(
                f"Manual staging run {pinned_run_id} no aparece entre los últimos 100 "
                "runs automáticos exitosos de main; no se permite una acreditación no verificada"
            )
        run_id, run_number = selected
    else:
        # Never silently fall back to an older accreditation.
        run_id, run_number = candidates[0]
    artifacts = _gh_json(repository, f"actions/runs/{run_id}/artifacts?per_page=100")
    if not has_current_accreditation(artifacts):
        label = "Manual selected" if pinned_run_id is not None else "Latest successful"
        raise RuntimeError(
            f"{label} staging AI run {run_id} (#{run_number}) "
            "has no unique, unexpired staging accreditation; refusing stale fallback"
        )
    return run_id, run_number



def require_latest_staging_generation(repository: str, accredited_sha: str) -> None:
    """Automatic promotions must not race a newer or incomplete staging deployment."""
    if _SHA_RE.fullmatch(accredited_sha) is None:
        raise ValueError(f"SHA acreditado inválido: {accredited_sha!r}")
    payload = _gh_json(
        repository,
        "actions/workflows/staging-deploy.yml/runs?branch=main&per_page=5",
    )
    if not isinstance(payload, dict) or not isinstance(payload.get("workflow_runs"), list):
        raise RuntimeError("No se pudo verificar el estado del último staging deploy")
    candidates = [
        row for row in payload["workflow_runs"]
        if isinstance(row, dict)
        and row.get("event") == "workflow_run"
        and isinstance(row.get("run_number"), int)
    ]
    if not candidates:
        raise RuntimeError("No existe un staging deploy automático verificable en main")
    latest = max(candidates, key=lambda row: row["run_number"])
    latest_sha = str(latest.get("head_sha") or "").lower()
    if (
        _SHA_RE.fullmatch(latest_sha) is None
        or latest_sha != accredited_sha
        or latest.get("status") != "completed"
        or latest.get("conclusion") != "success"
    ):
        raise RuntimeError(
            f"Promoción automática bloqueada: último staging deploy "
            f"#{latest['run_number']} (SHA={latest_sha or 'sin dato'}, "
            f"estado={latest.get('status')}, conclusión={latest.get('conclusion')}) "
            f"no coincide con la acreditación completa {accredited_sha}; "
            "esperar la nueva acreditación o usar promoción manual explícita"
        )

def read_accreditation(path: str, run_id: int, expected_sha: str = "", event: str = "schedule") -> str:
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
    if event not in {"schedule", "workflow_dispatch", "push"}:
        raise ValueError(f"Evento de promoción inesperado: {event!r}")
    if event == "workflow_dispatch" and not expected_sha:
        raise ValueError("La promoción manual exige fijar expected_sha")
    if expected_sha:
        pinned_sha = expected_sha.lower()
        if _SHA_RE.fullmatch(pinned_sha) is None:
            raise ValueError(f"expected_sha inválido: {expected_sha!r}")
        if pinned_sha != sha:
            raise ValueError(f"El SHA esperado {pinned_sha} no coincide con la acreditación {sha}")
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
    if event not in {"schedule", "workflow_dispatch", "push"}:
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
    original_gh_json = globals()["_gh_json"]
    try:
        def fake_gh_json(_repository: str, endpoint: str) -> object:
            if endpoint.startswith("actions/workflows/"):
                return runs
            if endpoint == "actions/runs/2/artifacts?per_page=100":
                return {"artifacts": []}
            if endpoint == "actions/runs/1/artifacts?per_page=100":
                return {"artifacts": [{"name": ARTIFACT_NAME, "expired": False}]}
            raise AssertionError(endpoint)

        globals()["_gh_json"] = fake_gh_json
        try:
            select_latest("example/repo")
            raise AssertionError("Stale accreditation fallback must be rejected")
        except RuntimeError as exc:
            assert "refusing stale fallback" in str(exc)
        # An explicit manual run selection can use an older but valid proof.
        assert select_latest("example/repo", pinned_run_id=1) == (1, 10)
        for invalid_pin in (-1, 999):
            try:
                select_latest("example/repo", pinned_run_id=invalid_pin)
                raise AssertionError("Unknown/invalid manual run must fail closed")
            except (ValueError, RuntimeError):
                pass
        def accredited_gh_json(repository: str, endpoint: str) -> object:
            if endpoint == "actions/runs/2/artifacts?per_page=100":
                return {"artifacts": [{"name": ARTIFACT_NAME, "expired": False}]}
            return fake_gh_json(repository, endpoint)
        globals()["_gh_json"] = accredited_gh_json
        assert select_latest("example/repo") == (2, 20)
    finally:
        globals()["_gh_json"] = original_gh_json
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
        assert read_accreditation(
            str(accreditation), 22, expected_sha="A" * 40, event="workflow_dispatch"
        ) == "a" * 40
        for pin in ("", "b" * 40, "invalid", " a" * 20):
            try:
                read_accreditation(str(accreditation), 22, expected_sha=pin, event="workflow_dispatch")
                raise AssertionError("Manual promotion with invalid/missing/mismatched pin must fail")
            except ValueError:
                pass
        assert read_accreditation(str(accreditation), 22, event="push") == "a" * 40
        record = pathlib.Path(tmp) / "record.json"
        write_record(str(record), "b" * 40, 77, "schedule")
        assert json.loads(record.read_text(encoding="utf-8")) == {
            "schema": 1,
            "sha": "b" * 40,
            "promotion_run_id": 77,
            "event": "schedule",
        }
        write_record(str(record), "c" * 40, 78, "push")
        assert json.loads(record.read_text(encoding="utf-8"))["event"] == "push"

    # A newer staging generation must block an automatic release of an older proof.
    original_gh_json = globals()["_gh_json"]
    try:
        state = {"head_sha": "b" * 40, "status": "in_progress", "conclusion": None}
        def staging_gh_json(_repository: str, endpoint: str) -> object:
            assert endpoint == "actions/workflows/staging-deploy.yml/runs?branch=main&per_page=5"
            return {"workflow_runs": [
                {"id": 44, "run_number": 44, "event": "workflow_run", **state},
                {"id": 43, "run_number": 43, "event": "workflow_run",
                 "head_sha": "a" * 40, "status": "completed", "conclusion": "success"},
            ]}
        globals()["_gh_json"] = staging_gh_json
        for sha in ("a" * 40, "b" * 40):
            try:
                require_latest_staging_generation("example/repo", sha)
                raise AssertionError("Pending/newer staging must block automatic promotion")
            except RuntimeError as exc:
                assert "Promoción automática bloqueada" in str(exc)
        state.update(status="completed", conclusion="failure")
        try:
            require_latest_staging_generation("example/repo", "b" * 40)
            raise AssertionError("Failed staging must block automatic promotion")
        except RuntimeError:
            pass
        state.update(status="completed", conclusion="success")
        require_latest_staging_generation("example/repo", "b" * 40)
        try:
            require_latest_staging_generation("example/repo", "a" * 40)
            raise AssertionError("Old accreditation must not be auto-promoted")
        except RuntimeError:
            pass
        globals()["_gh_json"] = lambda _r, _e: {"workflow_runs": []}
        try:
            require_latest_staging_generation("example/repo", "b" * 40)
            raise AssertionError("Missing staging history must fail closed")
        except RuntimeError:
            pass
    finally:
        globals()["_gh_json"] = original_gh_json
    print("production-release-train self-test OK")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    sub = parser.add_subparsers(dest="command")

    select = sub.add_parser("select")
    select.add_argument("--repository", required=True)
    select.add_argument("--github-output", required=True)
    select.add_argument("--pinned-run-id", default="")

    read = sub.add_parser("read")
    read.add_argument("--artifact", required=True)
    read.add_argument("--run-id", required=True, type=int)
    read.add_argument("--run-number", required=True, type=int)
    read.add_argument("--github-output", required=True)
    read.add_argument("--github-env", required=True)
    read.add_argument("--event", choices=("schedule", "workflow_dispatch", "push"), required=True)
    read.add_argument("--expected-sha", default="")

    lineage = sub.add_parser("lineage")
    lineage.add_argument("--repository", required=True)
    lineage.add_argument("--sha", required=True)

    latest = sub.add_parser("latest-staging")
    latest.add_argument("--repository", required=True)
    latest.add_argument("--sha", required=True)

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
        pin = args.pinned_run_id
        if pin and os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch":
            raise ValueError("Sólo workflow_dispatch puede seleccionar un Staging AI run anterior")
        if pin and (not pin.isdecimal() or int(pin) <= 0):
            raise ValueError(f"ID de acreditación manual inválido: {pin!r}")
        selected = select_latest(args.repository, pinned_run_id=int(pin) if pin else None)
        if selected is None:
            _append(args.github_output, found="false")
            print("No hay una acreditación automática de staging vigente.")
        else:
            run_id, run_number = selected
            _append(args.github_output, found="true", staging_ai_run_id=run_id, staging_ai_run_number=run_number)
            print(f"Latest staging accreditation: Staging AI run {run_id} (#{run_number}).")
        return 0
    if args.command == "read":
        sha = read_accreditation(args.artifact, args.run_id, expected_sha=args.expected_sha, event=args.event)
        _append(args.github_output, deploy_sha=sha)
        _append(args.github_env, DEPLOY_SHA=sha)
        print(f"Production provenance: Staging AI run {args.run_id} (#{args.run_number}) acreditó {sha}")
        return 0
    if args.command == "lineage":
        current_sha, status = require_main_lineage(args.repository, args.sha.lower())
        print(f"Production lineage admission OK: {args.sha.lower()} pertenece a main {current_sha} ({status}).")
        return 0
    if args.command == "latest-staging":
        require_latest_staging_generation(args.repository, args.sha.lower())
        print(f"Latest staging deployment matches accredited SHA {args.sha.lower()}.")
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
