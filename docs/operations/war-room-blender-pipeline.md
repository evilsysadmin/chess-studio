# War Room premium · Blender pipeline

War Room v2 and v3 use deterministic Blender generators for their static room shells. Each regenerates an editable `.blend`, runtime `.glb`, review PNG and JSON manifest from source code, keeping large generated blobs out of normal Git history.

**War Room v2 is the default variant** wherever variants are enabled (staging and production builds set `VITE_WAR_ROOM_VARIANTS_ENABLE`); a player's explicit pick in the War Room «…» menu is stored per device and always wins. The War Room v1 remains the rollback baseline: removing that flag from the production build workflows returns everyone to v1 (builds without the flag, such as local dev and the plain e2e build, stay on v1 too). If the v2 shell fails to load, the scene falls back to the classic room on its own. Variant work must not irreversibly delete or entangle that rollback lane. The in-game scene selector exposes v1, v2, v3 and v4 as separate rooms and persists only their stable IDs (`classic`, `v2`, `v3`, `v4`). v4 is explicit-only while it is validated on device: the «Aleatoria» preference never draws it (`randomPool: false`). It uses the shared runtime play camera (the same selectable pitch as v2/v3), and its runtime captures run only when its shell, the shared Blender runtime or the variant registry change.

## Variant ownership

- `build_war_room_premium.py` owns the v2 room.
- `build_war_room_v3.py` owns the v3 Armory Hall. It reuses only the proven board anchor and camera object; visible v2 architecture and the retired observatory (`WR3_OBS_*`) are forbidden by validation. It retains an independent art contract, publisher, R2 prefix and Blender gate.
- v3 has one great stone hearth centred on the back wall; a second hearth or its practical-light anchor is a regression.
- Runtime aliases are independent: `war-room/v2/...` and `war-room/v3/...`. Never publish one variant over the other variant's alias.

## Ownership boundary

Blender owns the static environment, materials, authored lights and named anchors. The application owns live chess state, legal moves, clocks, overlays and interaction.

The preview may contain representative board squares/pieces for art direction, but preview-only meshes never become the authoritative game board. `WR_ANCHOR_board_origin` is the alignment contract between the shell and the live renderer.

A visual PR must not quietly change chess legality, persistence or game semantics.

## War Room v3 canonical visual reference

Since 2026-09-30 v3 is the Armory Hall (`war-room-armory-hall-v3`), replacing the retired celestial observatory. Like v4, its review camera is the runtime's shared desktop play camera, so the Blender preview judges what the player sees.

Non-negotiable cues: a stone hall under a corbelled cornice open to the night sky; a ring of eight life-size plate armours with halberds on the sides and back, facing the board, never between the camera and the near ranks; heraldic shields over crossed swords on every wall, the side-wall ones on brackets turned toward the player so their faces read; long crimson and royal-blue banners; iron torches; one great hearth with the house crest on its hood and two moonlit lancet windows; a round stone dais with a crimson rug under an oak board frame sized for the ×1.08 live board. Crenellations inside the hall are a retired regression (they read as toy teeth). v3 materials carry no sheen, and many-part decor (armours, trophies, banners, torches) is fused by material to stay far inside the ≤150 batched-mesh budget. At runtime the hearth burns a wide log fire (`WAR_ROOM_V3_HEARTH_FIRE_SHAPE`).

## War Room v4 canonical visual reference

`build_war_room_v4.py` owns the v4 Moonlit Royal Observatory. v3 stays untouched as its rollback. The approved 2026-09-29 golden mock has SHA-256 `e16adf4e3a2ea0ba9f8e7a0b4a82a988b8a2bb821c491f9ff48ba4129cdf3871` and is kept in the design library, not in Git.

The v4 review camera is the runtime's shared desktop play camera (22° lens, ≈43.9° play pitch, immersive distance), so the Blender preview judges exactly what the player sees; the mock mixes perspectives and cannot be matched by one camera anyway. From that angle the whole circular observatory reads around the board: a 4.5 m wall with a brass crown and finials, open night sky over a dark pine meadow, and an elliptical oculus sitting on the desk with a lion crest. v4 materials carry no sheen: Blender exports it as full white, which washes dark leather and fabric out in three.js.

Non-negotiable cues: a broad walnut board frame with brass fillets, corner domes and warm rim bulbs; crimson gold-bordered runners flanking the dais; ivory marble inside a ring of green diamonds; cream fireplace left; library and red-tripod telescope right; silver armour on both sides; blue lion banners flanking the oculus; navy club chair on a round crimson rug. The preview seats White on the camera side. The runtime draw budget of ≤150 batched static meshes still applies, so fuse many-part distant decor (sky ridges, pines) into a single mesh.

## Iteration loop

Prefer small, single-purpose visual slices. The repeated loop is:

1. change the deterministic Blender source;
2. render the real review camera;
3. generate the Blender PNG artifact;
4. visually inspect it against the last accepted artifact;
5. reject or correct overlaps, clutter, material/plasticity problems, lighting mistakes or hierarchy regressions;
6. export/publish the runtime GLB;
7. capture the application using that exact GLB;
8. inspect desktop and, when framing can change, mobile runtime PNGs;
9. only then treat the iteration as visually accepted.

CI success is not visual acceptance. A green validator can still produce a bad composition.

## Composition rules learned from v2 iteration

- Keep the board as the dominant playable surface.
- Prefer negative space over filling every bay with props.
- Do not let chandeliers, banners, crests, pilasters, campaign panels or fireplaces merge into tangled silhouettes.
- Secondary hearths/props must remain secondary; practical lights should support hierarchy rather than compete with the board.
- Reuse existing materials where possible, but do not accept generic plastic-looking stone/wood/metal solely to reduce material count.
- When an experiment reads worse in the actual PNG, remove it cleanly instead of decorating around the mistake.
- Validators may guard retired geometry so rejected clutter cannot silently return.

## Exact revision for PR runtime capture

PR workflows must capture the runtime asset built from the **pull-request head revision**, not GitHub's ephemeral synthetic merge SHA.

A PR merge SHA may never be published to the War Room revision bucket; probing it produces repeated 404s and no useful PNG. Non-PR workflows may use the normal exact commit SHA.

Whenever Blender publication and application capture are split, the capture must prove which authored revision it loaded.

## Runtime parity is a separate gate

A correct Blender render does not prove a correct Three.js/runtime scene. Check for:

- exposure/material differences;
- GLTF node-name transformations;
- missing/white textures or CSP failures;
- clipping and framing differences;
- overlays covering authored geometry;
- mobile crop/overflow;
- practical lights producing a different hierarchy at runtime.

Keep the runtime capture as evidence beside the Blender preview.

## Performance

Measure the path users actually feel. For v1 this includes sustained rendering during a moving piece, not only a single steady-state frame.

Performance adaptations are renderer-specific:

- a v1 adaptive-quality fallback must not silently degrade v2;
- final state of every move must still render;
- movement duration stays wall-clock based rather than slowing gameplay to hide rendering cost;
- quality reductions need an observable trigger and a regression test.

Do not trade legibility for frame rate without evidence; measure draw/paint cadence and validate on midrange hardware or an equivalent budget.

## Acceptance

A v2 or v3 visual iteration is accepted only when:

- deterministic Blender generation succeeds;
- Blender PNG has been visually reviewed;
- runtime app capture uses the intended exact revision/asset;
- desktop and relevant mobile framing are sane;
- board interaction and renderer parity remain intact;
- performance does not regress without an explicit budget decision;
- v1 rollback remains viable.

Related contracts: `war-room-parity.md` and `war-room-visual-freeze.md`.
