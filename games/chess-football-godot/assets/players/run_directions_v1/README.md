# Chess Football · directional run canon v1

The accepted extra directional sprite sheet supplies **four rows × eight frames**:

1. `front` (toward camera; pitch Y positive)
2. `back` (away from camera; pitch Y negative)
3. `back_diagonal` (mirrored for opposite horizontal direction)
4. `front_diagonal` (mirrored for opposite horizontal direction)

The original eight-frame lateral `run` canon remains unchanged and authoritative for left/right movement. New views are selected from pitch velocity in the 3D presenter, preserving animation phase and existing football gameplay.

- Approved source sheet SHA-256: `f4102df3dff9620606ddb3c2ff8fb234b150f255562561e2b1b7a8fc3802dee7`
- Normalized PNG / base64 runtime payload SHA-256: `7d23e79dd5f9b23d1a04cf27f4d725d249e37f528c23d696ea260cd498644e70`
- Normalized atlas: 1024×576 RGBA, 8 columns × 4 rows, 128×144 cells, baseline y=130
- Eight run-cycle frames per view; canonical cadence 12 FPS; sprint reuses phases at 15 FPS
- Full-figure component extraction, not a blind rectangular cut (diagonal arms cross template boundaries)
- Deterministic team hue remap in game; no alterations to the base side-run poses

`directional_run_v1.png` is the reviewable atlas; `directional_run_v1.b64` encodes the **same PNG bytes** for reliable Godot Web export. The `scripts/art/extract_chess_football_directional.py` script reproduces atlas normalization from the approved source image, verifying all 32 intact figures and refusing clipped frames.
