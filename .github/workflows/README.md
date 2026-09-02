# GitHub Actions · inventario operativo

Última auditoría: 2026-09-02.

Este directorio no es un cementerio de YAML. Cada workflow debe tener una función operativa reconocible y un coste proporcionado. Un gate puede ser útil y aun así estar sobredimensionado: los browser tests, builds multi-arquitectura y reconciliaciones de infraestructura deben dispararse sólo cuando protegen una superficie que realmente cambió.

## Cadena de entrega

| Workflow | Estado | Responsabilidad |
| --- | --- | --- |
| `cicd.yml` | Activo · gate principal | Calidad de PR/main: tests, contratos, seguridad y build. No despliega producción. |
| `staging-deploy.yml` | Activo | Despliega el SHA aprobado por CI en Render staging + Cloudflare Pages staging y acredita backend/frontend con smoke real. |
| `staging-ai-worker.yml` | Activo | Continúa la cadena sólo después de `Staging · deploy` verde y despliega/acredita Workers AI staging. |
| `production-promote.yml` | Activo | Promueve a producción únicamente el SHA acreditado por toda la cadena de staging. |
| `production-rollback.yml` | Activo · operación | Rollback explícito y controlado de producción. Mantener separado de promoción normal. |
| `staging-bootstrap.yml` | Activo · mantenimiento manual | Escape hatch idempotente para crear/reconciliar Render staging. No forma parte del camino normal de releases. |
| `render-production-guardrail.yml` | Activo · guardrail ligero | Protege `auto-deploy=off`; corre manualmente, semanalmente y cuando cambia su propia superficie Render, no en cada merge de producto. |

### Legacy retirado

La rama `gh-pages` quedó obsoleta tras el cutover a Cloudflare Pages. PR #204 la retiró de la lista protegida y la añadió a la poda idempotente de `branch-housekeeping.yml`. No debe volver a usarse como fallback de producción.

El antiguo nombre `staging-pages.yml` también se retiró: el workflow sigue siendo el mismo `Staging · deploy`, pero el fichero ahora se llama `staging-deploy.yml` para describir lo que realmente hace y dejar de sugerir GitHub Pages.

## Observabilidad

| Workflow | Estado | Responsabilidad |
| --- | --- | --- |
| `cloudflare-prometheus-exporter.yml` | Activo · condicionado a credenciales | Despliega el exporter oficial de Cloudflare cuando existen secretos dedicados. |
| `grafana-dashboards.yml` | Activo | Publica dashboards versionados mediante Terraform cuando cambia `infra/grafana/**`. |
| `synthetic-health.yml` | Activo · sintético ligero | Comprueba disponibilidad/health cada dos horas; no instala dependencias de aplicación ni sustituye SLOs. |

## Gates de calidad especializados

| Workflow | Estado | Responsabilidad |
| --- | --- | --- |
| `e2e-full.yml` | Activo · scope por diff | En PRs de decoración 3D prueba montaje/escala; sólo cambios de Board3D core, reglas o input pagan Android + estados especiales + input; Focus corre cuando cambia su superficie. Los estados especiales se mantienen secuenciales por estabilidad WebGL. El sweep Chromium+Firefox+WebKit completo es semanal/manual. |
| `matthias-visual.yml` | Activo · PR/manual | Protege pintura/movimiento de Matthias sólo cuando cambia su superficie; no repite el gate después del merge a `main`. |
| `coverage.yml` | Activo · informativo | Coverage semanal/manual; no bloquea releases por porcentajes arbitrarios. |

`home-lab-visibility.yml` se retiró en la auditoría de septiembre: instalaba frontend + Playwright + Chromium y compilaba toda la app para una señal ya cubierta por la suite de navegador general. El spec `e2e/home-lab-visibility.spec.js` se conserva como cobertura; sólo desaparece su runner dedicado.

## Preparación de infraestructura futura

| Workflow | Estado | Responsabilidad |
| --- | --- | --- |
| `oci-arm64-readiness.yml` | Activo · readiness enfocado | QEMU/Buildx sólo cuando cambian Dockerfile, requirements, el smoke ARM64 o el propio workflow; cambios Python ordinarios no vuelven a construir ARM64. |
| `oci-terraform-readiness.yml` | Activo · PR/manual | Valida el Terraform OCI cuando se modifica; no repite el mismo `fmt/init/validate` tras merge. |

Son preparación deliberada de una migración futura, no rutas de despliegue actuales.

## Mantenimiento del repositorio

| Workflow | Estado | Responsabilidad |
| --- | --- | --- |
| `branch-housekeeping.yml` | Activo | Semanal/manual; elimina ramas mergeadas o explícitamente retiradas tras comprobar que no exista una PR abierta. |

## Política de coste

1. Un cambio puramente visual no debe provocar QEMU, Terraform OCI, guardrails de Render ni paridad de reglas ajenos.
2. Un browser gate especializado se ejecuta en la PR donde puede impedir una regresión; no se repite automáticamente después del merge si el SHA no ha cambiado funcionalmente.
3. Sweeps multi-browser y coverage informativos son semanales/manuales.
4. Paralelizar browser tests sólo cuando la medición demuestra estabilidad y ahorro. War Room WebGL es una excepción explícita: `workers=5` y `workers=2` saturaron hosted runners, introdujeron timeouts y empeoraron el tiempo total; sus estados especiales quedan secuenciales.
5. Deploy/rollback y cambios de credenciales se mantienen separados de los cambios de producto.
6. La siguiente optimización de mayor impacto es hacer el CI principal path-aware para que frontend/backend/browser no corran cuando su superficie no cambió.
7. La cadena staging→producción sólo se hará path-aware con acreditación explícita por componente, sin sacrificar identidad de release ni rollback.

## Resultado de la auditoría 2026-09-02

- workflows YAML: 17 → 16;
- retirado `home-lab-visibility.yml`;
- full multi-browser: diario → semanal;
- Matthias visual: PR + manual, sin repetición en `main`;
- OCI ARM64: deja de correr ante cualquier `.py` del backend;
- OCI Terraform: elimina la repetición post-merge;
- Render production guardrail: deja de correr por cada cambio de producto y conserva comprobación semanal + por superficie;
- War Room: decoración 3D deja de pagar paridad de reglas/input; el gate completo queda reservado a cambios que pueden afectar esa lógica;
- paridad especial de War Room: se conserva secuencial tras medir que 5 y 2 workers concurrentes degradan estabilidad y tiempo.

La cadena staging→producción se conserva intacta en esta PR. Su optimización path-aware requiere una PR específica porque afecta acreditación de componentes, promoción y rollback.
