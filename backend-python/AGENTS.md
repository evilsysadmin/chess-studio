# Backend Python — scoped AGENTS

Este archivo complementa el `AGENTS.md` raíz para cambios bajo `backend-python/`. Mantén aquí sólo invariantes locales; los contratos largos viven en los Markdown especializados.

## Antes de tocar código

Lee según el área:

- persistencia/restore de partidas: `docs/operations/game-state-recovery.md`;
- Chronicles/Tactics: `docs/operations/chronicles-tactics.md`;
- OCI/runtime/secrets: `docs/operations/oci-backend-migration.md`, `docs/operations/oci-secret-lifecycle.md` y `skills/oci-release-observability/SKILL.md`.
- presencia/Admin: `docs/operations/presence-admin.md`.

## Invariantes

- Mongo/backend es autoridad para estado persistente server-owned. El navegador no puede ser la única fuente de verdad de datos que deben sobrevivir sesión/dispositivo.
- Creates, retries y reconciliaciones deben ser idempotentes cuando la red pueda repetir la petición. Evita duplicados, doble recompensa y last-write races silenciosas.
- Mantén ownership/autorización en servidor para partidas, perfiles, runs y endpoints admin.
- Diferencia errores de validación/regla de fallos internos. No conviertas excepciones inesperadas en `400` "movimiento inválido" u otros errores de usuario.
- No introduzcas reglas exclusivas de Combat Chess en las APIs de ajedrez estándar.
- Presence/admin conserva sólo telemetría gruesa aprobada; nada de FEN, historial de jugadas, clicks, teclado/ratón, mensajes, tokens o secretos.
- Si cambias una superficie API, actualiza consumidores y gates de superficie en la misma iteración.
- Si una dependencia/servicio necesario no está disponible, no declares validación backend completa.

## Tests mínimos cuando aplique

Cubre happy path, auth/ownership, retry/duplicado, round-trip persistente, legacy/migración y concurrencia. Para mundos generados, añade determinismo y rechazo de topología inválida.
