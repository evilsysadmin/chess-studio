# Pawn Slug canonical handoff

The approved Matthias master is immutable and intentionally lives outside Git. Its logical R2 ID is `pawnSlug.matthias.canonicalMaster` and its SHA-256 is `9c21264274777d012a2941073f6cbae94df090db0459624e6031207c0a288c5f`.

To derive the lossless pistol runtime WebP and metadata, provide that exact master explicitly:

```bash
python3 scripts/art/derive_pawn_slug_canonical.py \
  --master /path/to/matthias_canonical_sprite_sheet_v1.png
```

Pillow, NumPy and opencv-python-headless are required. The script verifies the master SHA-256 before and after processing; it never regenerates or retouches the master.

The 768×960 atlas uses right-facing poses only, silhouette-guided background matting, a shared scale, 192px cells and a 24px foot anchor. Pistol uses the complete approved character, without a second head overlay. Firing uses the aim pose and crouching keeps its armed crouch pose. The sheet has no jump sequence, so the aim pose uses existing runtime jump motion. Walk and run use four source poses; rear views and presentation lettering are excluded.

Other weapons are immutable R2 assets referenced through `frontend/src/assets/r2-assets-manifest.json`; they never silently display pistol art. Failed weapon loads remain hidden and can retry; stale completions are disposed.
