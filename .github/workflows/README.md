# GitHub Actions · inventario operativo

Última auditoría: 2026-09-03.

Regla simple: cada workflow debe tener un dueño, un trigger justificable y un coste proporcional. Nada de arqueología de releases, runners dedicados para señales duplicadas ni mutaciones concurrentes del mismo entorno.

## Cadena de entrega

| Workflow | Responsabilidad |
| --- | --- |
| `cicd.yml` | Gate principal de calidad para PR/main: preflight, frontend, backend, seguridad condicionada y smoke crítico. Es path-aware y **no despliega**. |
| `staging-preview.yml` | Operación manual y frontend-only sobre staging. En modo `preview` carga cualquier rama/tag/SHA no-main; en `restore-main` devuelve el frontend al `main` actual. Ambos compilan contra el backend canónico de staging, comparten mutex con el deploy oficial, no ejecutan Render/Workers AI, no acreditan staging y no pueden disparar producción. |
| `staging-deploy.yml` | Despliega el SHA aprobado en Render staging + Cloudflare Pages staging y acredita backend/frontend. Su ruta automática forma parte de la cadena de promoción. |
| `staging-ai-worker.yml` | Despliega/acredita Workers AI staging después de `Staging · deploy`; rechaza como acreditación un upstream manual. |
| `production-promote.yml` | Promueve a producción sólo el SHA acreditado por toda la cadena automática de staging. |
| `production-rollback.yml` | Rollback manual a un SHA previamente promocionado y conocido bueno. Comparte mutex con promoción. |
| `staging-bootstrap.yml` | Mantenimiento manual de Render staging. Comparte mutex con `staging-deploy.yml`; nunca puede pisar un deploy normal. |
| `render-production-guardrail.yml` | Verifica/corrige `auto-deploy=off` en Render production. Manual, semanal y por cambios de su propia superficie. |

## Calidad especializada

| Workflow | Responsabilidad |
| --- | --- |
| `e2e-full.yml` | Gate War Room por superficie en PR + sweep Chromium/Firefox/WebKit semanal/manual. Android selection, desktop input, escala, Focus y los cinco estados especiales corren en runners separados; cada runner mantiene `workers=1` para aislar WebGL. |
| `matthias-visual.yml` | Movimiento/pintura de Matthias sólo cuando cambia su superficie. |
| `coverage.yml` | Coverage frontend V8 + backend branch coverage semanal/manual. Informativo, no bloquea releases. |
| `oci-arm64-readiness.yml` | Readiness ARM64 de backend sólo ante cambios relevantes de imagen/dependencias. |
| `oci-terraform-readiness.yml` | `fmt/init/validate` del Terraform OCI cuando cambia esa infraestructura. |

## Observabilidad y operación

| Workflow | Responsabilidad |
| --- | --- |
| `cloudflare-prometheus-exporter.yml` | Despliegue condicionado del exporter oficial de Cloudflare con credenciales dedicadas. |
| `grafana-dashboards.yml` | Publicación versionada de dashboards Grafana mediante Terraform. |
| `synthetic-health.yml` | Sonda ligera de producción cada dos horas. |
| `branch-housekeeping.yml` | Semanal/manual. Elimina únicamente ramas de PR ya mergeadas y conserva `main` + `artifact/*`. No contiene listas de ramas históricas hardcodeadas. |

## Política de coste y seguridad

1. Un cambio visual no dispara QEMU, Terraform OCI ni seguridad Docker si no toca esas superficies.
2. Los browser gates de PR corren sólo donde pueden impedir una regresión; el sweep multibrowser queda semanal/manual.
3. War Room paraleliza **entre runners**, nunca varias escenas WebGL pesadas dentro de la misma VM.
4. `staging-preview.yml` sólo se ejecuta manualmente desde el workflow de `main`; el orquestador queda en `main` y el código objetivo se checkouta aparte. `preview` rechaza `main` y cualquier ref que resuelva al SHA actual de `main`; `restore-main` exige exactamente ese SHA.
5. `staging-preview.yml`, `staging-deploy.yml` y el mantenimiento de staging se serializan donde escriben sobre el entorno; producción promote/rollback comparten su propio mutex.
6. Las operaciones `preview` y `restore-main` tocan únicamente Cloudflare Pages staging. No modifican Render ni Workers AI y no acreditan producción.
7. La promoción exige procedencia automática `workflow_run`, SHA actual de `main` e identidad de build comprobada; `Production · promote` nunca escucha `Staging · preview`.
8. Workflows y documentación no deben conservar nombres de releases, ramas retiradas ni excepciones históricas una vez cumplida su función.
9. El fichero `cicd.yml` conserva su nombre por compatibilidad con contratos/scripts del repo; su responsabilidad real es calidad, no despliegue.
