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

Configura en Render los secretos que Grafana Cloud muestra en **OpenTelemetry → Send data**. Chess Studio usa el mismo gateway OTLP para trazas, métricas y logs:

- `OTEL_EXPORTER_OTLP_ENDPOINT` (gateway OTLP de tu stack; normalmente termina en `/otlp`).
- `OTEL_EXPORTER_OTLP_HEADERS` (cabecera Authorization generada por Grafana Cloud).

Chess Studio añade `service.name=chess-studio-backend`, `service.version` y `deployment.environment.name`. En producción se muestrea actualmente el 100% (`parentbased_traceidratio`, ratio 1.0) mientras el tráfico es reducido, para que Tempo sea verificable y no confundir ausencia de muestras con fallo de exportación. Si el tráfico crece, el ratio puede bajarse después. Si OTLP no está configurado o falla al arrancar, el backend continúa sin tracing.

El backend enlaza FastAPI/HTTPX **explícitamente** con su propio `TracerProvider` OTLP. Esto evita un caso engañoso: otro proveedor global del proceso podía generar `trace_id` válidos en los logs pero no exportarlos a Tempo. El probe de Admin usa ese mismo provider dedicado.


## Diagnóstico de las tres señales

Admin → Estado operativo → **Probar logs + métricas + trazas** emite un evento sintético por los tres canales y fuerza flush. Si una señal aparece `OFF`, revisa `OTEL_EXPORTER_OTLP_ENDPOINT` y `OTEL_EXPORTER_OTLP_HEADERS` en Render. Si aparece configurada pero no hace flush, revisa las credenciales/endpoint del stack. Los dashboards usan `service_name="chess-studio-backend"` para Loki y métricas OTLP reales para Prometheus; ya no calculan las métricas principales a partir de logs.


Los exporters reciben también `OTEL_EXPORTER_OTLP_HEADERS` de forma explícita por señal. El dashboard de salud usa Prometheus para métricas OTLP; un resultado vacío correcto se representa como 0, mientras un error de datasource/consulta sigue apareciendo como error.
