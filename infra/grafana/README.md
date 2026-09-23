# Grafana Cloud · dashboards as code

Chess Studio publica siete dashboards versionados bajo la carpeta **Chess Studio** mediante la **Grafana HTTP API**:

- `chess-studio-api-overview` · salud operativa rápida.
- `chess-studio-logs` · 404, 5xx, p95, release, `request_id` y `trace_id` accionables.
- `chess-studio-log-explorer` · exploración Loki multi-entorno sin escribir LogQL.
- `chess-studio-traces` · Tempo/TraceQL para latencia y errores.
- `chess-studio-edge` · Cloudflare Free: salud del exporter, Workers y certificados; sin Analytics/WAF de pago.
- `chess-studio-security` · brute force, bloqueos, 401/403/429, presión de tráfico, IPs y países usando OTEL/Loki; sin métricas Cloudflare de pago.
- `chess-studio-oci-host` · salud del host OCI staging.

El publisher es `scripts/grafana_publish.py`. Es idempotente, usa sólo la biblioteca estándar de Python y hace:

1. validación opcional de los datasource UID con el token disponible;
2. adopción de la carpeta existente `Chess Studio` por título o creación con UID estable `chess-studio`;
3. render de los placeholders de datasource/release en los JSON versionados;
4. `POST /api/dashboards/db` con `overwrite=true`;
5. `GET /api/dashboards/uid/<uid>` para verificar cada publicación.

No hay Terraform, provider downloads, state remoto/local, imports ni `plan/apply` para dashboards. Para siete documentos JSON, la API de Grafana es el contrato operativo más pequeño y observable.

El workflow `.github/workflows/grafana-dashboards.yml` se ejecuta únicamente cuando cambian dashboards, publisher/contrato o el propio workflow, además de `workflow_dispatch` manual.

## GitHub

Secrets:

- `GRAFANA_URL`
- `GRAFANA_AUTH`

Variables opcionales:

- `GRAFANA_METRICS_DATASOURCE_UID`
- `GRAFANA_LOGS_DATASOURCE_UID`
- `GRAFANA_TRACES_DATASOURCE_UID`

El token puede mantener privilegio mínimo. Si no tiene permiso de lectura de datasources (`403`), el publisher avisa y continúa; la publicación real de dashboards sigue siendo la prueba autoritativa. Un `404`/error real sí falla.

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

El exporter queda fijado deliberadamente a **Cloudflare Free**. Chess Studio no configura hostname analytics ni consulta en sus dashboards métricas de Zone Analytics/GraphQL de pago. La allowlist visual se limita a salud del exporter, Workers account-level y estado de certificados. El propio exporter marca las zonas Free omitidas mediante `cloudflare_zones_skipped_free_tier`.

### Secretos del exporter

No reutilices `CLOUDFLARE_API_TOKEN` como token runtime del exporter. El runtime usa `CLOUDFLARE_EXPORTER_API_TOKEN`, dedicado y de sólo lectura. Conserva los permisos mínimos que exige el exporter oficial (`Zone > Analytics: Read`, `Account > Account Analytics: Read`, `Account > Workers Scripts: Read`) y `Zone > SSL and Certificates: Read` para el panel de certificados. No hacen falta permisos opcionales de Firewall Services, Load Balancers, Logs o Magic Transit para los dashboards de Chess Studio.

También necesita:

- `CLOUDFLARE_EXPORTER_BASIC_AUTH_USER`
- `CLOUDFLARE_EXPORTER_BASIC_AUTH_PASSWORD`

No existe un interruptor para habilitar métricas de pago: `CF_FREE_TIER_ACCOUNTS` se fuerza en la configuración generada.

### Scrape desde Grafana Alloy

Grafana Cloud no scrapea automáticamente un endpoint arbitrario de Internet. La instancia de Alloy que ya envía métricas al stack debe scrapear el exporter y hacer `remote_write`.

El snippet versionado está en:

`infra/grafana/alloy/cloudflare-exporter.alloy.example`

Añádelo al Alloy que ya contiene `prometheus.remote_write.metrics_service` y expón a ese proceso las mismas credenciales:

- `CLOUDFLARE_EXPORTER_BASIC_AUTH_USER`
- `CLOUDFLARE_EXPORTER_BASIC_AUTH_PASSWORD`

El scrape recomendado es cada 60 s. El exporter oficial refresca sus datos en background y las consultas de Prometheus leen el estado cacheado, así que no hace una consulta Cloudflare completa por cada scrape.

### Cloudflare Free vs telemetría de aplicación

El dashboard `Chess Studio · Cloudflare Free` sólo muestra métricas incluidas en la allowlist Free. Para tráfico real, errores, presión y seguridad de la aplicación usa OTEL/Loki en `Chess Studio · Salud operativa` y `Chess Studio · Security`. Para popularidad humana del frontend, Cloudflare Web Analytics/RUM puede seguir usándose como producto gratuito separado cuando esté habilitado.



## Costes P0 · OCI + Cloudflare

El dashboard **Chess Studio · Salud operativa** incluye dos stats P0 al principio: coste OCI del mes y coste variable Cloudflare del ciclo. Ambos leen `chess_studio_billing_cost_current_cycle` desde Prometheus y usan `last_over_time(...[12h])`: una ejecución perdida no borra el último coste inmediatamente, pero más de 12 horas sin una muestra válida aparece como **SIN DATOS** en vez de mentir con 0.

`.github/workflows/billing-cost-export.yml` ejecuta `scripts/billing_cost_export.py` cada seis horas. Reutiliza las credenciales OCI ya presentes en Actions, consulta OCI Usage API con `query_type=COST` y el endpoint de Cloudflare Billing `/accounts/<id>/billable-usage`. Después lee únicamente `CHESS_AI_SHARED_SECRET` —ya permitido para el runner— y envía un payload HMAC pequeño al backend de staging. El backend mantiene el gauge observable y lo exporta por su OTLP existente; `OTEL_EXPORTER_OTLP_HEADERS` no sale del runtime privado de OCI.

Para Cloudflare se prefiere el secreto `CLOUDFLARE_BILLING_API_TOKEN` con permiso mínimo **Account · Billing: Read**. Mientras no exista, el colector intenta `CLOUDFLARE_API_TOKEN` como compatibilidad; si ese token no puede leer Billing, la ejecución falla de forma explícita. El widget de Cloudflare cubre cargos **usage-based** y no cuotas fijas de plan/suscripción. OCI Cost Analysis puede llevar retraso de ingestión del proveedor, por lo que el valor no debe interpretarse como tiempo real al segundo.
