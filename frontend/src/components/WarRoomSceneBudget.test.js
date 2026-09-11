import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildWarRoom } from './Board3DScene.js';
import { buildPremiumWarRoomLayer, buildPremiumTableLayer } from './PremiumWarRoomScene.js';
import { censusWarRoomScene, WAR_ROOM_SCENE_BUDGETS, warRoomSceneBudgetIssues } from './WarRoomSceneBudget.js';

const THEME = Object.freeze({
  felt: 0x173943,
  glow: 0xc5963f,
  frame: 0x2a160d,
  light: 0xd8c9a7,
  dark: 0x49372c,
});

function canonicalScene(coarsePointer = false) {
  const scene = new THREE.Scene();
  scene.add(buildWarRoom(THEME, true, coarsePointer));
  scene.add(buildPremiumWarRoomLayer(THEME, true, coarsePointer));
  scene.add(buildPremiumTableLayer(THEME, coarsePointer));
  return scene;
}

function dispose(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      material.dispose?.();
    }
  });
}

describe('War Room scene graph budget ratchet', () => {
  it.each([
    ['desktop', false],
    ['mobile', true],
  ])('%s canonical decor stays below hard complexity caps', (profile, coarsePointer) => {
    const scene = canonicalScene(coarsePointer);
    const census = censusWarRoomScene(scene);

    expect(census.objects).toBeGreaterThan(100);
    expect(census.meshes).toBeGreaterThan(80);
    expect(census.lights).toBeGreaterThan(0);
    expect(warRoomSceneBudgetIssues(census, profile), JSON.stringify({ census, budget: WAR_ROOM_SCENE_BUDGETS[profile] })).toEqual([]);

    dispose(scene);
  });

  it('reports every over-budget dimension instead of silently accepting scene inflation', () => {
    expect(warRoomSceneBudgetIssues({
      objects: 701,
      meshes: 501,
      lights: 9,
      materials: 281,
      geometries: 421,
      renderHooks: 49,
    }, 'desktop')).toEqual([
      'objects: 701 > 700',
      'meshes: 501 > 500',
      'lights: 9 > 8',
      'materials: 281 > 280',
      'geometries: 421 > 420',
      'renderHooks: 49 > 48',
    ]);
  });
});
