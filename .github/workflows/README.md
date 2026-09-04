# GitHub Actions · mapa operativo

Última auditoría: 2026-09-04.

Regla: cada workflow debe representar un dominio operativo o blast radius real. Se fusiona duplicación histórica; no se fusionan promoción, rollback o acreditación sólo para bajar el contador.

## Contrato SRE

- Rutas críticas fijan `ubuntu-24.04`; nada de `ubuntu-latest` flotante donde una imagen distinta pueda alterar una release.
- Node usa cache de descarga de `setup-node` + `node_modules` exacto mediante `.github/actions/cache-node-modules`.
- Python usa cache de descarga de `setup-python` + `.venv` exacto mediante `.github/actions/cache-python-venv`.
- Browser E2E usa `.github/actions/setup-browser-e2e`: dependencias exactas y caches Playwright separadas `chromium`/`all` para que un cache Chromium-only no convierta Firefox/WebKit en descargas perpetuas.
- Wrangler está pinneado/cacheado mediante `.github/actions/setup-wrangler` en staging, preview y producción.
- Trivy cachea binario + DB por versión/día. Si el refresh remoto falla y existe una DB previa, escanea en modo degradado explícito con la copia stale; si no existe DB, falla cerrado.
- Security images usa BuildKit + cache GHA para reutilizar capas Docker y no depender del registry si lockfiles/capas siguen válidos.
- `npm audit` y `pip-audit` son señales auxiliares. Trivy conserva la política bloqueante por severidad.
- `scripts/test_suite_audit.mjs --ci-wiring` impide resucitar workflows retirados, `npm ci` directo, cache keys por `github.run_id` y runners flotantes en rutas críticas.

## Acciones reutilizables

| Acción | Responsabilidad |
| --- | --- |
| `../actions/cache-node-modules/action.yml` | Árbol `node_modules` exacto por runner/Node/lockfile; `npm ci --prefer-offline` sólo en miss. |
| `../actions/cache-python-venv/action.yml` | `.venv` exacto por runner/Python/requirements; valida runtime, stamp e imports. |
| `../actions/setup-browser-e2e/action.yml` | Node + frontend/E2E deps + Playwright scope + verificación de ejecutables. |
| `../actions/setup-wrangler/action.yml` | Wrangler exacto por versión; npm sólo en cache miss. |

## Cadena de entrega

| Workflow | Responsabilidad |
| --- | --- |
| `cicd.yml` | Gate principal quality-only para PR/main. Preflight y luego frontend/backend/security/E2E en paralelo según superficie. No despliega. |
| `staging-deploy.yml` | Despliega el SHA aprobado en Render staging + Pages staging y acredita backend/frontend. |
| `staging-ai-worker.yml` | Completa/revalida staging y emite la acreditación inmutable que permite promoción. El nombre se conserva por el contrato `workflow_run` existente. |
| `production-promote.yml` | Promueve sólo el SHA acreditado. Worker/DNS Terraform `plan/apply` permanece aquí porque sí gestiona infraestructura real y está protegido por admisión anti-stale antes de la primera mutación. Render y Pages continúan después sobre el mismo SHA. |
| `production-rollback.yml` | Rollback manual a un SHA conocido. Blast radius distinto: no fusionar con promote. |
| `staging-preview.yml` | Preview/restauración manual frontend-only sobre staging; no acredita ni entra en producción. Usa deps exactas + Wrangler cacheado. |
| `staging-bootstrap.yml` | Escape hatch manual de Render staging. No sustituye el camino normal CI → staging. |
| `render-production-guardrail.yml` | Guardrail específico de auto-deploy/configuración Render producción. |

## Calidad especializada

| Workflow | Responsabilidad |
| --- | --- |
| `e2e-full.yml` | Browser E2E path-aware. Matriz dinámica War Room/Matthias en PR con runner separado por escena WebGL pesada; sweep Chromium/Firefox/WebKit semanal/manual. Absorbe el antiguo `matthias-visual.yml`. |
| `coverage.yml` | Coverage frontend/backend semanal/manual e informativo, con caches exactas Node/Python. |
| `oci-readiness.yml` | Readiness OCI unificado y path-aware: ARM64 backend y/o Terraform OCI `fmt/init/validate`. Sustituye `oci-arm64-readiness.yml` + `oci-terraform-readiness.yml`. No hace apply. |

## Observabilidad y operación

| Workflow | Responsabilidad |
| --- | --- |
| `auto-merge.yml` | Espera los checks protegidos de la PR, hace squash sólo del head observado y continúa explícitamente la entrega con `workflow_dispatch` de `cicd.yml`. Esto es obligatorio porque un merge realizado con `GITHUB_TOKEN` no genera nuevos workflow runs por el `push`; `workflow_dispatch` sí está permitido por GitHub. |
| `grafana-dashboards.yml` | Publica cuatro dashboards idempotentemente con la Grafana HTTP API. **Sin Terraform, provider, state, import, plan ni apply.** |
| `cloudflare-prometheus-exporter.yml` | Valida/despliega el exporter oficial Cloudflare cuando cambia su superficie. |
| `synthetic-health.yml` | Canary sintético de producción cada dos horas. Vive separado para funcionar aunque no haya releases. |
| `branch-housekeeping.yml` | Poda ramas mergeadas. Candidato a borrar cuando el repo active el ajuste nativo `Automatically delete head branches`; actualmente `delete_branch_on_merge=false`. |

## Flujo

```text
PR / push
   │
   ▼
Quality · CI gate
   │
   ▼
Staging · deploy
   │
   ▼
Staging · AI Worker / accreditation
   │
   ▼
Production · promote
   ├─ Cloudflare Worker + DNS (Terraform plan/apply controlado)
   ├─ Render backend
   └─ Cloudflare Pages
```

## Fósiles retirados en esta auditoría

- `matthias-visual.yml` → absorbido por `e2e-full.yml`.
- `oci-arm64-readiness.yml` + `oci-terraform-readiness.yml` → `oci-readiness.yml`.
- `infra/grafana/terraform/` → eliminado; dashboards pasan a publisher API state-less.
- Instalaciones Node directas en CI/coverage/browser/staging preview/producción → acciones de cache exacta.
- Cache Trivy por `github.run_id` → namespace estable por versión + epoch diario.

El objetivo no es tener el mínimo número de YAML, sino **mínimo estado, mínima dependencia externa por ejecución y dominios de fallo claros**.
