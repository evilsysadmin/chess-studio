#!/usr/bin/env python3
"""Static contract for the portable Grafana/Loki operations dashboard."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = ROOT / "ops" / "grafana" / "chess-studio-logs.json"


def fail(message: str) -> None:
    raise SystemExit(f"grafana-dashboard-check FAIL · {message}")


def main() -> int:
    try:
        data = json.loads(DASHBOARD.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"JSON inválido: {exc}")
    if data.get("uid") != "chess-studio-logs":
        fail("UID estable ausente")
    panels = data.get("panels") or []
    titles = {str(row.get("title") or "") for row in panels}
    required_titles = {"404 accionables · request_path", "5xx por ruta", "p95 por ruta · top 10", "Errores recientes · correlación"}
    missing = sorted(required_titles - titles)
    if missing:
        fail(f"faltan paneles accionables: {', '.join(missing)}")
    expressions = "\n".join(str(target.get("expr") or "") for panel in panels for target in (panel.get("targets") or []))
    for token in ('request_path', 'request_id', 'status = 404', 'status >= 500', 'duration_ms', 'client_release'):
        if token not in expressions:
            fail(f"las queries no cubren {token}")
    inputs = data.get("__inputs") or []
    if not any(row.get("name") == "DS_LOKI" and row.get("pluginId") == "loki" for row in inputs):
        fail("el dashboard debe seguir siendo importable contra cualquier datasource Loki")
    print(f"grafana-dashboard-check OK · {len(panels)} paneles · 404/5xx/p95/request_id/release")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
