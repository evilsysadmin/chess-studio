import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_PLATFORM_LAYOUT,
  PAWN_SLUG_SCENARIO_TILEMAPS,
  pawnSlugScenarioBounds,
  pawnSlugScenarioMarkers,
  pawnSlugScenarioPlatforms,
  pawnSlugScenarioTilesByKind,
  pawnSlugTilesForScenario,
} from './pawnSlugTileMaps.js';

describe('Pawn Slug tile maps', () => {
  it('describes premium scenarios as data instead of renderer coordinates', () => {
    const dungeon = PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon;
    const forest = PAWN_SLUG_SCENARIO_TILEMAPS.fallenForest;
    expect(pawnSlugTilesForScenario(dungeon).some((tile) => tile.kind === 'gate')).toBe(true);
    expect(pawnSlugTilesForScenario(dungeon).some((tile) => tile.kind === 'torch')).toBe(true);
    expect(pawnSlugTilesForScenario(forest).some((tile) => tile.kind === 'forest-trunk')).toBe(true);
    expect(pawnSlugTilesForScenario(forest).some((tile) => tile.kind === 'fallen-knight')).toBe(true);
  });

  it('owns physical platform data as part of each scenario contract', () => {
    const dungeonPlatforms = pawnSlugScenarioPlatforms(PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon);
    const forestPlatforms = pawnSlugScenarioPlatforms(PAWN_SLUG_SCENARIO_TILEMAPS.fallenForest);
    expect(dungeonPlatforms).toHaveLength(1);
    expect(dungeonPlatforms[0]).toMatchObject({ id: 'dungeon-catwalk', theme: 'steel', oneWay: true });
    expect(forestPlatforms.map((platform) => platform.id)).toEqual([
      'forest-root-rise',
      'forest-broken-statue',
      'forest-branch-post',
    ]);
    for (const platform of [...dungeonPlatforms, ...forestPlatforms]) expect(PAWN_SLUG_PLATFORM_LAYOUT).toContain(platform);
  });

  it('filters desktop-only scenic tiles on coarse/mobile', () => {
    expect(pawnSlugScenarioTilesByKind(PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon, 'fallen-pawn')).toHaveLength(1);
    expect(pawnSlugScenarioTilesByKind(PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon, 'fallen-pawn', { coarse: true })).toHaveLength(0);
    expect(pawnSlugScenarioTilesByKind(PAWN_SLUG_SCENARIO_TILEMAPS.fallenForest, 'fireflies').length).toBeGreaterThan(0);
    expect(pawnSlugScenarioTilesByKind(PAWN_SLUG_SCENARIO_TILEMAPS.fallenForest, 'fireflies', { coarse: true })).toHaveLength(0);
  });

  it('keeps tile-derived world positions deterministic', () => {
    for (const scenario of Object.values(PAWN_SLUG_SCENARIO_TILEMAPS)) {
      const firstPass = pawnSlugTilesForScenario(scenario).map(({ kind, row, column, x }) => `${kind}:${row}:${column}:${x}`);
      const secondPass = pawnSlugTilesForScenario(scenario).map(({ kind, row, column, x }) => `${kind}:${row}:${column}:${x}`);
      expect(secondPass).toEqual(firstPass);
    }
  });

  it('keeps typed markers inside every scenario bound', () => {
    for (const scenario of Object.values(PAWN_SLUG_SCENARIO_TILEMAPS)) {
      const bounds = pawnSlugScenarioBounds(scenario);
      const markers = pawnSlugScenarioMarkers(scenario);
      expect(bounds.end).toBeGreaterThan(bounds.start);
      expect(markers.some((marker) => marker.kind === 'enemy')).toBe(true);
      expect(markers.some((marker) => marker.kind === 'pickup')).toBe(true);
      expect(markers.some((marker) => marker.kind === 'transition')).toBe(true);
      expect(markers.every((marker) => marker.worldX >= bounds.start && marker.worldX <= bounds.end)).toBe(true);
    }
  });
});
