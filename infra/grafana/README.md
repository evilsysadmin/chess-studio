# Grafana Cloud · dashboards as code

Terraform publica cuatro dashboards bajo la carpeta **Chess Studio**:

- `chess-studio-api-overview` · salud operativa rápida.
- `chess-studio-logs` · 404, 5xx, p95, release, `request_id` y `trace_id` accionables.
- `chess-studio-traces` · Tempo/TraceQL para latencia y errores.
- `chess-studio-edge` · tráfico, errores, países, seguridad y Workers vistos desde Cloudflare.

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

## Cloudflare → Prometheus → Grafana

Chess Studio prepara el **exporter oficial de Cloudflare** desde `.github/workflows/cloudflare-prometheus-exporter.yml`. El workflow no copia ni mantiene un fork del exporter: hace checkout de `cloudflare/cloudflare-prometheus-exporter` fijado a un SHA revisable, ejecuta sus tests/typecheck, aplica sólo la configuración de Chess Studio y lo despliega como Worker en `metrics.shadowops.dpdns.org`.

El exporter expone métricas Prometheus de Cloudflare (requests, bandwidth, países, errores, firewall/security events, Workers, cache, etc.). Está protegido con HTTP Basic Auth, tiene la UI y API de configuración deshabilitadas y filtra el scope al account de Chess Studio. Las métricas por hostname se habilitan para:

- `chess-studio.shadowops.dpdns.org`
- `staging.chess-studio.shadowops.dpdns.org`

### Secretos del exporter

No reutilices `CLOUDFLARE_API_TOKEN` como token runtime del exporter. Ese token de CI puede escribir infraestructura y sería un privilegio innecesario en un Worker que sólo necesita observar.

Añade en GitHub:

- `CLOUDFLARE_EXPORTER_API_TOKEN` · token Cloudflare dedicado de **sólo lectura**. Como mínimo necesita `Zone > Analytics: Read`, `Account > Account Analytics: Read` y `Account > Workers Scripts: Read`. Permisos opcionales (SSL, Firewall Services, Load Balancers, Account Logs, etc.) sólo si quieres las métricas correspondientes.
- `CLOUDFLARE_EXPORTER_BASIC_AUTH_USER` · usuario aleatorio para proteger `/metrics` y `/health`.
- `CLOUDFLARE_EXPORTER_BASIC_AUTH_PASSWORD` · contraseña larga y aleatoria.

Variable opcional:

- `CLOUDFLARE_EXPORTER_FREE_TIER` · por defecto `true`. Hace que el exporter omita datasets que no están disponibles en cuentas Free. Cámbiala a `false` sólo si el plan de Cloudflare se amplía.

Si faltan estas credenciales, el workflow termina correctamente pero **no despliega** un exporter inseguro; deja en el summary cuáles faltan.

### Scrape desde Grafana Alloy

Grafana Cloud no scrapea automáticamente un endpoint arbitrario de Internet. La instancia de Alloy que ya envía métricas al stack debe scrapear el exporter y hacer `remote_write`.

El snippet versionado está en:

`infra/grafana/alloy/cloudflare-exporter.alloy.example`

Añádelo al Alloy que ya contiene `prometheus.remote_write.metrics_service` y expón a ese proceso las mismas credenciales:

- `CLOUDFLARE_EXPORTER_BASIC_AUTH_USER`
- `CLOUDFLARE_EXPORTER_BASIC_AUTH_PASSWORD`

El scrape recomendado es cada 60 s. El exporter oficial refresca sus datos en background y las consultas de Prometheus leen el estado cacheado, así que no hace una consulta Cloudflare completa por cada scrape.

### Humanos vs ruido de Internet

El dashboard `Chess Studio · Edge / Cloudflare` responde a preguntas operativas: requests, 4xx/5xx, países, acciones WAF/firewall, Workers AI y cache. **Un request no equivale a una persona**: crawlers, scanners y bots también cuentan.

Para medir popularidad humana (visitantes, pageviews y navegación SPA), usa **Cloudflare Web Analytics/RUM** sobre el hostname de producción. `scripts/cloudflare_production_pages.py` intenta activarlo durante el cutover de Pages; si el token de CI no tiene permisos `Account Settings`, la migración no falla y el workflow lo deja como aviso para configurarlo aparte.
