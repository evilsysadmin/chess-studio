import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_SCENARIO_TILEMAPS,
  pawnSlugMarkerLegacyX,
  pawnSlugScenarioBounds,
  pawnSlugScenarioMarkers,
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

  it('carries typed gameplay markers alongside visual tiles', () => {
    const scenario = PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon;
    expect(pawnSlugScenarioMarkers(scenario, 'enemy').map((marker) => marker.type)).toEqual(['knight', 'pawn']);
    expect(pawnSlugScenarioMarkers(scenario, 'pickup').map((marker) => marker.type)).toEqual(['grenade']);
    expect(pawnSlugScenarioMarkers(scenario, 'transition')).toHaveLength(1);
  });

  it('converts scenario world coordinates back to the legacy gameplay coordinate system exactly', () => {
    const scenario = PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon;
    const [grenade] = pawnSlugScenarioMarkers(scenario, 'pickup');
    const enemies = pawnSlugScenarioMarkers(scenario, 'enemy');
    expect(pawnSlugMarkerLegacyX(grenade)).toBe(1810);
    expect(enemies.map(pawnSlugMarkerLegacyX)).toEqual([1940, 2110]);
  });

  it('exposes deterministic scenario bounds for streaming and transitions', () => {
    const bounds = pawnSlugScenarioBounds(PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon);
    expect(bounds.start).toBe(44.5);
    expect(bounds.end).toBe(54.5);
    expect(Object.isFrozen(bounds)).toBe(true);
  });
});
