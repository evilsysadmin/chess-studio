# Pawn Slug canonical handoff

The approved master is copied byte-for-byte from the 2026-09-16 handoff.
Run `python3 scripts/art/derive_pawn_slug_canonical.py` with Pillow, NumPy and
opencv-python-headless to derive the lossless runtime WebP and metadata.
The script verifies the master SHA-256 before and after processing.

The 768×960 atlas uses right-facing poses only, silhouette-guided background
matting, a shared scale, 192px cells and a 24px foot anchor. Master art is never
regenerated or retouched. The master is not imported into the application bundle.

Pistol uses the complete approved character, without a second head overlay.
Firing uses the aim pose, crouching keeps its armed crouch pose. The sheet has no
jump sequence: the aim pose uses existing runtime jump motion. Walk and run use
four source poses; rear views and presentation lettering are excluded.
Other weapons retain their specific premium atlases and existing head overlay;
they never silently display pistol art. Failed weapon loads remain hidden and
can retry; stale completions are disposed.
