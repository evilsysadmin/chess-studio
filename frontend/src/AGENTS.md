# Chess Studio frontend — operating contract

This file augments the repository root `AGENTS.md` for `frontend/src/`.
The root non-blocking CI/Git rules always apply.

## 1. Frontend architecture

Keep product logic in focused domain modules/hooks rather than growing `App.jsx` or giant screen components.

Rules:
- preserve existing state machines for flows that already have them;
- use shared storage/persistence helpers rather than raw ad-hoc `localStorage`/`sessionStorage` access for resilient state;
- preserve cancellation/stale-response protection in async UI;
- lazy-load heavy/secondary surfaces where the current architecture does so;
- avoid duplicate sources of truth between UI state and domain state;
- recover gracefully from blocked/quota-limited Web Storage and offline/reconnect scenarios;
- add focused regression tests when moving orchestration into hooks/modules.

## 2. Standard chess and game screens

Standard chess modes must remain standard chess.

- Legal moves, terminal states and move history must come from the real chess rules/engine contract, never from UI guesses.
- Validate CPU/suggested moves against legal moves before applying them.
- Do not leak Combat Chess HP, metamorphosis, ranks, permadeath or special rules into normal chess, tournament, puzzles or spectator modes.
- Preserve active-game recovery, clocks, color/turn ownership, BO3/BO5 flow and reconnect semantics when touching shared game orchestration.
- Board/UI polish must not change move legality, board orientation, square parity or piece ownership accidentally.
- When changing the War Room presentation, keep the underlying game state independent from the 3D renderer.

## 3. Matthias

Matthias is the one fixed CPU/narrative character.

- Do not add selectable CPU personalities or user-facing alternate identities without an explicit product change.
- Keep his tone elegant, mildly smug, sarcastic and restrained rather than constantly chatty.
- In-game remarks should happen only on genuinely noteworthy chess events.
- Home remarks, rivalry references, coaching and remembered incidents must be derived from real stored events/stats.
- Never fabricate a blunder, weakness, streak, prior result or tactical incident for flavor.
- Preserve his canonical visual identity when a shared Matthias asset is consumed across Home, Chronicles/Tactics or other surfaces.
- The one-time Home introduction remains one-time after meaningful exposure/interaction.

## 4. Home 3D

The canonical premium Home is a Blender-authored 3D scene consumed by the frontend runtime.

Product direction:
- Home is a diegetic castle/progression space, not a dashboard wall of cards.
- Important destinations should read from the scene itself.
- Hover/focus/touch interactions should make the relevant object/zone react subtly through light, glow, motion, parallax or another diegetic cue.
- Keep progressive disclosure; secondary modes can live behind diegetic transitions such as the Dungeon rather than crowding the main hall.
- Visible castle progression/rewards should reflect real achievements/performance, not arbitrary decoration or pure grind.

Runtime rules:
- Preserve the Blender runtime plus the established fallback path; do not assume every device can run the same quality tier.
- Capable Android/touch devices may use the reduced-cost Blender path; constrained devices must still have a functional fallback.
- Touch/mobile should not inherit expensive pointer-parallax behavior when the runtime policy deliberately keeps the camera static.
- Camera/framing changes must be checked at representative desktop, portrait mobile and tall/desktop-site mobile viewports.
- Hotspots/navigation must stay aligned with the rendered scene at every supported framing mode.
- A visual change is not accepted from source review alone: inspect Blender/review output and the browser/runtime artifact.

Do not replace a working diegetic interaction with generic dashboard chrome merely because it is easier to implement.

## 5. War Room v1 and v2

Treat v1 and v2 as separate visual implementations sharing gameplay, not as one scene that can be freely mutated.

### War Room v1
- v1 is the rollback/baseline implementation while v2 is still being validated.
- Do not delete, destructively overwrite or silently restyle v1 when a task targets v2.
- Changes intended only for v2 must be explicitly scoped so v1 behavior/assets remain intact.

### War Room v2
- v2 is Blender-authored and should remain cinematic, clean and board-first.
- The board is the protagonist; avoid reintroducing a large left panel or a tall decorative header that steals board area.
- Keep the compact opponent/status treatment above the scene rather than verbose mode labels.
- Preserve the right-side instrument/control rail unless a deliberate redesign says otherwise.
- Turn state should remain easy to read with restrained color/state indication; do not turn it into arcade HUD clutter.
- Do not add fixed labels such as “Cámara táctica”/“Sala de guerra” when the scene already communicates the space.
- Materials, lighting and props should feel premium, military-strategic and coherent; prefer refinement of existing geometry/materials before adding decorative objects.
- Visual changes require both Blender artifact review and in-app artifact review because runtime materials/camera/compositing can differ from offline render.
- Maintain mobile/responsive usability and keep the board large enough to play comfortably.

### War Room narrative/tutorial behavior
- The first-time War Room tutorial is diegetic and led by Matthias.
- It should teach select-piece -> legal destinations -> first move(s), be concise, skippable, touch/mouse friendly and available again from Help/tutorials.
- Hans scene beats must wait for the relevant War Room scene/state to be visibly ready; do not let late rendering consume dialogue/action frames before the user can see them.

## 6. Combat Chess

Visible brand: `Combat Chess`. “Roguelike” is a genre/descriptor, not the primary mode name.

Domain invariants:
- persistent units have persistent identity/alias, history, XP/rank/medals and service record;
- calibrated permanent death and revive windows must preserve identity when revived and archive it when permanently lost;
- fresh replacements are new identities and do not inherit veteran progression;
- veteran metamorphosis/loadout choices happen before battle and remain Combat-only rule bending;
- barracks/roster may exceed the deployed force; deployment decisions should matter;
- difficulty/threat compensation should primarily reflect the force actually deployed, not hidden total collection power;
- intelligence/recon uses its own earned currency rather than consuming veteran XP;
- intel may reveal progressively better threat/composition/modifier information but must not leak exact engine moves or invent false intelligence;
- ranks/medals/insignia should represent real achievements, not decorative inflation;
- veteran galones/insignia should be subtle and diegetic on the piece itself where practical.

Keep setup/briefing readable through progressive disclosure. Default view shows only the decisions needed now; deeper dossier/intel belongs behind an explicit action.

## 7. Puzzles, analysis and “Así juegas”

Training and coaching must be evidence-backed.

- Puzzles must only offer legal moves and validated solutions.
- Curated/personal tactical positions must pass the existing tactical-quality checks; do not manufacture one-move “solutions” that fail against a legal defense.
- “Así juegas” may describe only measured weaknesses/trends/incidents that the app actually stores or can reconstruct.
- `Entrenar este error` appears only when a real matching personal position exists or can be reconstructed and validated.
- Post-game summary stays concise by default; deeper forensic timeline/glossary belongs behind explicit disclosure.
- Avoid inventing drama from quiet moves merely to create highlights.

## 8. Admin and presence

Admin is operational tooling, not a surveillance console.

- Presence/activity remains coarse and sanitized.
- Keep foreground/background and broad current area/status only; no click, mouse, keyboard or game-content telemetry.
- Do not raise client heartbeat frequency just to make Admin feel more live; Admin may refresh its read side more often than clients report.
- Stale/out-of-order admin responses must not overwrite newer mutations/state.
- Release/client-version classification is informational and should use the existing heartbeat payload rather than new telemetry.
- Public online counters continue to follow their privacy/exclusion rules.

## 9. Chronicles of Matthias

Chronicles and Tactics are distinct products. Do not collapse their game loops or state models because they share lore/assets.

For Chronicles:
- a new run should bind to a generated/reproducible map/world identity rather than silently relying on one fixed default map;
- generation must be deterministic from its seed/map code so a run can be recovered, tested and shared;
- topology/content quality gates must remain in front of runtime use;
- authored modules, traps, mechanisms and procedural composition must preserve stable IDs so visual state and gameplay state refer to the same object;
- persistent run identity/world-binding data should survive reload/retry through the backend authority where designed;
- progression such as XP, levels, skills, magic or spells must be earned from real run events and persisted/recovered consistently; do not fake progression client-side for presentation;
- keep the world “gamey” and replayable without sacrificing deterministic debugging/reproduction.

When visual content is authored in 3D, the renderer should consume stable gameplay state rather than embedding rules into meshes.

## 10. Chronicles of Matthias Tactics

Tactics is the turn-based/isometric tactical branch.

- Preserve turn ownership, pathing, ability legality, class/skill state and deterministic mission/world state independently from rendering.
- Do not turn Tactics into a skin over Chronicles real-time/other combat logic.
- Party/member identity and progression must remain stable across mission/reload when persisted.
- 3D party/dungeon assets may be Blender-authored, but gameplay coordinates, collision/selection and ability rules remain data-driven.
- Generated maps/missions must remain reproducible from their run/seed identity and pass topology/reachability checks.
- Visual artifact tests should prove the real Three.js/isometric renderer is present, not a static placeholder.

## 11. Pawn Slug host integration

Pawn Slug gameplay belongs to the Godot project.

- React/frontend host code should launch/embed/orchestrate Godot, not reimplement Pawn Slug movement/combat in parallel.
- Preserve loading/preload behavior so canonical remote sprites do not flash legacy fallbacks while simply downloading.
- R2 logical IDs are stable runtime contracts; immutable object URLs/hashes may change per published asset generation.
- Read `games/pawn-slug-godot/AGENTS.md` and `scripts/art/AGENTS.md` before changing Pawn Slug runtime art integration.

## 12. Visual acceptance

For Home, War Room, Chronicles/Tactics 3D and other visual surfaces:
- produce the repository's review PNG/screenshot artifact;
- inspect it at the intended viewport(s);
- compare against the last accepted baseline;
- verify no horizontal overflow/clipping on relevant mobile widths;
- keep reduced-motion/touch/keyboard behavior usable;
- do not infer visual success from tests alone.
