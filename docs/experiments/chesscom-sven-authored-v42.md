# CHESSCOM Sven V42 — authored original rig, review only

This branch **does not claim to have met the approved Dust Veil visual reference**.
The source Blender script authors our own tactical Sven with a real deform skeleton,
surface and weapon components, no downloaded generic SWAT pack. Output is a
reproducible candidate GLB and editable blend, both generated as temporary
artifacts in CI (large binary models are not committed to Git).

The canonical visual target is the **user-owned PNG** pinned in
`docs/experiments/chesscom-golden-art-v41.json`. In V42, compare the eight
rendered 256×384 perspectives against the approved Sven scene+portrait before
merging anything. Check real-game projected scale, helmet/balaclava, garment
silhouette, facial read, **two hands actually gripping the carbine**, natural
anatomy, eight honest viewpoints, and boots on the ground. Any LEGO-looking
or technically invalid model should be **revised or rejected**, not
passed because the workflow ran.

`scripts/blender/chesscom_sven_authored_master_v42.py` creates source
`sven-owned-v42.blend` and `sven-owned-v42.glb` in CI output.
The existing V40 rig auditor and eight-perspective preview script then run
on the exact SHA256 of those binary outputs. No 96-frame animation yet,
no automatic R2 publication and **no runtime swap**. Matthias remains
a chess pawn and Dieter stays independently characterized.
