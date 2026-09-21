# Pawn Slug scenario contract

Pawn Slug stages are data-driven. The canonical runtime geometry lives in
`games/pawn-slug-godot/maps/*.json`; rendering and physics consume the same
authored values so a visible route must also be a real playable route.

Rules:
- `platforms` are real traversable surfaces; `one_way` platforms may be crossed from below;
- `ladders` define vertical traversal lanes. They must reach the authored floor and terminate at a usable upper route;
- `pits` remove the corresponding floor collision segment. They are hazards, not painted decoration, and falling below the stage kill plane costs a life;
- `obstacles`, `setpieces`, enemies and pickups must stay clear of required traversal space;
- checkpoints must remain safely separated from pits so reload/respawn cannot immediately kill Matthias;
- coarse/mobile may trim decoration, but required gameplay geometry (platforms, ladders and pits) must not silently change;
- each biome should use the same contract while varying traversal rhythm and visual treatment rather than hardcoding one-off physics in scene code.

The manifest gate validates traversal density and basic ladder/pit safety. Godot
headless smoke tests own the deeper movement/collision behavior.
