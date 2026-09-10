import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PAWN_SLUG_LANDMARK_META,
  createPawnSlugPremiumLandmarks,
} from './pawnSlugLandmarks.js';
import { PAWN_SLUG_STATIC_INSTANCE_VERSION } from './pawnSlugStaticInstances.js';

describe('Pawn Slug premium landmarks', () => {
  it('keeps recognizable premium scenario beats distributed across the battlefield', () => {
    expect(PAWN_SLUG_LANDMARK_META.landmarks.map((landmark) => landmark.id)).toEqual([
      'fallen-forest',
      'command-post',
      'gambit-ruins',
      'dungeon-gate',
      'wrecked-searchlight',
      'hero-barricade',
      'boss-fortress',
    ]);
    expect(PAWN_SLUG_LANDMARK_META.landmarks[0].x).toBe(10.5);
    expect(PAWN_SLUG_LANDMARK_META.landmarks.at(-1).x).toBe(114.5);
  });

  it('builds premium biomes through the shared data-driven scenario renderer', () => {
    const root = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: false });
    const forest = root.getObjectByName('pawn-slug-landmark-fallen-forest');
    const ruins = root.getObjectByName('pawn-slug-landmark-gambit-ruins');
    const dungeon = root.getObjectByName('pawn-slug-landmark-dungeon-gate');
    for (const scenario of [forest, ruins, dungeon]) {
      expect(scenario.userData.scenarioSource).toBe('tile-map');
      expect(scenario.userData.dataDriven).toBe(true);
    }
    expect(forest.userData.premiumScenario).toBe('fallen-forest');
    expect(ruins.userData.premiumScenario).toBe('gambit-ruins');
    expect(dungeon.userData.premiumScenario).toBe('castle-dungeon');
    expect(root.getObjectByName('pawn-slug-forest-trunk')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-ruins-column')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-ruins-broken-rook')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-ruins-dust')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-dungeon-arch')).toBeTruthy();
  });

  it('keeps the boss fortress as a real arena marker', () => {
    const root = createPawnSlugPremiumLandmarks(new THREE.Group());
    const fortress = root.getObjectByName('pawn-slug-landmark-boss-fortress');
    expect(fortress.userData.bossArena).toBe(true);
    expect(fortress.userData.bossWorldX).toBe(114.5);
  });

  it('uses only the existing shadow-free local light budget', () => {
    const desktop = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: false });
    const coarse = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: true });
    const lights = (root) => {
      const found = [];
      root.traverse((node) => { if (node.isLight) found.push(node); });
      return found;
    };
    expect(lights(desktop)).toHaveLength(PAWN_SLUG_LANDMARK_META.desktopLocalLightBudget);
    expect(lights(desktop).every((light) => light.castShadow === false)).toBe(true);
    expect(lights(coarse)).toHaveLength(PAWN_SLUG_LANDMARK_META.coarseLocalLightBudget);
  });

  it('degrades atmosphere on coarse/mobile without removing scenario structure', () => {
    const desktop = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: false });
    const coarse = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: true });
    const meshCount = (root) => {
      let count = 0;
      root.traverse((node) => { if (node.isMesh) count += 1; });
      return count;
    };
    expect(meshCount(coarse)).toBeLessThan(meshCount(desktop));
    expect(coarse.getObjectByName('pawn-slug-landmark-fallen-forest')).toBeTruthy();
    expect(coarse.getObjectByName('pawn-slug-forest-fireflies')).toBeFalsy();
    expect(coarse.getObjectByName('pawn-slug-landmark-gambit-ruins')).toBeTruthy();
    expect(coarse.getObjectByName('pawn-slug-ruins-column')).toBeTruthy();
    expect(coarse.getObjectByName('pawn-slug-ruins-dust')).toBeFalsy();
    expect(coarse.getObjectByName('pawn-slug-landmark-dungeon-gate')).toBeTruthy();
    expect(coarse.getObjectByName('pawn-slug-dungeon-fallen-pawn')).toBeFalsy();
  });

  it('still batches repeated non-scenario landmark geometry', () => {
    const root = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: false });
    const batches = [];
    root.traverse((node) => {
      if (node.isInstancedMesh) {
        expect(node.userData.pawnSlugStaticInstances).toBe(PAWN_SLUG_STATIC_INSTANCE_VERSION);
        batches.push(node);
      }
    });
    expect(batches.length).toBeGreaterThan(0);
    expect(root.getObjectByName('pawn-slug-command-post-sandbags-instanced')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-hero-barricade-sandbags-instanced')).toBeTruthy();
  });
});
