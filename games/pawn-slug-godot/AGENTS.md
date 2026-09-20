# Pawn Slug Godot — runtime and sprite contract

This file augments the repository root `AGENTS.md` for `games/pawn-slug-godot/`.
Also read `scripts/art/AGENTS.md` when changing sprite generation/packing/publishing.

Pawn Slug Godot is pure 2D. Blender is not part of its sprite pipeline.

## 1. Product/runtime ownership

Godot owns Pawn Slug gameplay.

- Do not duplicate movement/combat rules in the React host.
- Keep gameplay, collision, spawn safety, animation selection and projectile origins testable in Godot/headless tests.
- Preserve web export compatibility and current embedding/host contracts.
- Remote canonical art may be resolved through stable R2 logical IDs; loading it must not cause visible legacy-fallback flashes during an ordinary successful download.

## 2. Matthias movement and combat

Matthias may move laterally and jump for platforming/exploration.

Required control/gameplay direction:
- crouch;
- crouch-walking under low geometry;
- horizontal shooting;
- vertical up/down shooting;
- diagonal up/down shooting;
- stable weapon/aim animation selection;
- projectile/muzzle origin aligned with the authored weapon/frame whenever canonical frame data supports it.

Pawn-authentic chess interactions/attacks remain pawn-authentic where that mechanic applies; environmental platforming freedom does not mean replacing the character with generic run-and-gun rules.

Respawn safety is mandatory:
- never respawn Matthias intersecting a blocking platform/collider;
- validate the requested spawn against world collision;
- relocate to the nearest safe valid spawn/ground position when blocked;
- add regression coverage for geometry that overlaps a nominal spawn.

## 3. Canonical Matthias sprite constraints

Every sprite iteration preserves:
- canonical pawn identity;
- stable apparent body size;
- stable foot line;
- stable pivot;
- stable proportions;
- readable silhouette;
- consistent weapon/hand/body relationship;
- continuity across animation frames;
- stable locomotion without body breathing/jitter.

Cover all relevant supported weapons/poses. For cyclic motion, target at least 8 genuinely distinct frames when the animation benefits from an 8-frame cycle; do not pad with duplicates merely to satisfy a count.

Directional fire coverage includes horizontal, up, down, diagonal-up, diagonal-down and crouch fire where applicable.

## 4. Enemy cast contract

Enemy variants must read as one coherent Pawn Slug family while retaining distinct roles.

- stable cell scale/pivot/foot line within the enemy atlas contract;
- readable silhouette and weapon at gameplay scale;
- role identity may come from helmet/armor/protection/weapon/body shape, not decorative backgrounds;
- integrated weapon art must not also receive a legacy weapon overlay;
- integrated muzzle/fire origin must align with the visible barrel/weapon rather than an invisible generic socket;
- preload canonical cast art cleanly; use fallback only on real failure, not while the preferred asset is still loading.

Keep the latest validated enemy worksheet/artifact available for resumed iteration.

## 5. Sprite pipeline

Canonical flow:
`image_gen/reference -> isolated frames/worksheet -> scripted normalization -> deterministic atlas -> manifest -> validators -> Godot headless -> review PNG -> R2/runtime`

Image generation is for 2D source frames/worksheets only. Final atlas packing is scripted.

The packer must enforce:
- consistent frame canvas;
- consistent pivot/foot line;
- consistent apparent body scale;
- correct straight-alpha transparency;
- transparent inter-cell margins where filtering needs them;
- deterministic row/column ordering;
- deterministic manifest metadata;
- no accidental crop/bleed.

Krita/Aseprite may be used for targeted retouching/reference export only; they do not own the final runtime layout.

## 6. Godot/PNG compatibility

Follow the current validators as executable source of truth.

Baseline expectations:
- fixed deterministic grid/cells;
- 8-bit RGBA straight alpha;
- non-interlaced PNG;
- no forbidden color/gamma profile chunks;
- clean RGB under alpha=0;
- no foot jitter/scale drift;
- atlas dimensions inside the current web/runtime hard texture limit;
- split oversized atlases by logical animation groups/rows when target GPU limits require it rather than weakening validation.

Runtime/import expectations:
- lossless import;
- no generated mipmaps unless the project contract explicitly changes;
- alpha border handling compatible with linear filtering;
- no premultiplication surprises;
- manifest-driven `SpriteFrames`/`AtlasTexture` regions that fit inside the PNG.

Do not switch filtering strategy (for example linear -> nearest) without explicit visual/runtime revalidation.

## 7. Deterministic manifest

Every runtime atlas/sheet family keeps machine-readable metadata sufficient to reconstruct slicing/anchors and validate identity, including as applicable:
- cell dimensions;
- rows/columns;
- animation frame ranges;
- pivot;
- foot line;
- authored muzzle/attachment data where supported;
- PNG/content hash.

Do not duplicate these atlas coordinates as unrelated magic constants throughout GDScript.

## 8. Current tooling expectations

Use the project environment/toolchain when present rather than system guesses.

- art Python scripts: project `.venv/bin/python` with pinned requirements;
- Godot headless: repository/CI-pinned Godot binary/version when present;
- lossless PNG optimizer such as `oxipng` is allowed before final hash;
- lossy palette quantization is not allowed for canonical runtime sheets;
- free-layout texture packers are not used for canonical fixed-grid runtime atlases.

Never report a Godot/art validation as passed if the required binary/dependency was unavailable.

## 9. Tests and visual gates

For sprite/runtime changes use the strongest relevant combination available:
- art script/unit tests;
- PNG/layout/hash validator;
- frame-diversity/anchor checks;
- Godot headless import/load/runtime tests;
- web export/smoke where affected;
- browser visual artifact at deployed/runtime scale.

Every sprite iteration must produce and inspect a PNG review artifact.

Check especially:
- feet/pivot jitter;
- weapon/hand continuity;
- directional muzzle alignment;
- alpha halos/cell bleed;
- duplicated frames;
- downscale readability;
- fallback flashes/duplicate guns;
- regression against the last promoted canonical family.

## 10. CI/R2 preservation

Do not delete sprite/art workflows merely because local generation is currently possible.

- Keep packers/validators runnable in CI without undocumented manual steps.
- Preserve generation/validation/publish workflows until deliberately replaced by equivalent or stronger gates.
- Publish large runtime sprite families through the repository R2/CDN pipeline using immutable/content-addressed objects plus stable logical IDs.
- Keep high-resolution canonical masters outside Git when that is the established asset policy.
- Promotion to runtime should reference the validated immutable assets, not an unreviewed mutable source.

## 11. Iteration loop

For each Pawn Slug art/runtime iteration:
1. inspect the current promoted runtime and latest validated worksheet/artifact;
2. make one coherent change;
3. run focused local gates;
4. generate/inspect review PNG;
5. compare against promoted baseline;
6. correct regressions locally;
7. push/open PR and enable automerge;
8. do not wait for workflows;
9. before the next PR, take one status snapshot of the previous one;
10. validate staging/runtime at a natural checkpoint when available.
