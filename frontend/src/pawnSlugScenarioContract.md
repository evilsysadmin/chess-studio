# Pawn Slug scenario contract

Pawn Slug scenarios are data-driven. Visual layout, physical one-way platforms and typed markers belong to `pawnSlugTileMaps.js`.

`pawnSlugScenarioRenderer.js` renders scenario tiles. `pawnSlugPlatforms.js` owns collision/landing behavior but consumes platform layout exported by the tile-map module, so physics and visuals share one source of truth.

Rules:
- scenario tiles describe scenery;
- `platforms` describe traversable one-way surfaces used by real runtime physics;
- `markers` describe enemies, pickups, transitions and later checkpoints;
- coarse/mobile may trim decoration but must not silently change required gameplay geometry;
- new biomes extend the same contract instead of hardcoding coordinates in Three.js components.
