# Football · portero canónico raster v1

This is the user-approved goalkeeper with cap, gloves and a distinct long-sleeve jersey. No new image generation: the source was the approved conversation image (1495×1052 RGBA), SHA-256 `6d4536b1cc5c0f7e14cceb6b7c7595e56f63e74c74b9272dfd470263bfecef6f`.

**The actual approved image has four rows, not five**: front, back, back_diagonal, front_diagonal, each with eight run frames. It does **not** contain a true side profile. Until a side source is approved, the game uses the *authored back-diagonal keeper pose* when the goalkeeper runs laterally, rather than reverting to the field-player sprite.

Normalization is deterministic: 1495×1052 source → 1024×576 4×8 atlas, 128×144 cells, common footline 130 and ~118px visible body. Original frames never cropped by naive equal-width slicing: the script detects one figure per cell. Runtime atlas is optimized to 256 indexed RGBA palette colors (no new image generation). PNG SHA-256: `41ca02f757545eb39c4f80e99eb358c167e8f9044153bedfd799ad488a88ca9c`.

`keeper_run_v1.b64` is the exact PNG encoded for Godot Web; `keeper_run_v1.png` is reviewable. FC Matthias wears approved yellow/dark with gloves and cap. Real Enroque remaps **only yellow fabric** to muted cyan/teal, preserving cap, gloves, skin and shading.

Runtime is 3D-only for this new identity. The existing vector action timings and 2D simulation are not changed. Four action animations use poses from the keeper side fallback until matching purpose-drawn keeper action frames exist. All squad slots use one canonical 128×144 footline and the same scale pipeline.
