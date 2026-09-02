# GitHub Actions · inventario operativo

Última auditoría: 2026-09-02.

Este directorio no es un cementerio de YAML. Cada workflow debe tener una función operativa reconocible. Si deja de tenerla, se retira en una PR separada en vez de conservarlo “por si acaso”.

## Cadena de entrega

| Workflow | Estado | Responsabilidad |
| --- | --- | --- |
| `cicd.yml` | Activo · gate principal | Calidad de PR/main: tests, contratos, seguridad y build. No despliega producción. |
| `staging-deploy.yml` | Activo | Despliega el SHA aprobado por CI en Render staging + Cloudflare Pages staging y acredita backend/frontend con smoke real. |
| `staging-ai-worker.yml` | Activo | Continúa la cadena sólo después de `Staging · deploy` verde y despliega/acredita Workers AI staging. |
| `production-promote.yml` | Activo | Promueve a producción únicamente el SHA acreditado por toda la cadena de staging. No conserva runtime de GitHub Pages. |
| `production-rollback.yml` | Activo · operación | Rollback explícito y controlado de producción. Mantener separado de promoción normal. |
| `staging-bootstrap.yml` | Activo · mantenimiento manual | Escape hatch idempotente para crear/reconciliar Render staging. No forma parte del camino normal de releases. |
| `render-production-guardrail.yml` | Activo · guardrail | Protege la configuración/contrato de Render producción frente a cambios peligrosos. |

### Legacy retirado

La rama `gh-pages` quedó obsoleta tras el cutover a Cloudflare Pages. PR #204 la retiró de la lista protegida y la añadió a la poda idempotente de `branch-housekeeping.yml`. No debe volver a usarse como fallback de producción.

El antiguo nombre `staging-pages.yml` también se retiró: el workflow sigue siendo el mismo `Staging · deploy`, pero el fichero ahora se llama `staging-deploy.yml` para describir lo que realmente hace y dejar de sugerir GitHub Pages.

## Observabilidad

| Workflow | Estado | Responsabilidad |
| --- | --- | --- |
| `cloudflare-prometheus-exporter.yml` | Activo · condicionado a credenciales | Despliega el exporter oficial de Cloudflare cuando existen secretos dedicados. Con secretos incompletos informa y no finge éxito operativo. |
| `grafana-dashboards.yml` | Activo | Publica dashboards versionados mediante Terraform cuando cambia `infra/grafana/**`. |
| `synthetic-health.yml` | Activo · sintético | Comprueba disponibilidad/health desde GitHub Actions sin convertirlo en un sustituto de SLOs. |

## Gates de calidad especializados

| Workflow | Estado | Responsabilidad |
| --- | --- | --- |
| `e2e-full.yml` | Activo | Gate Playwright específico de War Room en PRs relevantes + E2E completo informativo programado. |
| `matthias-visual.yml` | Activo | Protege regresiones visuales/funcionales de Matthias en cambios que afectan a su superficie. |
| `home-lab-visibility.yml` | Activo | Protege progressive disclosure de Laboratorio en Home con browser test enfocado. |
| `coverage.yml` | Activo · informativo | Coverage semanal/manual; no bloquea releases por porcentajes arbitrarios. |

Estos workflows parecen solaparse superficialmente con CI, pero hoy aportan scopes de browser/path específicos o ejecución programada que el gate principal no sustituye. No se eliminan sólo para reducir el número de ficheros.

## Preparación de infraestructura futura

| Workflow | Estado | Responsabilidad |
| --- | --- | --- |
| `oci-arm64-readiness.yml` | Activo · readiness | Comprueba que el backend/proyecto sigue siendo viable para el futuro target ARM64 de OCI. |
| `oci-terraform-readiness.yml` | Activo · readiness | Valida el Terraform de la futura migración OCI sin convertir esa migración en el runtime actual. |

Son preparación deliberada de una migración futura, no rutas de despliegue actuales.

## Mantenimiento del repositorio

| Workflow | Estado | Responsabilidad |
| --- | --- | --- |
| `branch-housekeeping.yml` | Activo | Elimina ramas mergeadas o explícitamente retiradas tras comprobar que no exista una PR abierta; protege `main` y artefactos deliberados. |

## Regla para añadir o retirar workflows

Antes de añadir uno nuevo, comprobar si el gate principal o un workflow especializado ya cubre la señal. Antes de borrar uno existente, demostrar qué workflow absorbe su contrato o que el runtime al que servía ya no existe. Los cambios de deploy, rollback, credenciales o entornos deben ir en PR separada de cambios de producto.

Resultado de la auditoría 2026-09-02: se retiraron los dos restos nominales/operativos de GitHub Pages (`gh-pages` y el nombre `staging-pages.yml`). No se encontró otro workflow cuya eliminación sea segura sin perder un gate, una operación manual útil, observabilidad o preparación explícita de infraestructura.
