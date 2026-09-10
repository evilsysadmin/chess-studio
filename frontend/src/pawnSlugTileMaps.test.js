import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_SCENARIO_TILEMAPS,
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

  it('filters desktop-only scenic tiles on coarse/mobile', () => {
    const scenario = PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon;
    expect(pawnSlugScenarioTilesByKind(scenario, 'fallen-pawn')).toHaveLength(1);
    expect(pawnSlugScenarioTilesByKind(scenario, 'fallen-pawn', { coarse: true })).toHaveLength(0);
  });

  it('keeps tile-derived world positions monotonic and deterministic', () => {
    const scenario = PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon;
    const ground = pawnSlugScenarioTilesByKind(scenario, 'drain');
    expect(ground.length).toBeGreaterThan(4);
    expect(ground.map((tile) => tile.x)).toEqual([...ground].sort((a, b) => a.x - b.x).map((tile) => tile.x));
    expect(pawnSlugTilesForScenario(scenario)).toEqual(pawnSlugTilesForScenario(scenario));
  });
});
