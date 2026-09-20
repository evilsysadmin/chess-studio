# Chess Studio Blender pipelines — operating contract

This file augments the repository root `AGENTS.md` for `scripts/blender/`.

Blender is used for Home 3D, War Room v2 and explicitly approved 3D assets such as Chronicles/Tactics environments/party assets. It is not the Pawn Slug sprite pipeline.

## 1. Reproducibility

Blender outputs must be rebuildable from repository-controlled scripts/sources.

- Prefer scripted builders/material/camera changes over undocumented manual GUI edits.
- If a `.blend` is canonical source, keep the script/inputs that can reproduce or validate its runtime export.
- Keep object/material names stable when runtime/tests depend on them.
- Do not rely on local absolute paths, workstation-only fonts/plugins or hidden user preferences.
- Seed any procedural generation explicitly.
- Keep runtime exports deterministic enough for meaningful hash/artifact comparison where practical.

## 2. Required visual loop

Every visual change must generate and inspect a PNG review artifact.

Loop:
`edit builder/source -> render -> inspect PNG -> compare baseline -> correct -> export/runtime artifact -> browser review when applicable`

Do not accept a Blender change only because the script completed.

Inspect:
- composition/framing;
- silhouette/readability;
- material response;
- lighting/exposure;
- obvious intersections/floating props;
- clipping/camera crop;
- mobile framing if the asset is used responsively;
- performance-impacting geometry/light/material growth.

## 3. Home 3D

- Home's Blender scene is the canonical premium visual direction.
- Keep the castle/hall diegetic and navigable; props should support destinations/progression rather than become decorative noise.
- Preserve hotspot/runtime alignment: do not move authored destination landmarks casually without updating the frontend mapping/tests.
- Evaluate desktop and portrait/tall mobile framing.
- Reuse/refine existing materials/geometry before adding extra lights or dense geometry.
- Mobile/lite runtime cost matters: avoid changes that force capable-phone support back into fallback for marginal visual gain.
- Fire, candle, metal, parchment, stone and wood refinements should be judged in the browser renderer as well as offline Blender because runtime tone mapping/material conversion can differ.

## 4. War Room v2

- v2 is Blender-authored; v1 remains the rollback baseline until v2 is fully accepted.
- Do not mutate/delete v1 source/assets from v2 builder work.
- Board visibility and playability dominate composition.
- Favor premium restrained military-strategy detail over prop accumulation.
- Refine existing materials, reliefs, furniture and lighting before adding geometry.
- Keep practical lights controlled; avoid blowing out brass, paper, fire or board squares.
- Camera/layout changes are high risk and require explicit browser/mobile artifact comparison.
- A material tweak that looks correct in Blender still requires app artifact review.

## 5. Chronicles/Tactics 3D assets

- 3D assets are presentation; gameplay IDs/coordinates/state remain data-driven elsewhere.
- Keep stable attachment/anchor/object names when code addresses them.
- Party silhouettes/classes must remain readable at actual isometric gameplay scale, not only in close renders.
- Dungeon/environment detail must not obscure walkable cells, interactables, traps or targeting.
- Prefer reusable modular pieces over one giant uneditable scene where the game is procedurally composed.

## 6. Runtime/export discipline

- Keep GLB/GLTF exports within the current runtime loading/compression contract.
- Do not commit huge intermediate renders/caches unless the repository explicitly tracks them.
- Runtime assets that belong in R2/CDN should use the repository publisher and stable logical IDs rather than ad-hoc URLs.
- Keep source/editable masters separate from immutable published runtime objects where the established pipeline does so.
- After export, validate the consumer path; an offline render alone does not prove the GLB loads or frames correctly in Three.js.

## 7. Resource discipline

Blender rendering can saturate the machine.

- Avoid parallel heavyweight renders that starve tests/browser validation.
- Reuse cached builds/artifacts.
- Prefer targeted preview/render passes during iteration and full required renders at acceptance points.
