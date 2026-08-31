# Staging de Chess Studio

El staging es un entorno compartido y efímero para validar un SHA **antes** de mezclar la PR a `main` y, por tanto, antes del despliegue de producción.

## Flujo

1. Una PR ejecuta `Chess Studio CI/CD` (unit, backend, Playwright, Trivy/Docker, etc.).
2. Si esa CI termina verde y la PR pertenece a este mismo repositorio, `Chess Studio Staging` despliega exactamente el `head SHA` validado.
3. Render despierta/compila `chess-study-backend-staging` mediante Deploy Hook.
4. El frontend se compila con `VITE_API_URL` del backend staging y se publica por Direct Upload en Cloudflare Pages.
5. El workflow hace smoke de `/api/ready`, HTML y el bundle JS real desplegado.
6. Se valida manualmente en `https://staging.chess-studio.shadowops.dpdns.org`.
7. Sólo entonces se mergea la PR. El pipeline existente de `main` sigue siendo el que despliega producción.

También se puede ejecutar `Chess Studio Staging` manualmente desde Actions indicando cualquier ref/SHA del repositorio.

## Aislamiento de datos

Staging y producción usan deliberadamente el mismo cluster/URI de MongoDB Atlas, pero bases lógicas distintas:

- producción: `MONGO_DB_NAME=chess_study`
- staging: `MONGO_DB_NAME=chess_study_staging`

`backend-python/db.py` falla al arrancar si `ENVIRONMENT=staging|preview|test` intenta usar `chess_study`. Esto evita que una variable mal puesta convierta staging en un lanzallamas contra datos reales.

Los orígenes también son distintos, así que cookies/storage/PWA del navegador no comparten namespace entre staging y producción.

## Preparación única en Render

Crear el servicio staging usando `render.staging.yaml` (Blueprint o configuración equivalente). Debe quedar con autodeploy desactivado.

Configurar los valores `sync: false` del Blueprint:

- `MONGO_URL`: la misma URI de Atlas que producción.
- `JWT_SECRET`: uno propio de staging.
- `CHESS_AI_SHARED_SECRET`: el mismo que autoriza el Worker AI mientras staging reutilice ese Worker.
- `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_HEADERS`: opcionales; si se copian, las señales quedan separadas por `OTEL_SERVICE_NAME=chess-studio-backend-staging`.

En Render > Settings > Deploy Hook, copiar el hook del servicio y guardarlo como secret del repo:

- `RENDER_STAGING_DEPLOY_HOOK`

El hook recibe `?ref=<sha>` y Render despliega ese commit exacto. El servicio Free vuelve a dormir por inactividad.

## Cloudflare

Ya existen en GitHub:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

El token debe incluir **Cloudflare Pages: Edit/Write** además de los permisos que ya usa el proyecto. El workflow crea idempotentemente:

- Pages project: `chess-studio-staging`
- production branch lógica del proyecto: `staging`
- custom domain: `staging.chess-studio.shadowops.dpdns.org`

El build de staging fuerza `VITE_PUBLIC_BASE=/`; producción conserva su configuración actual de GitHub Pages/custom domain.

## Identidad visible

Los builds staging muestran una banda pequeña fija:

`STAGING · <8 primeros caracteres del SHA>`

Además `release.json` se genera con el SHA real (`VITE_BUILD_SHA`) para poder correlacionar navegador, CI y despliegue.
