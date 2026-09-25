# War Room premium · Blender pipeline

War Room v2 and v3 use deterministic Blender generators for their static room shells. Each regenerates an editable `.blend`, runtime `.glb`, review PNG and JSON manifest from source code, keeping large generated blobs out of normal Git history.

**War Room v2 is the default variant** wherever variants are enabled (staging and production builds set `VITE_WAR_ROOM_VARIANTS_ENABLE`); a player's explicit pick in the War Room «…» menu is stored per device and always wins. The War Room v1 remains the rollback baseline: removing that flag from the production build workflows returns everyone to v1 (builds without the flag, such as local dev and the plain e2e build, stay on v1 too). If the v2 shell fails to load, the scene falls back to the classic room on its own. Variant work must not irreversibly delete or entangle that rollback lane. The in-game scene selector exposes v1, v2 and v3 as separate rooms and persists only their stable IDs (`classic`, `v2`, `v3`).

## Variant ownership

- `build_war_room_premium.py` owns the v2 room.
- `build_war_room_v3.py` owns the v3 Celestial Observatory. It reuses only the proven board anchor and camera profile; visible v2 architecture is forbidden by validation. It retains an independent art contract, publisher, R2 prefix and Blender gate.
- v3 has one cylindrical cast-iron stove/fireplace. Its right bay belongs to a brass observatory telescope and the tower entry; a second hearth or its practical-light anchor is a regression.
- v3 follows the 2026-09-25 canonical observatory mock: curved cream/teal tower walls, a green-and-cream marble checkerboard floor, circular green command rug, moon-and-stars oculus with no orbital rings, one inward-facing cast-iron stove, brass telescope, leather reading chair, compact chess-treatise bookcase, warm wall lanterns and a teal/copper tower door that visibly meets the floor. Overhead canopy bars/ribs and suspended armillary clutter are retired regressions. Its teal, travertine, walnut, brass and celestial-blue palette must not collapse back into v2's rectangular walnut hall.
- Runtime aliases are independent: `war-room/v2/...` and `war-room/v3/...`. Never publish one variant over the other variant's alias.

## Ownership boundary

Blender owns the static environment, materials, authored lights and named anchors. The application owns live chess state, legal moves, clocks, overlays and interaction.

The preview may contain representative board squares/pieces for art direction, but preview-only meshes never become the authoritative game board. `WR_ANCHOR_board_origin` is the alignment contract between the shell and the live renderer.

A visual PR must not quietly change chess legality, persistence or game semantics.

## War Room v3 canonical visual reference

The accepted canonical snapshot is `war-room-v3-canonical.png`, SHA-256 `8e1e6946e2c9bc43968d39b79c52587b2e02edd3a771eb2acd190f97fc2ead33`. The working master is mirrored in the Chess Studio design library at `/Chess Studio/Design/War Room v3/war-room-v3-canonical.png`; deterministic Blender review artifacts are judged against its composition rather than against older v3 renders.

Non-negotiable cues: open ceiling without crossing bars, moon + stars only in the oculus, cream/green tiled floor, door grounded on a threshold, board kept dominant, and sparse lived-in props (chair, small bookcase, telescope, stove) around the perimeter.

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
