# AGENTS.md — Chess Studio

Este archivo es el **contexto básico y el índice operativo** del repositorio. No debe volver a crecer hasta convertirse en un manual monolítico.

Las reglas detalladas viven en los `.md` especializados enlazados aquí. Antes de tocar un área, lee su contrato correspondiente. Si se crea un nuevo documento persistente que condiciona cómo trabajar en el repo, añádelo también a este índice.

## Contexto básico

- `Chronicles` = **Chronicles of Matthias**.
- `Tactics` = **Chronicles of Matthias Tactics**.
- Pawn Slug en Godot es **2D puro**. Sus sprites no usan Blender.
- Home 3D y War Room v2 usan la pipeline Blender.
- La War Room actual sigue siendo baseline de rollback hasta que War Room v2 esté validada visualmente, en móvil, rendimiento y runtime.
- Para assets grandes de runtime, preferir R2/CDN y mantener Git centrado en código, manifests y contratos.
- Trabajar incrementalmente, con cambios pequeños, reversibles y verificables. No dar por buena una iteración visual sólo porque el build o CI estén verdes.
- Cuando haya artefactos PNG de una pipeline visual, revisarlos y compararlos con el último baseline validado antes de integrar.

## Flujo global de PR

El contrato de entrega está en [`docs/auto-merge-delivery.md`](docs/auto-merge-delivery.md). Resumen obligatorio:

- Toda PR nueva empieza en **Draft**.
- No pasar a **Ready for review** mientras haya required checks pendientes, cancelados o rojos.
- Corregir CI en la misma PR; no abrir otra para esquivar fallos.
- Mientras CI corre, avanzar trabajo útil en otra PR relacionada en vez de esperar.
- Máximo **5 PRs por chat** en rotación simultánea.
- Cuando todos los required checks estén verdes, pasar la PR a Ready for review y habilitar/verificar native automerge.
- Tras merge, comprobar los workflows posteriores relevantes (main admission, staging/deploy, smoke checks) antes de cerrar la iteración.
- Mantener las llamadas a GitHub pequeñas y dirigidas: metadata, checks, SHA, commit/PR. Evitar diffs enormes, lecturas repetidas y blobs pesados cuando el trabajo pueda hacerse sobre artefactos locales/cacheados.
- Si el conector GitHub/git no aparece inicialmente, **redescubrirlo antes de declarar el repositorio inaccesible**. No sustituir de entrada el flujo normal por fetches web, clones repetidos o llamadas grandes.

## Enrutado por tarea

| Tarea | Documentos que hay que leer |
| --- | --- |
| Sprites, frames, atlases o animaciones de Pawn Slug/Godot | [`docs/pawnslug-sprites.md`](docs/pawnslug-sprites.md), [`skills/godot-spritesheets/SKILL.md`](skills/godot-spritesheets/SKILL.md), [`scripts/art/README.md`](scripts/art/README.md), [`frontend/src/assets/pawnSlug/README.md`](frontend/src/assets/pawnSlug/README.md) |
| Pawn Slug runtime, Web export, Playwright smoke o input real | [`skills/pawn-slug-runtime-smoke/SKILL.md`](skills/pawn-slug-runtime-smoke/SKILL.md) |\n| Pawn Slug OST / synthwave / composición y mezcla | [`docs/music.md`](docs/music.md), [`skills/pawn-slug-synthwave/SKILL.md`](skills/pawn-slug-synthwave/SKILL.md) |
| Publicación/migración de assets a R2 | [`docs/r2-asset-publisher.md`](docs/r2-asset-publisher.md), [`docs/r2-assets.md`](docs/r2-assets.md), [`docs/visual-assets-r2-flow.md`](docs/visual-assets-r2-flow.md) |
| War Room visual / Blender / v2 | [`docs/operations/war-room-blender-pipeline.md`](docs/operations/war-room-blender-pipeline.md), [`docs/operations/war-room-parity.md`](docs/operations/war-room-parity.md), [`docs/operations/war-room-visual-freeze.md`](docs/operations/war-room-visual-freeze.md), [`skills/local-gpu-rendering/SKILL.md`](skills/local-gpu-rendering/SKILL.md) |
| Home / Castillo / Blender | [`skills/home-blender/SKILL.md`](skills/home-blender/SKILL.md), [`docs/VISUAL_LANGUAGE.md`](docs/VISUAL_LANGUAGE.md), [`docs/home-castle-life-minimal.md`](docs/home-castle-life-minimal.md), [`docs/visual-assets-r2-flow.md`](docs/visual-assets-r2-flow.md), [`skills/local-gpu-rendering/SKILL.md`](skills/local-gpu-rendering/SKILL.md) |
| Chronicles / Tactics | [`docs/operations/chronicles-tactics.md`](docs/operations/chronicles-tactics.md) |
| Recuperación/persistencia de partida | [`docs/operations/game-state-recovery.md`](docs/operations/game-state-recovery.md) |
| OCI / staging / secretos / runtime | [`skills/oci-release-observability/SKILL.md`](skills/oci-release-observability/SKILL.md), [`docs/operations/oci-backend-migration.md`](docs/operations/oci-backend-migration.md), [`docs/operations/oci-secret-lifecycle.md`](docs/operations/oci-secret-lifecycle.md), READMEs bajo `infra/oci/` |
| Grafana / observabilidad | [`skills/oci-release-observability/SKILL.md`](skills/oci-release-observability/SKILL.md), [`infra/grafana/README.md`](infra/grafana/README.md), [`ops/grafana/README.md`](ops/grafana/README.md) |
| CI, workflows, entrega y automerge | [`.github/workflows/README.md`](.github/workflows/README.md), [`docs/auto-merge-delivery.md`](docs/auto-merge-delivery.md) |
| Contexto de producto y arranque local | [`README.md`](README.md) |
| Historia antigua de releases | [`docs/archive/README-release-diary.md`](docs/archive/README-release-diary.md) |

## Índice completo de Markdown

### Raíz y CI

- [`README.md`](README.md) — entrada al proyecto, estructura y comandos canónicos.
- [`.github/workflows/README.md`](.github/workflows/README.md) — documentación de workflows.
- [`docs/auto-merge-delivery.md`](docs/auto-merge-delivery.md) — native automerge y cadena de entrega.

### Skills / contratos operativos

- [`skills/godot-spritesheets/SKILL.md`](skills/godot-spritesheets/SKILL.md) — generación, normalización, validación y entrega de spritesheets 2D compatibles con Godot.
- [`skills/pawn-slug-runtime-smoke/SKILL.md`](skills/pawn-slug-runtime-smoke/SKILL.md) — contrato del export Web, bridge, input real y smoke determinista de Pawn Slug.\n- [`skills/pawn-slug-synthwave/SKILL.md`](skills/pawn-slug-synthwave/SKILL.md) — composición, groove, mezcla, normalización y entrega de OST synthwave/rock de Pawn Slug.
- [`skills/home-blender/SKILL.md`](skills/home-blender/SKILL.md) — iteración Home Blender → GLB → R2 → captura runtime.
- [`skills/local-gpu-rendering/SKILL.md`](skills/local-gpu-rendering/SKILL.md) — en local, Blender y Chromium con GPU de extremo a extremo (CI renderiza por software); comandos verificados y trampas de servidores e2e viejos.
- [`skills/oci-release-observability/SKILL.md`](skills/oci-release-observability/SKILL.md) — exact-SHA staging, generaciones superseded y diagnóstico seguro de observabilidad.

### Diseño, producto y experimentos

- [`docs/music.md`](docs/music.md) — criterio duradero de composición, instrumentos, interpretación, percusión, riffs, humanización y anti-regresiones musicales.
- [`docs/VISUAL_LANGUAGE.md`](docs/VISUAL_LANGUAGE.md) — lenguaje visual.
- [`docs/home-castle-life-minimal.md`](docs/home-castle-life-minimal.md) — contrato mínimo de Home/Castillo.
- [`docs/experiments/castle-hall-fame-shame.md`](docs/experiments/castle-hall-fame-shame.md)
- [`docs/experiments/castle-progression-space.md`](docs/experiments/castle-progression-space.md)
- [`docs/experiments/cinematic-game-autopsy.md`](docs/experiments/cinematic-game-autopsy.md)
- [`docs/experiments/combat-tactical-deployment.md`](docs/experiments/combat-tactical-deployment.md)
- [`docs/experiments/matthias-episodic-memory.md`](docs/experiments/matthias-episodic-memory.md)

### Operaciones y runtime

- [`docs/operations/game-state-recovery.md`](docs/operations/game-state-recovery.md)
- [`docs/operations/chronicles-tactics.md`](docs/operations/chronicles-tactics.md)
- [`docs/operations/oci-backend-migration.md`](docs/operations/oci-backend-migration.md)
- [`docs/operations/oci-secret-lifecycle.md`](docs/operations/oci-secret-lifecycle.md)
- [`docs/operations/war-room-blender-pipeline.md`](docs/operations/war-room-blender-pipeline.md)
- [`docs/operations/war-room-parity.md`](docs/operations/war-room-parity.md)
- [`docs/operations/war-room-visual-freeze.md`](docs/operations/war-room-visual-freeze.md)

### R2 / assets

- [`docs/r2-asset-publisher.md`](docs/r2-asset-publisher.md)
- [`docs/r2-assets.md`](docs/r2-assets.md)
- [`docs/visual-assets-r2-flow.md`](docs/visual-assets-r2-flow.md)
- [`frontend/src/assets/pawnSlug/README.md`](frontend/src/assets/pawnSlug/README.md)
- [`scripts/art/README.md`](scripts/art/README.md)

### Pawn Slug — contratos de escenario

- [`frontend/src/pawnSlugDestructiblePremiumArt.contract.md`](frontend/src/pawnSlugDestructiblePremiumArt.contract.md)
- [`frontend/src/pawnSlugScenarioBiomeNotes.md`](frontend/src/pawnSlugScenarioBiomeNotes.md)
- [`frontend/src/pawnSlugScenarioContract.md`](frontend/src/pawnSlugScenarioContract.md)

### Infraestructura

- [`infra/grafana/README.md`](infra/grafana/README.md)
- [`infra/oci/README.md`](infra/oci/README.md)
- [`infra/oci/gitops/flux/README.md`](infra/oci/gitops/flux/README.md)
- [`infra/oci/k3s/README.md`](infra/oci/k3s/README.md)
- [`infra/oci/runtime/README.md`](infra/oci/runtime/README.md)
- [`ops/grafana/README.md`](ops/grafana/README.md)

### Archivo y avisos

- [`docs/archive/README-release-diary.md`](docs/archive/README-release-diary.md) — archivo histórico; no usar como puerta de entrada.
- [`frontend/public/audio/orchestra/NOTICE.md`](frontend/public/audio/orchestra/NOTICE.md) — avisos/licencias del asset de audio.

## Regla de mantenimiento de este índice

`AGENTS.md` debe seguir siendo corto y navegable. Cuando una regla empiece a necesitar ejemplos, pasos detallados, contratos de formato, comandos, matrices de validación o criterios extensos de aceptación, muévela al `.md` especializado correspondiente y deja aquí sólo una frase + enlace.

Si se añade, renombra o elimina un `.md` persistente del repositorio, actualizar este índice en la misma PR.
