import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createPawnSlugCastleDungeon,
  createPawnSlugFallenForest,
  createPawnSlugScenarioFromTileMap,
} from './pawnSlugScenarioRenderer.js';
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

  it('renders the fallen forest through the same data-driven renderer', () => {
    const desktop = createPawnSlugFallenForest({ coarse: false });
    const coarse = createPawnSlugFallenForest({ coarse: true });
    expect(desktop.userData.scenarioId).toBe('fallen-forest');
    expect(desktop.userData.dataDriven).toBe(true);
    expect(desktop.getObjectByName('pawn-slug-forest-trunk')).toBeTruthy();
    expect(desktop.getObjectByName('pawn-slug-forest-root')).toBeTruthy();
    expect(desktop.getObjectByName('pawn-slug-forest-fallen-knight')).toBeTruthy();
    expect(desktop.getObjectByName('pawn-slug-forest-fireflies')).toBeTruthy();
    expect(coarse.getObjectByName('pawn-slug-forest-trunk')).toBeTruthy();
    expect(coarse.getObjectByName('pawn-slug-forest-fireflies')).toBeFalsy();
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
