# GitHub Actions · mapa operativo

Última auditoría: 2026-09-17.

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
- El release canónico de staging no aplica Terraform, no sincroniza secretos/configuración y no arranca K3s: esas operaciones pertenecen al control-plane explícito.
- `oci-staging-mutations` se reserva para operaciones que realmente mutan OCI/host. Diagnósticos y probes read-only no deben bloquear un deploy por compartir un mutex innecesario.

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
| `production-promote.yml` | Promueve sólo un SHA acreditado. Worker/DNS Terraform `plan/apply` permanece aquí porque sí gestiona infraestructura real y está protegido por admisión anti-stale antes de la primera mutación. Render producción y Pages continúan después sobre el mismo SHA. |
| `production-rollback.yml` | Rollback manual a un SHA conocido. Blast radius distinto: no fusionar con promote. |
| `staging-preview.yml` | Preview/restauración manual frontend-only sobre staging; no acredita ni entra en producción. Usa deps exactas + Wrangler cacheado. |
| `staging-bootstrap.yml` | Escape hatch manual del staging legado en Render durante su periodo de retirada. No participa en el camino canónico OCI → staging. |
| `render-production-guardrail.yml` | Guardrail específico de auto-deploy/configuración Render producción. |

## OCI staging · infraestructura y control-plane

| Workflow | Responsabilidad |
| --- | --- |
| `oci-readiness.yml` | Validación OCI path-aware para PR: contratos, runtime bundle y ARM64 sólo cuando cambia la imagen backend/su smoke o la propia lane ARM64. `workflow_dispatch` añade validaciones Terraform estáticas. **No muta staging ni publica K3s al mergear.** |
| `oci-staging-deploy.yml` | `terraform apply` manual y exacto sobre `main`, seguido por convergencia del agente OCI y egress reservado. Es el único apply de infraestructura production-grade de OCI staging. |
| `oci-staging-service.yml` | Front-door manual para diagnóstico y operaciones del host/runtime. `deploy`, `runtime-sync`, `vault-bootstrap`, K3s lifecycle, egress y recuperación toman el mutex de mutación; diagnósticos, validaciones y `k3s-status` son observación y no bloquean releases. |
| `oci-staging-lab.yml` | Laboratorio manual Terraform limitado a `probe`, `plan`, `bootstrap` y `destroy`; no ofrece un segundo `apply` desnudo. |
| `oci-staging-tunnel.yml` | Reconciliación manual del túnel/DNS de staging, serializada sólo porque sí muta control-plane. |

K3s sigue siendo experimental y reversible. El merge de código no lo inicia ni publica assets automáticamente. La operación explícita `k3s-start` reconcilia idempotentemente el bundle privado, instala los assets exactos en la A1, ejecuta el guarded start, lee estado y acredita que el runtime Docker de fallback sigue vivo.

La retirada de Render staging es deliberadamente gradual: el **release normal ya no depende de Render**, pero `runtime-sync`, `vault-bootstrap` y diagnósticos de migración todavía pueden usarlo como puente hasta que OCI Vault + configuración declarativa + rollback transaccional queden acreditados. Render producción no forma parte de esa migración.

## Calidad especializada

| Workflow | Responsabilidad |
| --- | --- |
| `e2e-full.yml` | Sweep completo Chromium/Firefox/WebKit mensual/manual e informativo. Ya no duplica PR: la matriz requerida y path-aware War Room/Matthias vive en `cicd.yml`. |
| `coverage.yml` | Señales periódicas no bloqueantes: coverage frontend/backend mensual y CodeQL semanal; `workflow_dispatch` ejecuta ambos bajo demanda. CodeQL mantiene `security-events: write` limitado a su propio job. |

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
Staging · deploy
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
 ├─ Render production backend
 └─ Cloudflare Pages
```

Fuera de la línea de release:

```text
OCI infra apply ────── manual
OCI runtime/Vault ─── manual y desacoplado del SHA de aplicación
OCI tunnel ────────── manual
K3s lifecycle ─────── manual/experimental
Diagnostics ───────── manual/read-only, sin bloquear deploys
```

`workflow_dispatch` en `cicd.yml` queda como escape hatch manual, no como parte del camino normal de entrega. El fallback directo tampoco es el camino normal: existe para que un commit administrativo excepcional no deje staging esperando a que otra PR "arrastre" el HEAD.

## Fósiles retirados / límites fijados

- `auto-merge.yml` → retirado; sustituido por GitHub native auto-merge.
- `main-delivery-handoff.yml` → retirado; el merge nativo produce el `push` normal a `main` y no necesita redispatch.
- `matthias-visual.yml` → absorbido primero por `e2e-full.yml`; sus gates PR path-aware viven ahora en `cicd.yml`.
- `oci-arm64-readiness.yml` + `oci-terraform-readiness.yml` → `oci-readiness.yml`.
- Publicación K3s automática desde `oci-readiness.yml` → retirada; assets se reconcilian en el `k3s-start` explícito.
- Auto-K3s tras cada `Staging · deploy` → retirado; lifecycle experimental no forma parte del release canónico.
- Mutex único para cualquier `oci-staging-service` → retirado; sólo las operaciones mutantes compiten con deploy/Terraform.
- `war-room-runtime-marathon.yml` → retirado; sus specs siguen cubiertas por el gate War Room path-aware y el sweep completo de `e2e-full.yml`.
- `codeql.yml` → absorbido por `coverage.yml` como señal periódica; conserva cadence semanal y permisos `security-events` limitados al job CodeQL.
- `infra/grafana/terraform/` → eliminado; dashboards pasan a publisher API state-less.
- Instalaciones Node directas en CI/coverage/browser/staging preview/producción → acciones de cache exacta.
- Cache Trivy por `github.run_id` → namespace estable por versión + epoch diario.
- Matriz Browser E2E duplicada en PR (`e2e-full.yml`) → integrada en el required check de Quality; `e2e-full.yml` queda como sweep multi-browser.

El objetivo no es tener el mínimo número de YAML, sino **mínimo estado, mínima dependencia externa por ejecución y dominios de fallo claros**.
