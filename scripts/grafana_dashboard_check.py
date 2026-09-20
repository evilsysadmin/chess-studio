#!/usr/bin/env python3
"""Static contract for Grafana dashboards, API publishing and Tempo tracing."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PORTABLE_LOGS = ROOT / "ops" / "grafana" / "chess-studio-logs.json"
INFRA = ROOT / "infra" / "grafana"
WORKFLOW = ROOT / ".github" / "workflows" / "grafana-dashboards.yml"
PUBLISHER = ROOT / "scripts" / "grafana_publish.py"
LIVE_CHECK = ROOT / "scripts" / "grafana_live_check.py"
LIVE_WORKFLOW = ROOT / ".github" / "workflows" / "observability-live.yml"
EXPORTER_WORKFLOW = ROOT / ".github" / "workflows" / "cloudflare-prometheus-exporter.yml"
EXPORTER_CONFIG = ROOT / "scripts" / "cloudflare_exporter_config.py"
EXPORTER_HEALTH = ROOT / "scripts" / "cloudflare_exporter_health.py"
ALLOY_EXAMPLE = INFRA / "alloy" / "cloudflare-exporter.alloy.example"
BILLING_WORKFLOW = ROOT / ".github" / "workflows" / "billing-cost-export.yml"
BILLING_EXPORTER = ROOT / "scripts" / "billing_cost_export.py"


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
        "chess-studio-oci-host.json": "chess-studio-oci-host",
    }
    for filename, uid in required_dashboards.items():
        path = INFRA / "dashboards" / filename
        raw = path.read_text(encoding="utf-8") if path.exists() else ""
        data = load_json(path) if raw else fail(f"falta {path.relative_to(ROOT)}")
        if data.get("uid") != uid:
            fail(f"{filename}: UID esperado {uid}")
    oci_host_dash = (INFRA / "dashboards" / "chess-studio-oci-host.json").read_text(encoding="utf-8")
    for token in (
        'chess-studio-oci-host',
        'deployment_environment',
        'node_cpu_seconds_total',
        'node_memory_MemAvailable_bytes',
        'node_load1',
        'node_disk_read_bytes_total',
        'node_network_receive_bytes_total',
    ):
        if token not in oci_host_dash:
            fail(f"dashboard OCI host no cubre {token}")

    trace_dash = (INFRA / "dashboards" / "chess-studio-traces.json").read_text(encoding="utf-8")
    for token in ('traceql', 'chess-studio-backend', '${traces_datasource_uid}', 'trace_id', 'trace_sampled'):
        if token not in trace_dash:
            fail(f"dashboard Tempo no cubre {token}")
    for token in ('chess-studio-backend-staging', 'backend_service'):
        if token not in trace_dash:
            fail(f"dashboard Tempo no permite separar producción/staging: {token}")

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

    if (INFRA / "terraform").exists():
        fail("Grafana dashboards no deben volver a Terraform/state/import/apply; usa scripts/grafana_publish.py")

    workflow = WORKFLOW.read_text(encoding="utf-8") if WORKFLOW.exists() else ""
    for token in (
        'infra/grafana/dashboards/**',
        'scripts/grafana_publish.py',
        'GRAFANA_URL',
        'GRAFANA_AUTH',
        'GRAFANA_METRICS_DATASOURCE_UID',
        'GRAFANA_LOGS_DATASOURCE_UID',
        'GRAFANA_TRACES_DATASOURCE_UID',
        'python3 -S scripts/grafana_publish.py --self-test',
        'python3 -S scripts/grafana_publish.py',
        'ubuntu-24.04',
    ):
        if token not in workflow:
            fail(f"workflow Grafana incompleto: {token}")
    for forbidden in ('terraform ', 'hashicorp/setup-terraform', 'infra/grafana/terraform', 'ubuntu-latest'):
        if forbidden in workflow:
            fail(f"workflow Grafana resucita plumbing innecesario: {forbidden}")

    live_check = LIVE_CHECK.read_text(encoding="utf-8") if LIVE_CHECK.exists() else ""
    live_workflow = LIVE_WORKFLOW.read_text(encoding="utf-8") if LIVE_WORKFLOW.exists() else ""
    for token in (
        '/api/prometheus/',
        '/loki/api/v1/query',
        '/api/search',
        'chess-studio-oci-host',
        'backend_production_metrics',
        'backend_production_logs',
        'backend_production_traces',
        'backend_5xx_percent',
        'backend_p95_ms',
        'oci_host_ram_percent',
        'GRAFANA_SLO_MAX_5XX_PERCENT',
        '--self-test',
    ):
        if token not in live_check:
            fail(f"live check Grafana incompleto: {token}")
    for token in (
        "cron: '41 * * * *'",
        'GRAFANA_URL',
        'GRAFANA_AUTH',
        'GRAFANA_METRICS_DATASOURCE_UID',
        'GRAFANA_LOGS_DATASOURCE_UID',
        'GRAFANA_TRACES_DATASOURCE_UID',
        'GRAFANA_SLO_MAX_5XX_PERCENT',
        'GRAFANA_SLO_MAX_P95_MS',
        'GRAFANA_SLO_MAX_HOST_RAM_PERCENT',
        'GRAFANA_SLO_MIN_REQUESTS_15M',
        'python3 -S scripts/grafana_live_check.py --self-test',
        'python3 -S scripts/grafana_live_check.py',
    ):
        if token not in live_workflow:
            fail(f"workflow live Grafana incompleto: {token}")

    publisher = PUBLISHER.read_text(encoding="utf-8") if PUBLISHER.exists() else ""
    for token in (
        '/api/folders?limit=1000',
        '/api/folders',
        '/api/datasources/uid/',
        '/api/dashboards/db',
        '/api/dashboards/uid/',
        'chess-studio-oci-host.json',
        'runtime_variables = {"backend_service", "selector", "environment"}',
        '"overwrite": True',
        'HTTP 403',
        'WARNING: datasource',
        'urllib.request',
        'stdlib only',
    ):
        if token not in publisher:
            fail(f"publisher Grafana incompleto: {token}")
    for forbidden in ('import requests', 'import httpx', 'subprocess', 'terraform'):
        if forbidden in publisher:
            fail(f"publisher Grafana debe ser stdlib/state-less: {forbidden}")

    exporter_workflow = EXPORTER_WORKFLOW.read_text(encoding="utf-8") if EXPORTER_WORKFLOW.exists() else ""
    exporter_config = EXPORTER_CONFIG.read_text(encoding="utf-8") if EXPORTER_CONFIG.exists() else ""
    exporter_health = EXPORTER_HEALTH.read_text(encoding="utf-8") if EXPORTER_HEALTH.exists() else ""
    for token in (
        'cloudflare/cloudflare-prometheus-exporter',
        'c98fd6772a4ff806e40ba08cb5d4edb002ef13dc',
        'CLOUDFLARE_EXPORTER_API_TOKEN',
        'CLOUDFLARE_EXPORTER_BASIC_AUTH_USER',
        'CLOUDFLARE_EXPORTER_BASIC_AUTH_PASSWORD',
        'python3 -S chess-studio/scripts/cloudflare_exporter_config.py --self-test',
        'python3 -S chess-studio/scripts/cloudflare_exporter_health.py --self-test',
        'python3 -S chess-studio/scripts/cloudflare_exporter_config.py --root upstream-exporter',
        'python3 -S chess-studio/scripts/cloudflare_exporter_health.py',
    ):
        if token not in exporter_workflow:
            fail(f"workflow exporter Cloudflare incompleto: {token}")
    for token in (
        'DISABLE_UI',
        'DISABLE_CONFIG_API',
        'HOST_METRICS_ALLOWLIST',
        'chess-studio.shadowops.dpdns.org',
        'staging.chess-studio.shadowops.dpdns.org',
        'CF_HTTP_STATUS_GROUP',
        'workers_dev',
    ):
        if token not in exporter_config:
            fail(f"config exporter Cloudflare incompleta: {token}")
    for token in (
        'attempts: int = 60',
        'delay_seconds: float = 5',
        'health.status == 200',
        'metrics.status == 200',
        'line.startswith(b"cloudflare_")',
        'unauth.status != 401',
        'esperaba 401',
        'HTTP Basic Auth',
    ):
        if token not in exporter_health:
            fail(f"health exporter Cloudflare incompleta: {token}")
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
    billing_titles = {"P0 · OCI · coste mes", "P0 · Cloudflare · coste variable ciclo"}
    overview_titles = {str(row.get("title") or "") for row in overview_data.get("panels") or []}
    if billing_titles - overview_titles:
        fail("overview perdió los dos widgets P0 de billing")
    billing_exprs = "\n".join(
        str(target.get("expr") or "")
        for row in overview_data.get("panels") or []
        if str(row.get("title") or "").startswith("P0 ·")
        for target in (row.get("targets") or [])
    )
    for provider in ("oci", "cloudflare"):
        token = f'last_over_time(chess_studio_billing_cost_current_cycle{{provider="{provider}"}}[12h])'
        if token not in billing_exprs:
            fail(f"overview billing no cubre {provider} con ventana de frescura 12h")
    if 'or vector(0)' in "\n".join(
        str(target.get("expr") or "")
        for row in overview_data.get("panels") or []
        if str(row.get("title") or "").startswith("P0 ·")
        for target in (row.get("targets") or [])
    ):
        fail("billing P0 no debe convertir ausencia de datos en coste cero")

    billing_workflow = BILLING_WORKFLOW.read_text(encoding="utf-8") if BILLING_WORKFLOW.exists() else ""
    for token in (
        "cron: '17 */6 * * *'",
        "CLOUDFLARE_BILLING_API_TOKEN",
        "CLOUDFLARE_API_TOKEN",
        "OCI_TENANCY_OCID",
        "setup-oci-sdk",
        "billing_cost_export.py --self-test",
        "python3 scripts/billing_cost_export.py",
    ):
        if token not in billing_workflow:
            fail(f"workflow billing incompleto: {token}")
    billing_exporter = BILLING_EXPORTER.read_text(encoding="utf-8") if BILLING_EXPORTER.exists() else ""
    for token in (
        "/billable-usage",
        "RequestSummarizedUsagesDetails",
        'query_type="COST"',
        "computed_amount",
        "BilledCost",
        "read_private_runtime_value",
        "CHESS_AI_SHARED_SECRET",
        "/api/internal/billing-costs",
        "X-Chess-Signature",
    ):
        if token not in billing_exporter:
            fail(f"exporter billing incompleto: {token}")

    system_api = (ROOT / "backend-python" / "system_api.py").read_text(encoding="utf-8")
    for token in ("/api/internal/billing-costs", "x-chess-signature", "record_billing_costs_otel"):
        if token not in system_api:
            fail(f"backend billing ingest incompleto: {token}")
    if "chess_studio_billing_cost_current_cycle" not in tracing or "create_observable_gauge" not in tracing:
        fail("backend perdió el gauge observable de billing")

    for panel_id in (2, 4, 5):
        panel = next((row for row in overview_data.get("panels") or [] if row.get("id") == panel_id), None)
        if not panel or "vector(0)" not in str((panel.get("targets") or [{}])[0].get("expr") or ""):
            fail(f"panel métrico {panel_id} debe representar ausencia de muestras como cero")

    infra_logs = (INFRA / "dashboards" / "chess-studio-logs.json").read_text(encoding="utf-8")
    if '"query": "{}"' in infra_logs:
        fail("Loki selector no puede volver a {}")

    for token in ('chess-studio-backend-staging', '"type": "custom"', 'multi-environment'):
        if token not in infra_logs:
            fail(f"Loki debe permitir separar producción/staging: {token}")

    oci_compose = (ROOT / "infra" / "oci" / "runtime" / "docker-compose.yml").read_text(encoding="utf-8")
    oci_alloy = (ROOT / "infra" / "oci" / "runtime" / "alloy.alloy").read_text(encoding="utf-8")
    oci_deploy = (ROOT / "scripts" / "oci_existing_a1_deploy.sh").read_text(encoding="utf-8")
    for token in ('grafana/alloy:v1.19.2', './alloy.alloy:/etc/alloy/config.alloy:ro', '/proc:/host/proc:ro', '/sys:/host/sys:ro'):
        if token not in oci_compose:
            fail(f"OCI host telemetry incompleta: {token}")
    for token in ('sys.env("ENVIRONMENT")', 'service_name', 'chess-studio-oci-host', 'otelcol.exporter.otlphttp "grafana_cloud"'):
        if token not in oci_alloy:
            fail(f"OCI Alloy no etiqueta/exporta correctamente: {token}")
    for token in ('start_observability_best_effort', 'OCI_ALLOY state=degraded', 'CHESS_STUDIO_ALLOY_OK', 'record_successful_backend "$sha"'):
        if token not in oci_deploy:
            fail(f"deploy OCI perdió observabilidad fail-open: {token}")

    print(f"grafana-dashboard-check OK · {len(panels)} paneles logs · API publisher 4 dashboards · OTLP + Cloudflare edge")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
