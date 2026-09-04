#!/usr/bin/env python3
"""Idempotently publish Chess Studio Grafana dashboards via the Grafana HTTP API.

This deliberately avoids Terraform/state for four versioned dashboard JSON files.
The publisher is standard-library only so CI does not need a package/provider download.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASHBOARDS_DIR = ROOT / "infra" / "grafana" / "dashboards"
FOLDER_TITLE = "Chess Studio"
FOLDER_UID = "chess-studio"
DASHBOARDS = (
    "chess-studio-overview.json",
    "chess-studio-logs.json",
    "chess-studio-traces.json",
    "chess-studio-edge.json",
)


def fail(message: str) -> "NoReturn":
    raise SystemExit(f"grafana-publish FAIL · {message}")


def render_dashboard(path: Path, variables: dict[str, str]) -> dict:
    text = path.read_text(encoding="utf-8")
    for key, value in variables.items():
        text = text.replace("${" + key + "}", value)
    unresolved = sorted({part.split("}", 1)[0] for part in text.split("${")[1:]})
    if unresolved:
        fail(f"{path.name}: placeholders sin resolver: {', '.join(unresolved)}")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        fail(f"{path.name}: JSON inválido tras render: {exc}")
    if not payload.get("uid") or not payload.get("title"):
        fail(f"{path.name}: dashboard sin uid/title estable")
    payload["id"] = None
    return payload


class GrafanaApi:
    def __init__(self, base_url: str, token: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token

    def request(self, method: str, path: str, body: dict | None = None, *, expected: tuple[int, ...] = (200,)) -> tuple[int, object]:
        data = None if body is None else json.dumps(body, separators=(",", ":")).encode("utf-8")
        req = urllib.request.Request(
            self.base_url + path,
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "chess-studio-grafana-publisher/1",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                raw = response.read().decode("utf-8")
                payload = json.loads(raw) if raw else {}
                status = response.status
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                payload = {"raw": raw[:2000]}
            status = exc.code
        except OSError as exc:
            fail(f"{method} {path}: red no disponible: {exc}")
        if status not in expected:
            fail(f"{method} {path}: HTTP {status}: {payload}")
        return status, payload


def ensure_folder(api: GrafanaApi) -> str:
    _, folders = api.request("GET", "/api/folders?limit=1000")
    if not isinstance(folders, list):
        fail("/api/folders devolvió formato inesperado")
    matches = [row for row in folders if isinstance(row, dict) and row.get("title") == FOLDER_TITLE]
    if len(matches) > 1:
        fail(f"más de una carpeta {FOLDER_TITLE!r}: {matches}")
    if matches:
        uid = str(matches[0].get("uid") or "")
        if not uid:
            fail("carpeta existente sin uid")
        print(f"Grafana folder exists · {FOLDER_TITLE} · {uid}")
        return uid

    _, created = api.request(
        "POST",
        "/api/folders",
        {"uid": FOLDER_UID, "title": FOLDER_TITLE},
        expected=(200,),
    )
    uid = str(created.get("uid") or FOLDER_UID) if isinstance(created, dict) else FOLDER_UID
    print(f"Grafana folder created · {FOLDER_TITLE} · {uid}")
    return uid


def validate_datasource(api: GrafanaApi, label: str, uid: str) -> None:
    quoted = urllib.parse.quote(uid, safe="")
    try:
        api.request("GET", f"/api/datasources/uid/{quoted}")
        print(f"Datasource {label} OK · {uid}")
    except SystemExit as exc:
        message = str(exc)
        if "HTTP 403" in message:
            print(f"WARNING: datasource {label} no verificable con token least-privilege · {uid}")
            return
        raise


def publish_dashboard(api: GrafanaApi, folder_uid: str, dashboard: dict, commit_sha: str) -> None:
    uid = str(dashboard["uid"])
    api.request(
        "POST",
        "/api/dashboards/db",
        {
            "dashboard": dashboard,
            "folderUid": folder_uid,
            "overwrite": True,
            "message": f"Chess Studio {commit_sha[:12]}",
        },
        expected=(200,),
    )
    quoted = urllib.parse.quote(uid, safe="")
    _, verified = api.request("GET", f"/api/dashboards/uid/{quoted}")
    actual_uid = str(((verified or {}).get("dashboard") or {}).get("uid") or "") if isinstance(verified, dict) else ""
    if actual_uid != uid:
        fail(f"dashboard {uid}: verificación devolvió {actual_uid!r}")
    print(f"Dashboard published OK · {uid}")


def self_test() -> int:
    variables = {
        "metrics_datasource_uid": "metrics-test",
        "logs_datasource_uid": "logs-test",
        "traces_datasource_uid": "traces-test",
        "commit_sha": "0123456789abcdef",
    }
    rendered = [render_dashboard(DASHBOARDS_DIR / name, variables) for name in DASHBOARDS]
    uids = [str(row.get("uid") or "") for row in rendered]
    if len(set(uids)) != len(DASHBOARDS):
        fail(f"UIDs duplicados: {uids}")
    print(f"grafana-publish self-test OK · {len(rendered)} dashboards · stdlib only")
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()

    base_url = os.getenv("GRAFANA_URL", "").strip()
    token = os.getenv("GRAFANA_AUTH", "").strip()
    if not base_url:
        fail("falta GRAFANA_URL")
    if not token:
        fail("falta GRAFANA_AUTH")

    variables = {
        "metrics_datasource_uid": os.getenv("GRAFANA_METRICS_DATASOURCE_UID", "").strip(),
        "logs_datasource_uid": os.getenv("GRAFANA_LOGS_DATASOURCE_UID", "").strip(),
        "traces_datasource_uid": os.getenv("GRAFANA_TRACES_DATASOURCE_UID", "").strip(),
        "commit_sha": os.getenv("GITHUB_SHA", "local").strip() or "local",
    }
    missing = [key for key in ("metrics_datasource_uid", "logs_datasource_uid", "traces_datasource_uid") if not variables[key]]
    if missing:
        fail(f"faltan datasource UIDs: {', '.join(missing)}")

    api = GrafanaApi(base_url, token)
    validate_datasource(api, "metrics", variables["metrics_datasource_uid"])
    validate_datasource(api, "logs", variables["logs_datasource_uid"])
    validate_datasource(api, "traces", variables["traces_datasource_uid"])
    folder_uid = ensure_folder(api)
    for name in DASHBOARDS:
        publish_dashboard(api, folder_uid, render_dashboard(DASHBOARDS_DIR / name, variables), variables["commit_sha"])
    print(f"grafana-publish OK · {len(DASHBOARDS)} dashboards · folder={folder_uid}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
