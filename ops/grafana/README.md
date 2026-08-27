# Grafana Cloud · Chess Studio

`chess-studio-logs.json` es el dashboard de **logging accionable**. No sustituye el dashboard de salud: responde a “qué ruta está fallando, desde qué release y con qué request ID”.

## Importación

1. Grafana → Dashboards → New → Import.
2. Sube `chess-studio-logs.json` y selecciona tu datasource Loki.
3. Ajusta la variable `selector` si el Loki tiene más servicios; por ejemplo `{service_name="chess-studio"}` o el label equivalente que aplique tu integración de Render.
4. Opcional: define en GitHub Actions/Pages `VITE_GRAFANA_CLOUD_URL` y, mejor, `VITE_GRAFANA_LOGS_DASHBOARD_URL` para que Admin abra directamente el stack o este dashboard.

## Qué resuelve

- 404 agrupados por `request_path` normalizado. Los IDs largos, UUID y números largos se sustituyen por `{id}` / `{n}` y nunca se incluye la query string.
- 5xx por ruta y por release de frontend.
- p95 por ruta y serie temporal por status.
- log drill-down con `request_id` para correlacionar con el traceback de Render.
- excepciones backend separadas del ruido de 4xx.

El selector `{}` es deliberadamente portable. En producción conviene limitarlo al servicio para evitar escanear logs ajenos y gastar cuota Loki.
