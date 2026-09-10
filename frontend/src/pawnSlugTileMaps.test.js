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
  it('describes the castle dungeon as data instead of renderer coordinates', () => {
    const scenario = PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon;
    const tiles = pawnSlugTilesForScenario(scenario);
    expect(scenario.id).toBe('castle-dungeon');
    expect(scenario.rows).toHaveLength(5);
    expect(tiles.some((tile) => tile.kind === 'gate')).toBe(true);
    expect(tiles.some((tile) => tile.kind === 'torch')).toBe(true);
    expect(tiles.some((tile) => tile.kind === 'wall-rib')).toBe(true);
    expect(tiles.some((tile) => tile.kind === 'ceiling-rib')).toBe(true);
  });

  it('owns physical platform data as part of the scenario contract', () => {
    const scenario = PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon;
    const platforms = pawnSlugScenarioPlatforms(scenario);
    expect(platforms).toHaveLength(1);
    expect(platforms[0]).toMatchObject({ id: 'dungeon-catwalk', theme: 'steel', oneWay: true });
    expect(PAWN_SLUG_PLATFORM_LAYOUT).toContain(platforms[0]);
  });

  it('filters desktop-only scenic tiles on coarse/mobile', () => {
    const scenario = PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon;
    expect(pawnSlugScenarioTilesByKind(scenario, 'fallen-pawn')).toHaveLength(1);
    expect(pawnSlugScenarioTilesByKind(scenario, 'fallen-pawn', { coarse: true })).toHaveLength(0);
  });

  it('keeps tile-derived world positions monotonic and deterministic', () => {
    const scenario = PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon;
    const ground = pawnSlugScenarioTilesByKind(scenario, 'drain');
    const firstPass = pawnSlugTilesForScenario(scenario).map(({ kind, row, column, x }) => `${kind}:${row}:${column}:${x}`);
    const secondPass = pawnSlugTilesForScenario(scenario).map(({ kind, row, column, x }) => `${kind}:${row}:${column}:${x}`);
    expect(ground.length).toBeGreaterThan(4);
    expect(ground.map((tile) => tile.x)).toEqual([...ground].sort((a, b) => a.x - b.x).map((tile) => tile.x));
    expect(secondPass).toEqual(firstPass);
  });

  it('keeps typed markers and bounds inside the dungeon scenario', () => {
    const scenario = PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon;
    const bounds = pawnSlugScenarioBounds(scenario);
    const markers = pawnSlugScenarioMarkers(scenario);
    expect(bounds.start).toBe(44.5);
    expect(bounds.end).toBeGreaterThan(bounds.start);
    expect(markers.some((marker) => marker.kind === 'enemy')).toBe(true);
    expect(markers.some((marker) => marker.kind === 'pickup')).toBe(true);
    expect(markers.some((marker) => marker.kind === 'transition')).toBe(true);
    expect(markers.every((marker) => marker.worldX >= bounds.start && marker.worldX <= bounds.end)).toBe(true);
  });
});
