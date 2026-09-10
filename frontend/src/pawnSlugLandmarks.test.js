import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PAWN_SLUG_LANDMARK_META,
  createPawnSlugPremiumLandmarks,
} from './pawnSlugLandmarks.js';
import { PAWN_SLUG_STATIC_INSTANCE_VERSION } from './pawnSlugStaticInstances.js';

describe('Pawn Slug premium landmarks', () => {
  it('keeps recognizable hero beats distributed across the battlefield and ends in a boss fortress', () => {
    expect(PAWN_SLUG_LANDMARK_META.landmarks.map((landmark) => landmark.id)).toEqual([
      'command-post',
      'dungeon-gate',
      'wrecked-searchlight',
      'hero-barricade',
      'boss-fortress',
    ]);
    expect(PAWN_SLUG_LANDMARK_META.landmarks.at(-1).x).toBe(114.5);
  });

  it('builds the dungeon through the data-driven scenario renderer', () => {
    const root = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: false });
    const dungeon = root.getObjectByName('pawn-slug-landmark-dungeon-gate');
    expect(dungeon).toBeTruthy();
    expect(dungeon.userData.premiumScenario).toBe('castle-dungeon');
    expect(dungeon.userData.scenarioSource).toBe('tile-map');
    expect(dungeon.userData.dataDriven).toBe(true);
    expect(root.getObjectByName('pawn-slug-dungeon-arch')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-dungeon-chain')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-dungeon-depth-shadow')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-dungeon-fallen-pawn')).toBeTruthy();
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

  it('degrades decorative geometry on coarse/mobile without removing the scenario', () => {
    const desktop = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: false });
    const coarse = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: true });
    const meshCount = (root) => {
      let count = 0;
      root.traverse((node) => { if (node.isMesh) count += 1; });
      return count;
    };
    expect(meshCount(coarse)).toBeLessThan(meshCount(desktop));
    expect(coarse.getObjectByName('pawn-slug-landmark-dungeon-gate')).toBeTruthy();
    expect(coarse.getObjectByName('pawn-slug-dungeon-fallen-pawn')).toBeFalsy();
    expect(coarse.getObjectByName('pawn-slug-dungeon-depth-shadow')).toBeFalsy();
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
