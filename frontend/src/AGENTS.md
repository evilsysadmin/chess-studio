Contrato transversal de rendimiento: `docs/operations/runtime-performance.md`.

# Frontend — scoped AGENTS

Este archivo complementa el `AGENTS.md` raíz para cambios bajo `frontend/src/`.

## Enrutado obligatorio

- Home/Blender: `skills/home-blender/SKILL.md`, `docs/home-castle-life-minimal.md`, `docs/VISUAL_LANGUAGE.md`.
- War Room: `docs/operations/war-room-blender-pipeline.md`, `docs/operations/war-room-parity.md`, `docs/operations/war-room-visual-freeze.md`.
- Chronicles/Tactics: `docs/operations/chronicles-tactics.md`.
- Pawn Slug host/runtime: `skills/pawn-slug-runtime-smoke/SKILL.md`.
- Assets R2: `docs/visual-assets-r2-flow.md`.
- Presencia/Admin: `docs/operations/presence-admin.md`.
- Storage/perfil/migraciones: `docs/operations/client-storage.md`.

## Arquitectura

- No hagas crecer `App.jsx` o una pantalla gigante si el comportamiento ya tiene dominio/hook/módulo propio.
- No dupliques fuentes de verdad entre UI y dominio. Legalidad, FEN, clocks, run state, colisiones y posiciones vienen del dueño real del estado.
- Usa las capas de persistencia existentes; evita accesos ad-hoc a Web Storage cuando hay helpers resilientes.
- Conserva protección contra respuestas async stale/canceladas, reconnect y F5.
- Progressive disclosure manda: camino común simple; profundidad opcional detrás de acción explícita.


## Ownership de estado y máquinas de flujo

Antes de añadir persistencia, restore o una nueva copia de estado, consulta `scripts/state_ownership_contract.json`. Cada dominio durable declara **una sola authority**; recovery/fallback puede vivir en otra capa, pero no se convierte en una segunda autoridad.

Reglas:

- `activeGame` / `tournamentGame`: backend es autoridad; el active-session local sólo recupera contexto.
- series, clocks, campaña/roster Combat, battle session, onboarding, puzzles, historial/rating y feature flags conservan el owner declarado en el contrato; si se cambia, actualizar contrato + tests/gates en la misma PR.
- no añadir una segunda store “temporal” que luego empiece a ganar conflictos silenciosamente.
- UI/components emiten eventos al owner; no reimplementan la transición en paralelo.

Flujos con máquina explícita deben atravesarla:

- active session/restore/reconnect → `activeSessionTransition`;
- Combat battle → `combatFlowTransition`;
- campaña → `campaignPhaseTransition`;
- puzzles → `puzzleTransition`;
- BO3/BO5 → helpers/invariantes de series.

No saltar fases con `setState`/flags literales sólo porque el camino feliz funciona. Un refactor puede mover el dueño, pero debe mover también `scripts/state_resilience_check.mjs`, tests y gates que acreditan ese ownership.


## Invariantes de producto

- Matthias es la identidad CPU/narrativa fija. Sus referencias a partidas, errores o rivalidad sólo pueden usar hechos realmente guardados.
- Home es diegética, no un dashboard. Hotspots reaccionan a hover/focus/touch; modos secundarios pueden vivir tras la transición Dungeon. Reduced-motion conserva señal visual sin movimiento decorativo.
- War Room v1 sigue siendo rollback mientras v2 no esté plenamente validada. No mezcles o borres su implementación al trabajar v2.
- El onboarding inicial de War Room lo guía Matthias y usa los destinos legales reales del estado compartido; no implementes una segunda legalidad tutorial.
- Chronicles usa posiciones runtime actuales como autoridad para colisión/targeting/IA/escena y checkpoints durables versionados; no resucites blockers de spawn ni blobs opacos de estado React.
- Combat Chess mantiene sus reglas especiales aisladas de ajedrez estándar; identidad veterana, rango/medallas y metamorfosis siguen perteneciendo a Combat.

## Visual acceptance

Tests verdes no acreditan una visual. Para Home, War Room y otras superficies visuales, revisa artifacts PNG reales en los viewports afectados, mobile incluido cuando corresponda, y compara contra el último baseline aceptado.
