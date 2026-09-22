# GitHub Actions · mapa operativo

Última auditoría: 2026-09-22.

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
| `cicd.yml` | Gate principal quality-only para PR. Preflight y luego frontend/backend/security/E2E según superficie. Las lanes Playwright core + War Room/Matthias son bloqueantes bajo un único `Tests · Playwright` y consumen un build compartido. No despliega. |
| `main-admission.yml` | Clasifica el HEAD de `main`. Si procede de PR, reutiliza la acreditación Quality inmutable y hace preflight barato; si es un commit directo excepcional, ejecuta tests, security, Playwright, imágenes Docker y compose smoke sobre el SHA exacto. Sólo un run verde habilita staging. |
| `staging-deploy.yml` | Despliega una generación coherente del mismo SHA: backend exacto en **OCI staging**, frontend en Cloudflare Pages y AI en Cloudflare Worker; después exige paridad de generación y browser smoke. No consulta Render staging para desplegar el backend. |
| `staging-ai-worker.yml` | Revalida/acredita la generación de staging ya desplegada y emite la acreditación inmutable que permite promoción. El nombre se conserva por el contrato `workflow_run` existente. |
| `production-promote.yml` | Promueve sólo un SHA acreditado. Worker Terraform `plan/apply` permanece aquí; el backend se selecciona mediante el interruptor versionado `.github/production-deploy.env` (`render|oci`) y el helper de ruta posee el CNAME del API. Pages continúa después sobre el mismo SHA. |
| `production-rollback.yml` | Rollback manual a un SHA conocido. Blast radius distinto: no fusionar con promote. |
| `staging-preview.yml` | Preview/restauración manual frontend-only sobre staging; no acredita ni entra en producción. Usa deps exactas + Wrangler cacheado. |
| `render-production-guardrail.yml` | Guardrail específico de auto-deploy/configuración Render producción. |

## OCI staging · infraestructura y control-plane

| Workflow | Responsabilidad |
| --- | --- |
| `oci-readiness.yml` | Validación OCI path-aware para PR: contratos, runtime bundle y ARM64 sólo cuando cambia la imagen backend/su smoke o la propia lane ARM64. `workflow_dispatch` añade validaciones Terraform estáticas. **No muta staging ni publica K3s al mergear.** |
| `oci-staging-deploy.yml` | `terraform apply` manual y exacto sobre `main`, seguido por convergencia del agente OCI y egress reservado. Es el único apply de infraestructura production-grade de OCI staging. |
| `oci-staging-service.yml` | Front-door manual para diagnóstico y operaciones del runtime Docker/Compose de la A1. `deploy`, `runtime-sync`, `vault-bootstrap`, egress y recuperación toman el mutex de mutación; diagnósticos y validaciones read-only no bloquean releases. |
| `oci-staging-lab.yml` | Laboratorio manual Terraform limitado a `probe`, `plan`, `bootstrap` y `destroy`; no ofrece un segundo `apply` desnudo. |
| `oci-staging-tunnel.yml` | Reconciliación manual del túnel/DNS de staging, serializada sólo porque sí muta control-plane. |

Docker/Compose es el runtime canónico de la A1 Always Free. K3s/Flux queda en **HOLD experimental**: sus scripts y manifests pueden conservarse como laboratorio reproducible, pero no se exponen desde el front-door operativo, no participan en release/recovery ordinario y no deben condicionar staging ni producción. Sólo se reevalúa Kubernetes si aparecen requisitos reales de HA/multinodo, scheduling, autoscaling o una topología de servicios que Compose ya no resuelva.

Render staging está retirado del plano de despliegue: el **release canónico y `runtime-sync` consumen Vault + Git y no consultan Render**, y ya no existe un workflow capaz de reconciliar, reanudar o desplegar el antiguo servicio staging. El cutover inicial a CURRENT Vault ya está acreditado; su workflow/helper one-shot se retiraron para que una migración histórica no permanezca como superficie operativa activa. Render producción permanece independiente y no forma parte de esta retirada.

## Calidad especializada

| Workflow | Responsabilidad |
| --- | --- |
| `e2e-full.yml` | Sweep completo Chromium/Firefox/WebKit mensual/manual e informativo. Ya no duplica PR: la matriz requerida y path-aware War Room/Matthias vive en `cicd.yml`. |
| `coverage.yml` | Señales periódicas no bloqueantes: coverage frontend/backend mensual y CodeQL semanal; `workflow_dispatch` ejecuta ambos bajo demanda. CodeQL mantiene `security-events: write` limitado a su propio job. |
| `pawn-slug-matthias-sprite-smoke.yml` | Evidencia PNG de sprites runtime Pawn Slug. En PR separa Matthias/enemigos por ownership; tras staging omite deploys sin superficie sprite; manual conserva smoke completo. |

## Observabilidad y operación

| Workflow | Responsabilidad |
| --- | --- |
| `grafana-dashboards.yml` | Publica cuatro dashboards idempotentemente con la Grafana HTTP API. **Sin Terraform, provider, state, import, plan ni apply.** |
| `cloudflare-prometheus-exporter.yml` | Valida/despliega el exporter oficial Cloudflare cuando cambia su superficie. |
| `synthetic-health.yml` | Canary sintético de producción cada dos horas. Vive separado para funcionar aunque no haya releases. |
| `branch-housekeeping.yml` | Poda ramas mergeadas. Candidato a borrar cuando el repo active el ajuste nativo `Automatically delete head branches`; actualmente `delete_branch_on_merge=false`. |

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
 └─ direct HEAD ─> full exact-HEAD fallback gate
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
 ▼
Staging · AI Worker / accreditation
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
- `codeql.yml` → absorbido por `coverage.yml` como señal periódica; conserva cadence semanal y permisos `security-events` limitados al job CodeQL.
- `infra/grafana/terraform/` → eliminado; dashboards pasan a publisher API state-less.
- Instalaciones Node directas en CI/coverage/browser/staging preview/producción → acciones de cache exacta.
- Cache Trivy por `github.run_id` → namespace estable por versión + epoch diario.
- Matriz Browser E2E duplicada en PR (`e2e-full.yml`) → integrada en el required check de Quality; `e2e-full.yml` queda como sweep multi-browser.

El objetivo no es tener el mínimo número de YAML, sino **mínimo estado, mínima dependencia externa por ejecución y dominios de fallo claros**.


## Interruptor temporal de producción

`.github/production-deploy.env` contiene un único `DEPLOY_TARGET=render|oci`. Es deliberadamente distinto de `DEPLOY_ENV`: ambos targets ejecutan producción y usan la configuración/BD de producción. El workflow valida el archivo antes de cualquier mutación. El CNAME público del API ya no pertenece a Terraform; `scripts/oci_production_tunnel.py` lo conmuta sólo después de acreditar el SHA exacto en el target elegido. El rollback de producción siempre restaura primero la ruta del API a Render.