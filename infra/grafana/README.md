# Grafana Cloud · dashboards as code

Terraform publica tres dashboards bajo la carpeta **Chess Studio**:

- `chess-studio-api-overview` · salud operativa rápida.
- `chess-studio-logs` · 404, 5xx, p95, release, `request_id` y `trace_id` accionables.
- `chess-studio-traces` · Tempo/TraceQL para latencia y errores.

El workflow `.github/workflows/grafana-dashboards.yml` adopta la carpeta y dashboards existentes antes del plan porque el runner es efímero y no hay backend remoto de Terraform.

## GitHub

Secrets: `GRAFANA_URL`, `GRAFANA_AUTH`.

Variables opcionales: `GRAFANA_METRICS_DATASOURCE_UID`, `GRAFANA_LOGS_DATASOURCE_UID`, `GRAFANA_TRACES_DATASOURCE_UID`.

## Tempo / OTLP en Render

Configura en Render los secretos que Grafana Cloud muestra en **OpenTelemetry → Send traces**:

- `OTEL_EXPORTER_OTLP_ENDPOINT` (gateway OTLP de tu stack; normalmente termina en `/otlp`).
- `OTEL_EXPORTER_OTLP_HEADERS` (cabecera Authorization generada por Grafana Cloud).

Chess Studio añade `service.name=chess-studio-backend`, `service.version` y `deployment.environment.name`. El muestreo por defecto es 20% (`parentbased_traceidratio`) para no convertir Render Free en una fábrica de telemetría. Si OTLP no está configurado o falla al arrancar, el backend continúa sin tracing.
