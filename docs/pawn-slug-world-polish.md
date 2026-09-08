# Pawn Slug · World polish, pacing and mobile

Tracking PR for the environment/performance batch after platforming and combat feel.

## Scope
- Living battlefield: moving smoke, animated fire, searchlights, ash/dust and restrained parallax depth.
- Lightweight reactive/destructible props such as crates, lamps, sandbags, small barriers and debris.
- Mission pacing review: advance → skirmish → breather → set piece → mid-boss → boss; avoid dead stretches and face-spawns.
- Spawn placement aware of platforms and vertical routes.
- Stronger sound design for footsteps, landings, weapon classes, metal/stone impacts, explosions and boss ambience/music transition.
- Mobile control pass: spacing, multitouch combinations, touch-safe UI and reduced visual obstruction.
- Performance pass: pooling hot objects where worthwhile, allocation reduction, light/particle budgets, coarse-mode LOD and overdraw limits.
- Readability audit after zoom-out: projectiles, pickups, silhouettes and muzzle flashes must stay legible.
- Focused mobile/Pawn Slug browser smoke and CI iteration before ready-for-review.
