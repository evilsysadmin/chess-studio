# GitHub Actions · mapa operativo

Última auditoría: 2026-10-04.

Regla: cada workflow debe representar un dominio operativo o blast radius real. Se fusiona duplicación histórica; no se fusionan promoción, rollback o acreditación sólo para bajar el contador.

## Contrato SRE

- Rutas críticas fijan `ubuntu-24.04`; nada de `ubuntu-latest` flotante donde una imagen distinta pueda alterar una release.
- Node usa cache de descarga de `setup-node` + `node_modules` exacto mediante `.github/actions/cache-node-modules`.
- Python usa cache de descarga de `setup-python` + `.venv` exacto mediante `.github/actions/cache-python-venv`.
- Browser E2E usa `.github/actions/setup-browser-e2e`: dependencias exactas y caches Playwright separadas `chromium`/`all` para que un cache Chromium-only no convierta Firefox/WebKit en descargas perpetuas.
- Los E2E especializados War Room/Matthias viven dentro del gate requerido `Tests · Playwright`; se seleccionan por superficie y comparten un único `frontend/dist` compilado por SHA con las lanes core.
- Wrangler está pinneado/cacheado mediante `.github/actions/setup-wrangler` en staging, preview y producción.
- Trivy cachea binario + DB por versión/día. Si el refresh remoto falla y existe una DB previa, escanea en modo degradado explícito con la copia stale; si no existe DB, falla cerrado.
- Security images usa BuildKit + cache GHA para reutilizar capas Docker y no depender del registry si lockfiles/capas siguen válidos.
- `npm audit` y `pip-audit` son señales auxiliares. Trivy conserva la política bloqueante por severidad.
- `scripts/test_suite_audit.mjs --ci-wiring` impide resucitar workflows retirados, `npm ci` directo, cache keys por `github.run_id`, builds Playwright duplicados y runners flotantes en rutas críticas.
- Las PR usan **GitHub native auto-merge**. Ningún workflow del repo espera checks para ejecutar `gh pr merge`, ni existe un handoff que redispare CI después del merge.
- Un push directo excepcional a `main` no recibe bypass: `Main · admission` lo detecta y ejecuta un gate completo sobre ese HEAD exacto antes de permitir staging.
- El release canónico de staging no aplica Terraform ni arranca K3s. El fast-path normal consume el runtime instalado; si cae al control-plane, reconcilia el contrato CURRENT Vault + Git antes del deploy para no acreditar runtime legado.
- El fast-path del backend no acredita un `/release` transitorio: el edge expone `/api/_deploy/committed` con el SHA que el host sólo publica después de superar todas las attestations post-cutover. Un rollback restaura el marcador anterior y GitHub exige ese SHA comprometido antes de declarar convergencia.
- `oci-staging-mutations` se reserva para operaciones que realmente mutan OCI/host. Diagnósticos y probes read-only no deben bloquear un deploy por compartir un mutex innecesario.
- La concurrencia distingue **cancelable work** de **remote mutation**. Lanes read-only, visuales o de post-check pueden usar `cancel-in-progress: true` para matar trabajo stale. Un deploy/Terraform/runtime-sync que ya está mutando OCI/host se serializa con `cancel-in-progress: false`: abortarlo a mitad puede dejar estado parcial. La generación obsoleta se descarta mediante exact-SHA/supersession al adquirir el lock, antes de su siguiente mutación; no se deja sobrescribir una generación más nueva.

## Path filters y blast radius

Los `paths`/`paths-ignore` forman parte del contrato de calidad: deben representar la superficie que un gate realmente consume, no sólo el lenguaje del archivo cambiado.

- Si un gate escanea un árbol completo, un Markdown dentro de ese árbol puede activar o incluso fallar el gate. Antes de añadir `paths-ignore: '**/*.md'`, estrechar el propio gate para que inspeccione sólo archivos semánticamente relevantes si ésa es la intención.
- No ampliar una lane pesada a todo el repo por comodidad. War Room, Pawn Slug, Blender, OCI y visuales deben seguir siendo path-aware.
- Tampoco ocultar un archivo de un workflow si ese archivo sí cambia el contrato que el workflow valida (por ejemplo manifests, AGENTS scoped consumidos por tooling, builders, test fixtures o contratos de runtime).
- Un cambio docs-only que no puede alterar el runtime no debería provocar builds/export/render costosos una vez que el gate haya sido correctamente delimitado.
- Cuando se cambia un path filter, añadir/actualizar un test de wiring o contract check que pruebe al menos un path que debe activar y otro que no.
- Si una nueva clase de archivo empieza a ser leída por un gate, actualizar path filter y documentación en la misma PR.

Lección operativa: no resolver falsos positivos de CI debilitando el gate a ciegas; primero decidir si el archivo pertenece realmente a su superficie semántica.

## Acciones reutilizables

| Acción | Responsabilidad |
| --- | --- |
| `../actions/cache-node-modules/action.yml` | Árbol `node_modules` exacto por runner/Node/lockfile; `npm ci --prefer-offline` sólo en miss. |
| `../actions/cache-python-venv/action.yml` | `.venv` exacto por runner/Python/requirements; valida runtime, stamp e imports. |
| `../actions/setup-browser-e2e/action.yml` | Node + frontend/E2E deps + Playwright scope + verificación de ejecutables. |
| `../actions/setup-wrangler/action.yml` | Wrangler exacto por versión; npm sólo en cache miss. |
| `../actions/setup-oci-sdk/action.yml` | OCI SDK pinneado/cacheado para los workflows que realmente hablan con OCI. |

## Cadena de entrega

| Workflow | Responsabilidad |
| --- | --- |
| `cicd.yml` | Gate principal quality-only para PR. Preflight y luego frontend/Python/Go/security/E2E según superficie. El job Go siempre ejecuta format, race/integration tests, vet y build ARM64; sólo instala Python y regenera corpora cuando cambia la autoridad/generador/fixture de paridad. Python y Go se agregan bajo el required estable `Tests · Backend`; las lanes Playwright core + War Room/Matthias quedan bajo `Tests · Playwright` y consumen un build compartido. No despliega. |
| `pr-track-label.yml` | GP-0 (#34): toda PR lleva etiqueta de pista (`ux-mobile`/`ux-desktop`/`ux-claude`/`track-*`) o falla `Contracts · PR track label`. Se re-evalúa cuando cambia el SHA (`synchronize`) o cambian las etiquetas (`labeled`/`unlabeled`); Draft→Ready no vuelve a gastar runner porque no modifica ninguna de esas entradas. Sparse checkout de un único script. La protección clásica de `main` todavía no incluye este contexto entre sus cinco required checks; hasta corregir ese ajuste remoto, el workflow sigue siendo guard visible pero no una barrera de merge por sí solo. |
| `main-admission.yml` | Clasifica el HEAD de `main`. Si procede de PR, reutiliza la acreditación Quality inmutable; direct/ambiguo exige Quality exact-HEAD. Cuando necesita revalidar un árbol compuesto por merges concurrentes, vuelve a comprobar `main` justo antes del static-preflight y autocancela la generación si ya fue superseded, evitando gastar el gate en un SHA muerto sin convertirlo en falso verde. Además clasifica la superficie de deploy fail-open: una PR inequívocamente docs/tests/CI-only —incluido tooling de evidencia visual (`app-visual` workflow/composite, `scripts/app_visual_*` y freeze visual) y gates estáticos explícitos como `dead_code_reachability_check.py`— omite el prebuild de frontend; cualquier duda conserva el camino normal. Delivery/staging tooling sigue fallando abierto hacia deploy y no puede autoeximirse. |
| `menu-ux-audit.yml` | Auditoría visual manual/efímera de menús y superficies intermedias. Captura desktop+móvil y emite PNG/JSON de densidad, overflow y targets; no es gate requerido ni corre en cada PR. |
| `staging-deploy.yml` | Revalida superficie y supersede antes de mutar. El prepare resuelve **una sola vez** el diff contra la última generación completa de staging y de ahí deriva Pawn Slug, Resend y continuity. Tras backend + Pages + Worker + smoke, el summary despacha Resend/continuity sólo cuando su flag es verdadero; si no, esos workflows ni siquiera nacen. PRs docs/tests/CI-only siguen siendo no-op y un no-op no acredita producción. |
| `staging-deploy-continuity.yml` | Drill explícito/manual/reusable de continuidad blue/green. Ya no escucha cada staging: `staging-deploy.yml` lo despacha sólo cuando el diff durable desde la última generación completa toca backend/runtime/deploy. Conserva guard de current-main antes de ejecutar. |
| `staging-ai-worker.yml` | **Staging · accreditation**: antes de acreditar un run automático exige que el upstream tenga verdes prepare + backend + frontend + Worker + ambos smokes + summary; un run superseded/no-op no puede emitir credencial. Los helpers de control-plane se ejecutan desde el SHA del propio workflow, no desde el SHA desplegado, para que una mejora de acreditación pueda validar generaciones anteriores sin depender de código aún ausente allí. Después valida lineage y emite la acreditación inmutable. No despliega ningún Worker. |
| `production-promote.yml` | Promueve sólo un SHA acreditado. Worker Terraform `plan/apply` permanece aquí; el backend se selecciona mediante el interruptor versionado `.github/production-deploy.env` (`render|oci`) y el helper de ruta posee el CNAME del API. Pages continúa después sobre el mismo SHA. |
| `production-rollback.yml` | Rollback manual a un SHA conocido. Blast radius distinto: no fusionar con promote. |
| `staging-preview.yml` | Preview/restauración manual frontend-only sobre staging; no acredita ni entra en producción. Usa deps exactas + Wrangler cacheado. |
| `render-production-guardrail.yml` | Guardrail específico de auto-deploy/configuración Render producción. |

## OCI staging · infraestructura y control-plane

| Workflow | Responsabilidad |
| --- | --- |
| `oci-readiness.yml` | Validación OCI path-aware para PR: contratos, runtime bundle y ARM64 sólo cuando cambia la imagen backend/su smoke o la propia lane ARM64. `workflow_dispatch` añade validaciones Terraform estáticas. **No muta staging ni publica K3s al mergear.** |
| `oci-resend-bootstrap.yml` | Bootstrap one-shot de recuperación por Resend. Ya no escucha cada staging ni paga un runner de scope: `staging-deploy.yml` lo despacha explícitamente sólo cuando el marker cambió desde la última generación completa. `workflow_dispatch` permanece como escape manual; el mutex OCI sólo existe en el job mutante y conserva los SHA ya servidos. |
| `oci-staging-deploy.yml` | Mutación Terraform manual y exacta sobre `main`. `scope=full` conserva el apply completo + convergencia de agente/egress; `scope=backup-storage` reconcilia sólo el bucket privado de backups y la policy IAM que lo autoriza, sin tocar compute/red/LB. Ambos scopes comparten mutex y anti-stale exact-SHA. Es el único apply de infraestructura production-grade de OCI staging. |
| `oci-staging-service.yml` | Front-door manual para diagnóstico y operaciones del runtime Docker/Compose de la A1. `deploy`, `runtime-sync`, `vault-bootstrap`, egress y recuperación toman el mutex de mutación; diagnósticos y validaciones read-only no bloquean releases. |
| `oci-staging-lab.yml` | Laboratorio manual Terraform limitado a `probe`, `plan`, `bootstrap` y `destroy`; no ofrece un segundo `apply` desnudo. |
| `oci-staging-tunnel.yml` | Reconciliación manual del túnel/DNS de staging, serializada sólo porque sí muta control-plane. |

Docker/Compose es el runtime canónico de la A1 Always Free. K3s/Flux queda en **HOLD experimental**: sus scripts y manifests pueden conservarse como laboratorio reproducible, pero no se exponen desde el front-door operativo, no participan en release/recovery ordinario y no deben condicionar staging ni producción. Sólo se reevalúa Kubernetes si aparecen requisitos reales de HA/multinodo, scheduling, autoscaling o una topología de servicios que Compose ya no resuelva.

Render staging está retirado del plano de despliegue: el **release canónico y `runtime-sync` consumen Vault + Git y no consultan Render**, y ya no existe un workflow capaz de reconciliar, reanudar o desplegar el antiguo servicio staging. El cutover inicial a CURRENT Vault ya está acreditado; su workflow/helper one-shot se retiraron para que una migración histórica no permanezca como superficie operativa activa. Render producción permanece independiente y no forma parte de esta retirada.


## Runtimes, assets y laboratorios especializados

| Workflow | Responsabilidad |
| --- | --- |
| `main-backend-image.yml` | Tras `Main · admission`, un clasificador x86 barato reutiliza `staging_deploy_scope.py`, corta merges inequívocamente non-runtime y clasifica cambios reales en `backend-python` / `backend-go` antes de elegir runner. Cada build publica tanto el tag exacto `oci-<sha>` como un tag content-addressed `tree-<git-tree-sha>`; si el árbol backend no cambia, x86 reutiliza ese contenido y sólo crea los aliases exact-SHA, sin ARM, QEMU ni pulls de capas. El exact-tag del padre sirve únicamente para sembrar el primer `tree-*` durante la transición; si no existe ninguna fuente reutilizable se conserva el fallback de build arm64. |
| `chess-football-godot-poc.yml` | Valida y exporta el runtime web Godot de Chess Football; PR valida, `main`/manual pueden publicar su bundle. Sigue siendo una superficie experimental aislada del release principal. |
| `blender-setup-smoke.yml` | Smoke real de Blender/EGL y helpers compartidos cuando cambia `setup-blender-canonical`; evita romper todas las lanes de arte desde una acción común. |
| `chronicles-party-blender-art.yml` | Genera y valida party/escena canónica de Chronicles con previews deterministas; read-only en PR. |
| `combat-operations-room-blender-art.yml` | Genera, valida y publica a staging/revisión exacta la Combat Operations Room; `main` puede publicar su canal runtime sin tocar War Room. |
| `home-matthias-blender-art.yml` | Genera y valida el Matthias canónico de Home desde sus fuentes Blender; lane read-only y path-aware. |
| `home-matthias-materialize.yml` | Materialización explícita de binarios canónicos de Matthias al etiquetar una PR interna; separa build read-only y commit write con guard de SHA. |
| `pvp-duel-room-blender-art.yml` | Genera/valida/publica el shell Blender de la Sala de Duelos en su superficie path-aware. |
| `war-room-v4-blender-art.yml` | Genera/valida/publica War Room v4 sin reemplazar las generaciones anteriores. |
| `pawn-slug-enemy-cast-v2.yml` | Regenera, prueba y publica el cast enemigo v2 de Pawn Slug; conserva evidencia visual e identidad R2 verificable. |
| `staging-pawn-slug-visual.yml` | Reusable/manual de evidencia live de Pawn Slug. Comparte con Resend/continuity el baseline durable calculado una vez por `staging_deploy_prepare.py`; sólo se invoca cuando ese diff contiene superficie Pawn Slug y vuelve a exigir backend/frontend/worker en el SHA solicitado. |
| `home-r2-assets.yml` | Valida y publica a R2 los assets 3D específicos de Home; PR sólo valida y `main`/manual publican. |
| `r2-assets-infra.yml` | Contrato/reconciliación de bucket, dominio, CORS y manifiesto R2 compartido. Además ejecuta GC conservador diario: protege manifest/runtime/aliases `current.*`, poda duplicados y generaciones/revisiones obsoletas, y presiona hacia 8.0 GB al superar 8.5 GB; muta sólo fuera de PR. |
| `security-llm-lab.yml` | Laboratorio manual y acotado para revisión LLM de backend; nunca forma parte de los required checks ni de la entrega. |

## Calidad especializada

| Workflow | Responsabilidad |
| --- | --- |
| `app-visual-artifact.yml` | Evidencia visual path-aware. El trigger server-side se limita a cambios que pueden producir píxeles de producto; tooling de clasificación/orquestación visual se acredita en Quality y no despierta capturas por sí solo. `warroom-core` ejecuta primero un canario móvil barato y fail-closed de la variante activa/default; después captura los perfiles desktop 1440×900 en una sesión autenticada compartida y serial, cambiando de variante dentro de la misma partida para pagar el bootstrap pesado una sola vez; por último drena los perfiles móviles restantes con 2 workers. |
| `e2e-full.yml` | Sweep completo Chromium/Firefox/WebKit mensual/manual e informativo. Ya no duplica PR: la matriz requerida y path-aware War Room/Matthias vive en `cicd.yml`. |
| `home-blender-v2-preview.yml` | Evidencia PNG Home path-aware en PR con envelope de revisión barato; los renders manuales conservan calidad alta. |
| `home-blender-v2-runtime.yml` | Exporta/publica el GLB Home sólo en `main` o manual, luego ejecuta su gate browser y promoción. No repite el export runtime en PR: la revisión visual PR pertenece al preview PNG. |
| `war-room-blender-art.yml` | Genera, valida y publica el shell Blender de War Room v2 en su canal R2 propio. |
| `pvp-duel-hall-blender-art.yml` | Genera y valida la shell 3D authored de la Sala de Duelos del lobby; en esta fase produce preview/GLB revisables sin promocionarlos todavía a runtime. |
| `war-room-v3-blender-art.yml` | Genera, valida y publica la sala cartográfica de War Room v3 sin reemplazar v1/v2. |
| `coverage.yml` | Señales periódicas no bloqueantes: coverage frontend/backend mensual y CodeQL semanal; `workflow_dispatch` ejecuta ambos bajo demanda. CodeQL mantiene `security-events: write` limitado a su propio job. |
| `pawn-slug-matthias-sprite-smoke.yml` | Evidencia PNG de sprites runtime Pawn Slug. En PR separa Matthias/enemigos por ownership; tras staging omite deploys sin superficie sprite; manual conserva smoke completo. Matthias aplica además un gate fail-closed de continuidad de escala/footline para `idle` y overlays `run12`/`run13`. |

## Observabilidad y operación

Para producción pública, un fallo del synthetic es una señal operativa, no ruido de CI: comprobar primero `/api/ready`, después release/SHA servido y finalmente logs correlacionados por request/trace id. Si la degradación coincide con una promoción reciente, detener nuevas promociones y usar el rollback canónico antes de investigar cambios secundarios. El synthetic corre cada 15 minutos; GitHub Scheduler puede retrasar una ejecución, por lo que la cadencia es un objetivo de detección y no un SLA exacto.


| Workflow | Responsabilidad |
| --- | --- |
| `grafana-dashboards.yml` | Publica cuatro dashboards idempotentemente con la Grafana HTTP API. **Sin Terraform, provider, state, import, plan ni apply.** |
| `cloudflare-prometheus-exporter.yml` | Valida/despliega el exporter oficial Cloudflare cuando cambia su superficie. |
| `synthetic-health.yml` | Canary sintético de producción cada 15 minutos (minutos 07/22/37/52 para evitar el top-of-hour herd). Valida liveness, readiness y gameplay autenticado; vive separado para funcionar aunque no haya releases. |
| `production-mongo-backup.yml` | Backup semanal de `chess_study` desde la A1 OCI. Genera `mongodump --archive --gzip`, valida con `mongorestore --dryRun`, sube el archive+manifest a `chess-studio-production-backups`, lo descarga y restaura en scratch aislado antes de podar. Conserva 2 copias locales y 8 generaciones off-host. |
| `pvp-python-fallback.yml` | Evidencia para retirar el respaldo Python del PvP: cuenta en Grafana las peticiones públicas `/api/pvp` que aún llegan a FastAPI (todas tienen handler Go), por entorno y ruta. Diario y manual; con `max_requests` actúa como puerta. Sólo lectura. |
| `billing-cost-export.yml` | Exporta costes OCI + Cloudflare cada 6 h y manualmente; publica la observación sin formar parte del release. |
| `capacity-staging.yml` | Probe de curva de servicio A1 + Mongo. Sólo carga staging por ejecución manual o rama `ops/capacity-*`; las PR ordinarias no ejecutan carga. |
| `capacity-virtual-players.yml` | Probe 20/50/100 jugadores virtuales. PR valida contratos; la carga real queda restringida a manual o ramas `ops/capacity-*`, nunca a un push normal de `main`. |
| `observability-live.yml` | Comprueba cada hora y tras publicar dashboards que señales de host/backend llegan a Grafana; sólo lectura. |
| `production-frontend-watchdog.yml` | Vigila el frontend público cada 5 min y dispone de self-heal acotado, serializado con promoción para no competir con un deploy. |
| `production-target-smoke.yml` | Smoke read-only del target de producción y gameplay/ruta pública cuando cambia el selector o sus helpers; manual bajo demanda. |

## Flujo

```text
PR
 │
 ▼
Quality · CI gate
 ├─ Frontend / Backend / Security
 └─ Tests · Playwright
 │
 ▼
GitHub native auto-merge
 │
 ▼
push main
 │
 ▼
Main · admission
 ├─ PR-derived ──> reuse Quality receipt + static preflight
 │                 (receipt not reusable ─> exact-HEAD fallback ↓)
 └─ direct HEAD ─> exact-HEAD fallback: dispatch Quality · CI gate --all
                   on main and wait for that exact SHA to go green
 │
 ▼
Deploy to staging
 ├─ OCI backend ─────────────┐
 ├─ Cloudflare Pages ────────┼─ mismo SHA
 └─ Cloudflare AI Worker ────┘
 │
 ├─ generation parity
 └─ browser smoke
 │
 ├─ post-deploy continuity drill (sólo backend/runtime/deploy)
 │
 ▼
Staging · accreditation (staging-ai-worker.yml)
 │
 ▼
Production · promote
 ├─ Cloudflare Worker + DNS
 ├─ Backend target: Render ↔ OCI
 └─ Cloudflare Pages
```

Fuera de la línea de release:

```text
OCI infra apply ────── manual
OCI runtime/Vault ─── manual para rotaciones; fallback de deploy reconcilia CURRENT Vault + Git
OCI tunnel ────────── manual
K3s/Flux lab ───────── HOLD experimental, fuera del front-door
Diagnostics ───────── manual/read-only, sin bloquear deploys
```

`workflow_dispatch` en `cicd.yml` queda como escape hatch manual, no como parte del camino normal de entrega. El fallback directo tampoco es el camino normal: existe para que un commit administrativo excepcional no deje staging esperando a que otra PR "arrastre" el HEAD.

## Objetivo de simplificación de staging OCI

Una vez que el camino OCI de staging esté acreditado extremo a extremo, simplificarlo significa **menos estados y menos pasos redundantes**, no menos garantías.

Objetivo:
- una generación = un SHA exacto y una única identidad de release;
- una sola ruta normal de mutación backend para staging;
- probes/readiness agrupados por propósito, sin repetir la misma comprobación en varias capas;
- fast-path corto cuando runtime/infra ya están sanos;
- fallback/control-plane sólo cuando una precondición real falla;
- pasos idempotentes y reentrantes donde sea posible;
- observabilidad suficiente para saber qué fase falló sin descargar logs enormes;
- superseded generations salen antes de mutar o acreditar;
- diagnósticos read-only no compiten con el mutex de mutación;
- rollback sigue siendo explícito y probado.

Antes de cambiar `cancel-in-progress: false` en una mutación remota ya iniciada:
1. demostrar que cada paso interrumpible deja estado consistente o tiene cleanup/reconcile idempotente;
2. demostrar backward compatibility entre frontend/backend durante el solapamiento de generaciones;
3. demostrar que una cancelación no puede dejar el host sin la última generación sana;
4. mantener exact-SHA y supersession como defensa incluso después de habilitar cancelación.

Se puede cancelar agresivamente trabajo previo **read-only o pre-mutation**. No confundir eso con abortar a mitad un deploy/terraform/runtime-sync que ya ha cambiado estado remoto.

Métrica de éxito de la simplificación: menos tiempo y menos branching en el camino normal, con igual o mejor capacidad de responder: qué SHA está servido, qué fase falló, qué se mutó y cómo volver al último estado sano.

## Fósiles retirados / límites fijados

- `auto-merge.yml` → retirado; sustituido por GitHub native auto-merge.
- `main-delivery-handoff.yml` → retirado; el merge nativo produce el `push` normal a `main` y no necesita redispatch.
- `matthias-visual.yml` → absorbido primero por `e2e-full.yml`; sus gates PR path-aware viven ahora en `cicd.yml`.
- `oci-arm64-readiness.yml` + `oci-terraform-readiness.yml` → `oci-readiness.yml`.
- Publicación K3s automática desde `oci-readiness.yml` → retirada.
- Auto-K3s tras cada `Deploy to staging` → retirado; lifecycle experimental no forma parte del release canónico.
- Operaciones K3s/staging2 dentro de `oci-staging-service.yml` → retiradas del front-door; el experimento queda preservado únicamente como tooling/lab fuera de la operación normal.
- `oci-vault-cutover-once.yml` + `oci_vault_cutover.py` → retirados tras acreditar CURRENT Vault; bootstrap/sync/validate normales permanecen en el service control.
- `staging-pages-fast.yml` → retirado; duplicaba checkout/build/deploy/verify de Pages. El único owner de Pages staging vuelve a ser `staging-deploy.yml`, que ya despliega frontend en paralelo con backend/Worker dentro de cada generación coherente.
- Mutex único para cualquier `oci-staging-service` → retirado; sólo las operaciones mutantes compiten con deploy/Terraform.
- `war-room-runtime-marathon.yml` → retirado; sus specs siguen cubiertas por el gate War Room path-aware y el sweep completo de `e2e-full.yml`.
- Regeneración/publicación canonical-scale de Matthias dentro de `pawn-slug-godot-web.yml` → retirada del hot path tras #3762; el runtime ya fija assets R2 inmutables revisados. Sprite Forge, Godot headless y evidencia visual siguen siendo gates activos.
- `codeql.yml` → absorbido por `coverage.yml` como señal periódica; conserva cadence semanal y permisos `security-events` limitados al job CodeQL.
- `infra/grafana/terraform/` → eliminado; dashboards pasan a publisher API state-less.
- Instalaciones Node directas en CI/coverage/browser/staging preview/producción → acciones de cache exacta.
- Cache Trivy por `github.run_id` → namespace estable por versión + epoch diario.
- Matriz Browser E2E duplicada en PR (`e2e-full.yml`) → integrada en el required check de Quality; `e2e-full.yml` queda como sweep multi-browser.
- `branch-housekeeping.yml` + `scripts/branch_housekeeping.sh` → retirados: `delete_branch_on_merge=true` ya poda las ramas mergeadas de forma nativa, sin cron duplicado.
- `pvp-go.yml` → retirado: format/race+Mongo/paridad/vet/ARM64 viven ya dentro de `Quality · CI gate` y acreditan el required `Tests · Backend`; `main` no vuelve a pagar una validación paralela no bloqueante.
- `pawn-slug-pistol-crouch-candidate.yml` → retirado tras promover y verificar `crouchContinuityV1`; era una lane one-shot de reparación/publicación de candidato y ya no protege una superficie runtime distinta.

El objetivo no es tener el mínimo número de YAML, sino **mínimo estado, mínima dependencia externa por ejecución y dominios de fallo claros**.


## Interruptor temporal de producción

`.github/production-deploy.env` contiene un único `DEPLOY_TARGET=render|oci`. Es deliberadamente distinto de `DEPLOY_ENV`: ambos targets ejecutan producción y usan la configuración/BD de producción. El workflow valida el archivo antes de cualquier mutación. El CNAME público del API ya no pertenece a Terraform; `scripts/oci_production_tunnel.py` lo conmuta sólo después de acreditar el SHA exacto en el target elegido. El rollback de producción siempre restaura primero la ruta del API a Render.
