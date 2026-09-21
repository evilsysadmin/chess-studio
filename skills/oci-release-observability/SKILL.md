# OCI release + observability — skill operativo

Este skill resume el camino de diagnóstico que se repite en staging OCI. La topología autoritativa vive en `.github/workflows/README.md`; este documento explica cómo razonar sobre fallos sin añadir probes redundantes ni filtrar secretos.

## Principio exact-SHA

Toda generación se identifica por un SHA concreto.

Antes de una operación OCI cara o un live-check asociado a un deploy:

1. comprobar si ese SHA sigue siendo la generación que debe servirse;
2. si ya fue superado por un `main` más nuevo, marcarlo **superseded**;
3. no gastar Run Command, verify o Grafana live-check en una generación muerta.

`superseded` es un resultado esperado del flujo concurrente, no un error que merezca backoff agresivo.

Cuando la acreditación inmutable de PR no puede reutilizarse con seguridad, Main admission debe ejecutar el gate completo sobre el **HEAD final exacto**; nunca relajar la prueba de parentesco/disjointness para ahorrar tiempo.

## Un solo dueño del anti-stale

No dupliques `git ls-remote`/GitHub probes dentro de la A1 y en el orquestador.

La comprobación anti-stale debe vivir en la capa que posee la mutación/lock del host. Lecturas duplicadas añaden latencia y nuevos puntos de fallo sin aumentar seguridad.

Los diagnósticos read-only no deben tomar el mismo mutex que una mutación OCI salvo que realmente necesiten serializar estado.

## Diagnóstico de logs: prueba por capas

`force_flush()` sólo demuestra que el SDK intentó vaciar buffers; no prueba ingestión remota.

Separar tres niveles:

1. **OTLP directo** desde OCI → prueba endpoint/credencial/scope;
2. **probe filelog/Alloy** → prueba captura y pipeline del agente;
3. **stdout real del backend** → prueba lectura del stream/container y etiquetado final.

Lectura típica:

- direct probe 401/403 → credencial o scope (p. ej. `logs:write`);
- direct probe OK + filelog ausente → Alloy/captura;
- direct + filelog OK + stdout ausente → enlace/lectura del stdout real;
- todo OK pero dashboard vacío → query/datasource/labels.

Mantener probe pequeño separado del stream real evita carreras de `start_at=end`; no cambiar el backend stdout a replay indiscriminado para arreglar un probe.

## Seguridad de diagnóstico

Los logs de deploy pueden exponer únicamente marcadores seguros de estado. Nunca imprimir:

- tokens;
- Authorization headers;
- endpoints secretos;
- contenido de secret bundles;
- private keys.

Es válido exponer estados como config-invalid, start-failed, not-running u ok si no revelan secretos.

Observabilidad es fail-open respecto al producto cuando así esté diseñado, pero sus checks deben ser honestos: no convertir ausencia de prueba en verde.

## Grafana live y generaciones superseded

Un workflow disparado por `workflow_run` debe comprobar primero que el SHA esperado sigue siendo la release servida. Si no, omitir warm/query y registrar superseded.

Cron/manual checks sí pueden consultar el estado vivo actual porque no están acreditando un deploy histórico concreto.

## Checklist de fallo de staging

- ¿El SHA sigue siendo actual?
- ¿Main admission acreditó ese exact HEAD?
- ¿El host mutation lock pertenece a esta generación?
- ¿El runtime remoto registró el SHA esperado?
- ¿El backend responde ready/health?
- ¿El live-check consulta la generación realmente servida?
- Si faltan logs: ¿falla OTLP directo, filelog o stdout?
- ¿Se está imprimiendo sólo diagnóstico seguro?

Evitar volver a GitHub en bucle desde la A1; el orquestador ya conoce la generación que está intentando entregar.
