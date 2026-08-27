#!/usr/bin/env python3
"""Static contract for Grafana dashboards, Terraform provisioning and Tempo tracing."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PORTABLE_LOGS = ROOT / "ops" / "grafana" / "chess-studio-logs.json"
INFRA = ROOT / "infra" / "grafana"
WORKFLOW = ROOT / ".github" / "workflows" / "grafana-dashboards.yml"


def fail(message: str) -> None:
    raise SystemExit(f"grafana-dashboard-check FAIL · {message}")


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"{path.relative_to(ROOT)} JSON inválido: {exc}")


def main() -> int:
    portable = load_json(PORTABLE_LOGS)
    if portable.get("uid") != "chess-studio-logs":
        fail("UID estable ausente en dashboard portable de logs")
    panels = portable.get("panels") or []
    titles = {str(row.get("title") or "") for row in panels}
    required_titles = {"404 accionables · request_path", "5xx por ruta", "p95 por ruta · top 10", "Errores recientes · correlación", "Frontend telemetry · 15 min", "Frontend telemetry · flujo reciente"}
    missing = sorted(required_titles - titles)
    if missing:
        fail(f"faltan paneles accionables: {', '.join(missing)}")
    expressions = "\n".join(str(target.get("expr") or "") for panel in panels for target in (panel.get("targets") or []))
    for token in ("request_path", "request_id", "status = 404", "status >= 500", "duration_ms", "client_release", "frontend_telemetry"):
        if token not in expressions:
            fail(f"las queries no cubren {token}")
    inputs = portable.get("__inputs") or []
    if not any(row.get("name") == "DS_LOKI" and row.get("pluginId") == "loki" for row in inputs):
        fail("el dashboard portable debe seguir siendo importable contra cualquier datasource Loki")

    required_dashboards = {
        "chess-studio-overview.json": "chess-studio-api-overview",
        "chess-studio-logs.json": "chess-studio-logs",
        "chess-studio-traces.json": "chess-studio-traces",
    }
    for filename, uid in required_dashboards.items():
        path = INFRA / "dashboards" / filename
        raw = path.read_text(encoding="utf-8") if path.exists() else ""
        # templatefile placeholders are strings and valid JSON before interpolation.
        data = load_json(path) if raw else fail(f"falta {path.relative_to(ROOT)}")
        if data.get("uid") != uid:
            fail(f"{filename}: UID esperado {uid}")
    trace_dash = (INFRA / "dashboards" / "chess-studio-traces.json").read_text(encoding="utf-8")
    for token in ('traceql', 'chess-studio-backend', '${traces_datasource_uid}', 'trace_id'):
        if token not in trace_dash:
            fail(f"dashboard Tempo no cubre {token}")

    tf = (INFRA / "terraform" / "main.tf").read_text(encoding="utf-8")
    for resource in (
        'grafana_dashboard" "chess_studio_overview',
        'grafana_dashboard" "chess_studio_logs',
        'grafana_dashboard" "chess_studio_traces',
    ):
        if resource not in tf:
            fail(f"Terraform no declara {resource}")
    workflow = WORKFLOW.read_text(encoding="utf-8") if WORKFLOW.exists() else ""
    for token in ('infra/grafana/**', 'GRAFANA_URL', 'GRAFANA_AUTH', 'Validate Grafana datasources', '/api/datasources/uid/$uid', 'terraform import grafana_dashboard.chess_studio_logs', 'terraform apply -auto-approve tfplan', 'Verify published dashboards', '/api/dashboards/uid/$uid'):
        if token not in workflow:
            fail(f"workflow Grafana incompleto: {token}")

    tracing = (ROOT / "backend-python" / "tracing.py").read_text(encoding="utf-8")
    requirements = (ROOT / "backend-python" / "requirements.txt").read_text(encoding="utf-8")
    structured = (ROOT / "backend-python" / "structured_logging.py").read_text(encoding="utf-8")
    for token in ('OTEL_EXPORTER_OTLP_ENDPOINT', 'OTLPSpanExporter', 'OTLPMetricExporter', 'OTLPLogExporter', 'FastAPIInstrumentor'):
        if token not in tracing:
            fail(f"exportación OTLP incompleta: {token}")
    if 'opentelemetry-exporter-otlp-proto-http' not in requirements:
        fail("falta dependencia OTLP HTTP")
    if 'payload["trace_id"]' not in structured:
        fail("los logs no correlacionan trace_id")
    overview = (INFRA / "dashboards" / "chess-studio-overview.json").read_text(encoding="utf-8")
    for token in ('${metrics_datasource_uid}', 'chess_studio_http_server_requests_total', 'chess_studio_http_server_duration_seconds_bucket', 'service_name=\\"chess-studio-backend\\"'):
        if token not in overview:
            fail(f"overview no usa señal real: {token}")
    infra_logs = (INFRA / "dashboards" / "chess-studio-logs.json").read_text(encoding="utf-8")
    if '"query": "{}"' in infra_logs:
        fail("Loki selector no puede volver a {}")

    print(f"grafana-dashboard-check OK · {len(panels)} paneles logs · Terraform 3 dashboards · OTLP logs+metrics+traces + trace_id")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
