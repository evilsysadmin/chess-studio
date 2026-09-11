import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildWarRoom } from './Board3DScene.js';
import { buildPremiumWarRoomLayer, buildPremiumTableLayer } from './PremiumWarRoomScene.js';

const THEME = Object.freeze({
  felt: 0x173943,
  glow: 0xc5963f,
  frame: 0x2a160d,
  light: 0xd8c9a7,
  dark: 0x49372c,
});

// Baseline measured in CI on 2026-09-11:
// desktop 760 objects / 717 meshes / 6 lights / 297 materials / 697 geometries / 10 hooks
// mobile  377 objects / 342 meshes / 7 lights / 165 materials / 342 geometries / 3 hooks
// Keep only modest headroom. A meaningful scene-graph expansion must therefore
// be accompanied by an explicit budget decision rather than silently accreting.
const BUDGETS = Object.freeze({
  desktop: Object.freeze({
    objects: 815,
    meshes: 770,
    lights: 8,
    materials: 320,
    geometries: 750,
    renderHooks: 16,
  }),
  mobile: Object.freeze({
    objects: 405,
    meshes: 370,
    lights: 9,
    materials: 180,
    geometries: 370,
    renderHooks: 8,
  }),
});

function ownsFunction(object, key) {
  return Boolean(object)
    && Object.prototype.hasOwnProperty.call(object, key)
    && typeof object[key] === 'function';
}

function censusScene(root) {
  const materials = new Set();
  const geometries = new Set();
  const census = {
    objects: 0,
    meshes: 0,
    instancedMeshes: 0,
    instances: 0,
    lights: 0,
    materials: 0,
    geometries: 0,
    renderHooks: 0,
  };

  root.traverse((object) => {
    census.objects += 1;
    if (object.isMesh) census.meshes += 1;
    if (object.isInstancedMesh) {
      census.instancedMeshes += 1;
      census.instances += Math.max(0, Number(object.count) || 0);
    }
    if (object.isLight) census.lights += 1;
    if (ownsFunction(object, 'onBeforeRender')) census.renderHooks += 1;
    if (ownsFunction(object, 'onAfterRender')) census.renderHooks += 1;
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) if (material) materials.add(material);
  });

  census.materials = materials.size;
  census.geometries = geometries.size;
  return census;
}

function budgetIssues(census, profile) {
  const budget = BUDGETS[profile];
  return ['objects', 'meshes', 'lights', 'materials', 'geometries', 'renderHooks']
    .flatMap((key) => census[key] > budget[key] ? [`${key}: ${census[key]} > ${budget[key]}`] : []);
}

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
  ])('%s canonical decor stays below measured complexity caps', (profile, coarsePointer) => {
    const scene = canonicalScene(coarsePointer);
    const census = censusScene(scene);

    expect(census.objects).toBeGreaterThan(100);
    expect(census.meshes).toBeGreaterThan(80);
    expect(census.lights).toBeGreaterThan(0);
    expect(budgetIssues(census, profile), JSON.stringify({ census, budget: BUDGETS[profile] })).toEqual([]);

    dispose(scene);
  });

  it('reports every over-budget dimension instead of silently accepting scene inflation', () => {
    expect(budgetIssues({
      objects: 816,
      meshes: 771,
      lights: 9,
      materials: 321,
      geometries: 751,
      renderHooks: 17,
    }, 'desktop')).toEqual([
      'objects: 816 > 815',
      'meshes: 771 > 770',
      'lights: 9 > 8',
      'materials: 321 > 320',
      'geometries: 751 > 750',
      'renderHooks: 17 > 16',
    ]);
  });
});
