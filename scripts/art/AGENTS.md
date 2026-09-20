# Chess Studio 2D art pipeline — operating contract

This file augments the repository root `AGENTS.md` for `scripts/art/`.
It owns deterministic 2D generation/normalization/packing contracts used especially by Pawn Slug.

## 1. Role of generation tools

Image generation produces source art/isolated frames, not the final runtime atlas.

Canonical flow:
`source/reference -> isolated 2D frames/worksheet -> scripted cleanup/normalization -> deterministic pack -> validate -> review PNG -> runtime publish`

Do not use Blender for Pawn Slug sprites.
Do not ask an image generator to make a final decorative collage and then guess frame boundaries from it.

## 2. Determinism

Packing/normalization steps must be deterministic.

- fixed canvas/cell size;
- fixed pivot/anchor/foot line where the contract defines them;
- fixed ordering/layout;
- no hidden randomness;
- identical inputs should produce identical output bytes where practical;
- calculate hashes only after final lossless optimization;
- keep manifests/mapping data versioned with the generated runtime asset.

Use project-pinned Python/tool versions for reproducible work. Do not assume system NumPy/Pillow/OpenCV versions are equivalent.

## 3. PNG contract

Runtime atlas PNGs must satisfy the current repository validator contract.

Baseline expectations:
- 8-bit RGBA;
- straight alpha;
- non-interlaced;
- clean RGB under fully transparent pixels;
- no accidental color-profile/gamma chunks when the validator forbids them;
- no clipping or alpha bleed across cells;
- transparent gutter/margin where filtering requires it;
- dimensions remain inside the runtime/web texture hard limit enforced by current validators.

If a mobile/GPU texture-size risk appears, split the atlas by logical animation groups/rows rather than weakening the contract.

`oxipng` may be used losslessly before final hash publication. Do not use lossy palette quantization such as `pngquant` for canonical runtime sheets.

## 4. Review artifacts

Every art iteration must emit a human-reviewable PNG/contact sheet.

Inspect at actual/useful scale for:
- identity/silhouette drift;
- frame-to-frame body scale changes;
- foot/pivot jitter;
- weapon/hand discontinuity;
- alpha halos;
- duplicated/missing limbs or props;
- unintended source-cell bleed;
- palette/material inconsistency;
- obvious low-resolution runtime failure after downscale.

Keep the latest validated worksheet/review output recoverable so the next iteration can resume after a failed chat/tool session.

## 5. Pawn Slug

For Pawn Slug, also read `games/pawn-slug-godot/AGENTS.md`.

Stable art rules:
- canonical Matthias identity/proportions must remain recognizable across weapon banks/animations;
- enemy cast variants share a coherent visual family but may have distinct silhouettes/armor/weapons;
- integrated enemy weapon art must not be redundantly overdrawn by legacy weapon overlays;
- directional fire artwork/runtime muzzle origin must follow the authored weapon/frame rather than a generic body-center socket when canonical data is available;
- keep enough distinct frames for motion to read; do not satisfy a nominal frame count with duplicate frames;
- death/downed or other intentionally frozen canonical rows must remain byte/geometry-stable when an iteration explicitly excludes them.

## 6. Manifests and Godot handoff

The packer emits deterministic manifest metadata beside runtime sheets, including the data required by Godot to slice/anchor frames and verify the PNG hash.

- Godot/runtime should consume manifest data instead of duplicating unrelated hardcoded atlas regions.
- Validators must fail closed on missing/bad dimensions, alpha contract, layout, frame diversity or manifest/hash mismatch.
- Keep real Godot headless consumption tests in the acceptance path where the workflow provides them.

## 7. R2/CDN publication

Large canonical/master visual assets should not be pushed into Git merely for convenience.

- publish immutable runtime objects through the repository R2 publisher;
- keep stable logical IDs in the runtime manifest;
- content-address/version the underlying object;
- update runtime logical mapping deliberately;
- preserve a controlled fallback only while migration requires it;
- verify the published object/hash before promoting runtime consumers.

Do not bake a temporary signed URL or mutable object URL into production code.
