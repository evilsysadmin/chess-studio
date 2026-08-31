#!/usr/bin/env python3
"""Static contract for Grafana dashboards, Terraform provisioning and Tempo tracing."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PORTABLE_LOGS = ROOT / "ops" / "grafana" / "chess-studio-logs.json"
INFRA = ROOT / "infra" / "grafana"
WORKFLOW = ROOT / ".github" / "workflows" / "grafana-dashboards.yml"
EXPORTER_WORKFLOW = ROOT / ".github" / "workflows" / "cloudflare-prometheus-exporter.yml"
ALLOY_EXAMPLE = INFRA / "alloy" / "cloudflare-exporter.alloy.example"


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
        "chess-studio-edge.json": "chess-studio-edge",
    }
    for filename, uid in required_dashboards.items():
        path = INFRA / "dashboards" / filename
        raw = path.read_text(encoding="utf-8") if path.exists() else ""
        # templatefile placeholders are strings and valid JSON before interpolation.
        data = load_json(path) if raw else fail(f"falta {path.relative_to(ROOT)}")
        if data.get("uid") != uid:
            fail(f"{filename}: UID esperado {uid}")
    trace_dash = (INFRA / "dashboards" / "chess-studio-traces.json").read_text(encoding="utf-8")
    for token in ('traceql', 'chess-studio-backend', '${traces_datasource_uid}', 'trace_id', 'trace_sampled'):
        if token not in trace_dash:
            fail(f"dashboard Tempo no cubre {token}")

    edge_dash = (INFRA / "dashboards" / "chess-studio-edge.json").read_text(encoding="utf-8")
    for token in (
        '${metrics_datasource_uid}',
        'chess-studio.shadowops.dpdns.org',
        'cloudflare_zone_colocation_requests_total',
        'cloudflare_zone_firewall_events_total',
        'cloudflare_worker_requests_total',
        'requests ≠ humanos' if 'requests ≠ humanos' in edge_dash else 'Un request no equivale a una persona',
    ):
        if token not in edge_dash:
            fail(f"dashboard Edge no cubre {token}")

    tf = (INFRA / "terraform" / "main.tf").read_text(encoding="utf-8")
    for resource in (
        'grafana_dashboard" "chess_studio_overview',
        'grafana_dashboard" "chess_studio_logs',
        'grafana_dashboard" "chess_studio_traces',
        'grafana_dashboard" "chess_studio_edge',
    ):
        if resource not in tf:
            fail(f"Terraform no declara {resource}")
    workflow = WORKFLOW.read_text(encoding="utf-8") if WORKFLOW.exists() else ""
    for token in ('infra/grafana/**', 'GRAFANA_URL', 'GRAFANA_AUTH', 'Validate Grafana datasources', '/api/datasources/uid/$uid', 'terraform import grafana_dashboard.chess_studio_logs', 'terraform import grafana_dashboard.chess_studio_edge', 'terraform apply -auto-approve tfplan', 'Verify published dashboards', '/api/dashboards/uid/$uid', 'chess-studio-edge'):
        if token not in workflow:
            fail(f"workflow Grafana incompleto: {token}")
    # El token de publicación no necesita ampliar permisos sólo para este probe.
    # 403 (sin datasources:read) debe ser warning; 404 de UID sí es error.
    for token in ('403)', '::warning::No se puede leer el datasource Grafana', '404)', 'no existe: HTTP 404'):
        if token not in workflow:
            fail(f"workflow Grafana perdió el contrato least-privilege: {token}")

    exporter_workflow = EXPORTER_WORKFLOW.read_text(encoding="utf-8") if EXPORTER_WORKFLOW.exists() else ""
    for token in (
        'cloudflare/cloudflare-prometheus-exporter',
        'c98fd6772a4ff806e40ba08cb5d4edb002ef13dc',
        'CLOUDFLARE_EXPORTER_API_TOKEN',
        'CLOUDFLARE_EXPORTER_BASIC_AUTH_USER',
        'CLOUDFLARE_EXPORTER_BASIC_AUTH_PASSWORD',
        'DISABLE_UI',
        'DISABLE_CONFIG_API',
        'HOST_METRICS_ALLOWLIST',
        'chess-studio.shadowops.dpdns.org',
        'staging.chess-studio.shadowops.dpdns.org',
        'unauth_code',
        'esperaba 401',
    ):
        if token not in exporter_workflow:
            fail(f"workflow exporter Cloudflare incompleto: {token}")
    if 'printf \'%s\' "$CLOUDFLARE_API_TOKEN"' in exporter_workflow:
        fail("exporter no debe reutilizar el token write-capable de CI como token runtime")

    alloy = ALLOY_EXAMPLE.read_text(encoding="utf-8") if ALLOY_EXAMPLE.exists() else ""
    for token in (
        'metrics.shadowops.dpdns.org',
        'prometheus.scrape "chess_studio_cloudflare"',
        'CLOUDFLARE_EXPORTER_BASIC_AUTH_USER',
        'CLOUDFLARE_EXPORTER_BASIC_AUTH_PASSWORD',
        'prometheus.remote_write.metrics_service.receiver',
    ):
        if token not in alloy:
            fail(f"Alloy Cloudflare incompleto: {token}")

    tracing = (ROOT / "backend-python" / "tracing.py").read_text(encoding="utf-8")
    requirements = (ROOT / "backend-python" / "requirements.txt").read_text(encoding="utf-8")
    structured = (ROOT / "backend-python" / "structured_logging.py").read_text(encoding="utf-8")
    for token in ('OTEL_EXPORTER_OTLP_ENDPOINT', 'OTLPSpanExporter', 'OTLPMetricExporter', 'OTLPLogExporter', 'FastAPIInstrumentor'):
        if token not in tracing:
            fail(f"exportación OTLP incompleta: {token}")
    for token in ('FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)', 'HTTPXClientInstrumentor().instrument(tracer_provider=provider)', '_TRACE_PROVIDER.get_tracer("chess-studio.admin-probe")'):
        if token not in tracing:
            fail(f"Tempo puede volver a usar un provider global sin exporter: {token}")
    for token in ('TrackingOTLPSpanExporter', 'lastHttpStatus', 'successCount', 'exportedSpanCount', 'chess-studio.startup', 'startupTraceId'):
        if token not in tracing:
            fail(f"Tempo perdió diagnóstico real de entrega OTLP: {token}")
    if tracing.count('headers=exporter_headers or None') < 3:
        fail('OTLP debe pasar las cabeceras explícitamente a traces, metrics y logs')
    render_yaml = (ROOT / 'render.yaml').read_text(encoding='utf-8')
    if 'OTEL_TRACES_SAMPLER_ARG' not in render_yaml or 'value: "1.0"' not in render_yaml:
        fail('producción debe mantener sampling 100% mientras se diagnostica Tempo')
    if '"query": "{ }"' not in trace_dash:
        fail('dashboard Tempo debe conservar una búsqueda reciente sin filtros para no ocultar trazas válidas')
    if 'resource.service.name' not in trace_dash or 'trace:duration > 500ms' not in trace_dash:
        fail('dashboard Tempo perdió los paneles diagnósticos filtrados por recurso/duración')
    if trace_dash.count('"tableType": "traces"') < 3 or trace_dash.count('"spanLimit": 3') < 3:
        fail('paneles Tempo deben fijar formato de tabla de trazas y límite de spans')
    trace_data = load_json(INFRA / 'dashboards' / 'chess-studio-traces.json')
    trace_search_panels = [row for row in trace_data.get('panels') or [] if row.get('id') in (1, 2, 3)]
    if len(trace_search_panels) != 3 or any(row.get('type') != 'table' for row in trace_search_panels):
        fail('búsquedas TraceQL deben renderizarse como tabla; el panel Traces es para el detalle de un único trace ID')
    if 'opentelemetry-exporter-otlp-proto-http' not in requirements:
        fail("falta dependencia OTLP HTTP")
    if 'payload["trace_id"]' not in structured:
        fail("los logs no correlacionan trace_id")
    overview_path = INFRA / "dashboards" / "chess-studio-overview.json"
    overview = overview_path.read_text(encoding="utf-8")
    overview_data = load_json(overview_path)
    for token in ('${metrics_datasource_uid}', 'chess_studio_http_server_requests_total', 'chess_studio_http_server_duration_seconds_bucket', 'chess-studio-backend'):
        if token not in overview:
            fail(f"overview no usa señal real: {token}")
    for panel in overview_data.get("panels") or []:
        panel_ds = (panel.get("datasource") or {}).get("type")
        if panel_ds == "prometheus":
            for target in panel.get("targets") or []:
                target_ds = (target.get("datasource") or {}).get("type")
                if target_ds and target_ds != "prometheus":
                    fail(f"{panel.get('title')}: panel Prometheus conserva target {target_ds}")
    for panel_id in (2, 4, 5):
        panel = next((row for row in overview_data.get("panels") or [] if row.get("id") == panel_id), None)
        if not panel or "vector(0)" not in str((panel.get("targets") or [{}])[0].get("expr") or ""):
            fail(f"panel métrico {panel_id} debe representar ausencia de muestras como cero")

    infra_logs = (INFRA / "dashboards" / "chess-studio-logs.json").read_text(encoding="utf-8")
    if '"query": "{}"' in infra_logs:
        fail("Loki selector no puede volver a {}")

    print(f"grafana-dashboard-check OK · {len(panels)} paneles logs · Terraform 4 dashboards · OTLP + Cloudflare edge")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
