import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPawnSlugCastleDungeon, createPawnSlugScenarioFromTileMap } from './pawnSlugScenarioRenderer.js';
import { PAWN_SLUG_SCENARIO_TILEMAPS } from './pawnSlugTileMaps.js';

describe('Pawn Slug scenario renderer', () => {
  it('renders the castle dungeon directly from its tile map', () => {
    const root = createPawnSlugCastleDungeon({ coarse: false });
    expect(root).toBeInstanceOf(THREE.Group);
    expect(root.userData.scenarioId).toBe('castle-dungeon');
    expect(root.userData.dataDriven).toBe(true);
    expect(root.getObjectByName('pawn-slug-dungeon-arch')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-dungeon-chain')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-dungeon-fallen-pawn')).toBeTruthy();
  });

  it('uses the same renderer contract for arbitrary scenario data', () => {
    const root = createPawnSlugScenarioFromTileMap(PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon, { coarse: true });
    expect(root.userData.dataDriven).toBe(true);
    expect(root.getObjectByName('pawn-slug-dungeon-fallen-pawn')).toBeFalsy();
    expect(root.getObjectByName('pawn-slug-dungeon-depth-shadow')).toBeFalsy();
  });

  it('fails fast when a renderer is called without scenario data', () => {
    expect(() => createPawnSlugScenarioFromTileMap(null)).toThrow(/tile map/i);
  });
});
