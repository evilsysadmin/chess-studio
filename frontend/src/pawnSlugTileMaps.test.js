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
    const ruins = PAWN_SLUG_SCENARIO_TILEMAPS.gambitRuins;
    expect(pawnSlugTilesForScenario(dungeon).some((tile) => tile.kind === 'gate')).toBe(true);
    expect(pawnSlugTilesForScenario(forest).some((tile) => tile.kind === 'forest-trunk')).toBe(true);
    expect(pawnSlugTilesForScenario(ruins).some((tile) => tile.kind === 'ruin-column')).toBe(true);
    expect(pawnSlugTilesForScenario(ruins).some((tile) => tile.kind === 'broken-rook')).toBe(true);
  });

  it('owns physical platform data as part of each scenario contract', () => {
    const dungeonPlatforms = pawnSlugScenarioPlatforms(PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon);
    const forestPlatforms = pawnSlugScenarioPlatforms(PAWN_SLUG_SCENARIO_TILEMAPS.fallenForest);
    const ruinsPlatforms = pawnSlugScenarioPlatforms(PAWN_SLUG_SCENARIO_TILEMAPS.gambitRuins);
    expect(dungeonPlatforms[0]).toMatchObject({ id: 'dungeon-catwalk', oneWay: true });
    expect(forestPlatforms.map((platform) => platform.id)).toEqual([
      'forest-root-rise', 'forest-broken-statue', 'forest-branch-post',
    ]);
    expect(ruinsPlatforms.map((platform) => platform.id)).toEqual([
      'ruins-shattered-bridge', 'ruins-high-arcade',
    ]);
    for (const platform of [...forestPlatforms, ...ruinsPlatforms, ...dungeonPlatforms]) {
      expect(PAWN_SLUG_PLATFORM_LAYOUT).toContain(platform);
    }
  });

  it('keeps one atmosphere marker on coarse while still trimming desktop-only props', () => {
    const forestDesktop = pawnSlugScenarioTilesByKind(PAWN_SLUG_SCENARIO_TILEMAPS.fallenForest, 'fireflies');
    const forestCoarse = pawnSlugScenarioTilesByKind(PAWN_SLUG_SCENARIO_TILEMAPS.fallenForest, 'fireflies', { coarse: true });
    const ruinsDesktop = pawnSlugScenarioTilesByKind(PAWN_SLUG_SCENARIO_TILEMAPS.gambitRuins, 'dust');
    const ruinsCoarse = pawnSlugScenarioTilesByKind(PAWN_SLUG_SCENARIO_TILEMAPS.gambitRuins, 'dust', { coarse: true });

    expect(pawnSlugScenarioTilesByKind(PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon, 'fallen-pawn', { coarse: true })).toHaveLength(0);
    expect(forestDesktop.length).toBeGreaterThan(1);
    expect(forestCoarse).toHaveLength(1);
    expect(ruinsDesktop.length).toBeGreaterThan(1);
    expect(ruinsCoarse).toHaveLength(1);
    expect(forestCoarse[0].coarseLimit).toBe(1);
    expect(ruinsCoarse[0].coarseLimit).toBe(1);
  });

  it('keeps typed coarse limits generic for future atmosphere tiles', () => {
    const scenario = {
      originX: 0,
      tileWorldSize: 1,
      rows: ['***'],
    };
    expect(pawnSlugScenarioTilesByKind(scenario, 'fireflies')).toHaveLength(3);
    expect(pawnSlugScenarioTilesByKind(scenario, 'fireflies', { coarse: true })).toHaveLength(1);
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