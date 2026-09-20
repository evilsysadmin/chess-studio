# Pawn Slug Godot — sprite iteration contract

This file augments the repository root `AGENTS.md` for `games/pawn-slug-godot/`.
Repository-wide Git/PR/CI rules, especially the no-polling rule, still apply.

## Goal

Iterate Pawn Slug sprites until the next generation is deployed to staging, visually reviewed, regression-checked and clearly improved while remaining compatible with the real Godot runtime.

Pawn Slug Godot is pure 2D.

- Do not use Blender for Pawn Slug sprites.
- Blender is reserved for Home 3D and War Room v2.
- The canonical sprite pipeline is:
  `image_gen -> isolated 2D frames -> scripted normalization/packing -> PNG atlas/spritesheet -> Godot validation`.

## Canonical Matthias constraints

Every Matthias iteration must preserve:
- canonical pawn identity;
- same apparent body size;
- same foot line;
- same pivot;
- same proportions;
- stable locomotion;
- consistent default gun pose;
- continuity between frames;
- clear silhouette;
- consistent body, limb and weapon volume across animations.

## Minimum coverage

Cover all relevant supported poses and weapons, including when applicable:
- horizontal fire;
- fire up;
- fire down;
- diagonal-up fire;
- diagonal-down fire;
- crouch fire;
- crouch-walking;
- at least 8 frames per pose/animation when that motion benefits from an 8-frame cycle.

Pawn Slug movement/combat requirements include lateral movement and jumping for platforming, while attacks remain pawn-authentic where chess rules are involved. Aiming/shooting supports horizontal, vertical and diagonal directions. Respawn placement must never leave Matthias intersecting blocking collision geometry; validate the requested spawn and relocate to the nearest safe valid spawn/ground position when needed.

## Generation and packing rules

`image_gen` produces isolated 2D source frames only. Do not ask it to create a final artistic collage that then has to be guessed apart.

The final atlas is assembled by deterministic script. The packer must enforce:
- consistent frame canvas;
- consistent pivot;
- consistent foot line;
- consistent body scale;
- correct transparency;
- consistent frame spacing;
- deterministic layout;
- deterministic output where identical inputs produce identical PNG bytes;
- real Godot-compatible PNG/manifest output.

Krita or Aseprite may be used only for targeted frame retouching. They do not own final atlas layout.

Python + Pillow/NumPy/OpenCV perform crop/transparency/normalization/validation/packing where required. Use pinned project versions and no randomness in deterministic build steps.

ImageMagick may inspect dimensions, alpha and hashes. `oxipng` is allowed as a lossless final optimizer, before the published SHA-256 is calculated. `pngquant` is forbidden because quantization changes the image contract.

## Godot compatibility contract

Required properties:
- frames aligned to a deterministic grid;
- fixed-size cells;
- transparent margin between frames to prevent filtering bleed;
- no accidental cropping;
- no foot jitter;
- no scale changes between frames;
- no arbitrary body/weapon displacement;
- easy consumption via `AnimatedSprite2D`, `SpriteFrames`, `AtlasTexture` or equivalent slicing.

PNG contract:
- 8-bit RGBA;
- straight alpha, not premultiplied;
- no `iCCP`, `gAMA`, `sRGB` or `cHRM` color-profile chunks;
- clean RGB below alpha=0 pixels to avoid halos;
- non-interlaced;
- width and height <= 16384 px, the hard web texture limit currently enforced by the pipeline.

Current large atlases have historically exceeded 4096/8192 on one side. If target/mobile GPU limits make that unsafe, split atlases by animation rows rather than weakening validation.

Import/runtime expectations:
- `compress/mode=0` / lossless;
- `mipmaps/generate=false`;
- `fix_alpha_border=true`;
- no alpha premultiplication;
- current runtime uses linear filtering for hi-res cells reduced on screen, so transparent inter-cell margins remain mandatory;
- do not switch to nearest filtering without a deliberate visual revalidation.

A deterministic manifest JSON lives beside each atlas and includes at minimum:
- cell size;
- columns/rows;
- pivot;
- foot line;
- frames per animation;
- PNG SHA-256.

Godot/runtime validators consume the manifest. Do not duplicate atlas regions as unrelated hardcoded GDScript constants.

## Local tooling

Use `.venv/bin/python` for art scripts. The project virtualenv uses the pinned versions from `scripts/art/requirements.txt` plus pytest; do not assume system Python/NumPy is equivalent.

The expected Godot CI binary is `.godot-ci/4.7.2/godot` when present, matching CI version/hash and ignored by git.

Optional/known tools:
- `oxipng`: allowed lossless optimizer;
- Krita: targeted retouching only;
- Aseprite CLI, if installed/licensed: targeted retouching and tag/frame export reference only, never final atlas packing.

Do not claim validation by a tool that is not installed or was not executed.

Free-layout texture packers such as TexturePacker/Free Texture Packer are forbidden for these runtime atlases. The layout is a fixed deterministic grid emitted by our packer.

## Validators

Current validators include:
- `scripts/art/validate_pawn_slug_godot_atlas_v10.py` for Matthias;
- `scripts/art/validate_pawn_slug_enemy_v2.py` for enemies;
- shared `scripts/art/png_contract.py`;
- PNG contract tests in `scripts/art/test_png_contract.py`.

The art CI deliberately keeps dependencies minimal where possible, currently relying on Pillow unless a job explicitly installs more.

Godot headless validation (`--headless --import` plus tests under `games/pawn-slug-godot/tests/`) must verify that atlas regions from the manifest fit the PNG and can build/load the expected `SpriteFrames`/`AtlasTexture` structures.

## Visual iteration loop

For every sprite iteration:
1. generate the new isolated 2D frames;
2. normalize/pack them by script;
3. produce the review PNG artifact;
4. inspect that artifact visually;
5. compare it with the canonical/previous validated iteration;
6. identify visual or functional regressions;
7. correct and repeat locally;
8. retain the latest validated worksheet/artifact in the project cache so a failed chat/tool session can resume;
9. push the coherent iteration as a PR;
10. follow the root `AGENTS.md` no-polling CI flow;
11. validate staging at a natural checkpoint when the deployment is available.

Acceptance requires:
- clear visual improvement or a clearly justified compatibility/functional improvement;
- animation continuity equal or better than baseline;
- required pose/weapon coverage;
- no regression in pivot, foot line, scale or alpha contract;
- real Godot compatibility;
- visually inspected PNG artifact;
- staging validation when the change is intended to alter deployed runtime visuals.

## Enemy contract

Enemy variants must share a coherent visual family with Matthias:
- compatible palette/contrast language;
- stable foot line/pivot/cell scale;
- readable silhouettes;
- stable proportions within each enemy family.

Each enemy type may have its own armor, helmet, protection and weapon, but its identity cannot depend on a decorative/vector background.

Enemy atlases are produced from isolated 2D frames through the deterministic packer. Do not hand-author a final composite atlas.

Keep the latest validated enemy worksheet under `games/pawn-slug-godot/art/` so future iterations can resume from it.

When using capable local hardware for sprite generation or rendering, avoid saturating CPU/GPU to the point that validation or the rest of the workflow becomes unreliable.

## CI workflow preservation

Do not delete Pawn Slug sprite/art workflows merely because generation can currently be done locally. Existing generation/validation/publishing workflows remain useful as fallback and reproducibility gates.

In particular, preserve the relevant sprite workflows (including historical v6/v9/v10, Godot web, sprite smoke and Pawn Slug art workflows) unless a deliberate replacement provides equivalent or stronger coverage.

Packers and validators must remain runnable by CI without undocumented manual steps. Each workflow is responsible for installing the dependencies it requires.

Cloudflare R2 publishing uses `scripts/r2_asset_publisher.py` with immutable/versioned assets. Runtime migration toward R2/CDN should keep stable logical IDs/content-addressed assets and a controlled local fallback while migration is incomplete; do not put large canonical/master sprite blobs back into Git merely for convenience.
