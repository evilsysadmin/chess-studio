import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PAWN_SLUG_LANDMARK_META,
  createPawnSlugPremiumLandmarks,
} from './pawnSlugLandmarks.js';
import { PAWN_SLUG_STATIC_INSTANCE_VERSION } from './pawnSlugStaticInstances.js';

describe('Pawn Slug premium landmarks', () => {
  it('keeps recognizable hero beats distributed across the battlefield and ends in a boss fortress', () => {
    expect(PAWN_SLUG_LANDMARK_META.landmarks).toHaveLength(5);
    expect(PAWN_SLUG_LANDMARK_META.landmarks.map((landmark) => landmark.id)).toEqual([
      'command-post',
      'dungeon-gate',
      'wrecked-searchlight',
      'hero-barricade',
      'boss-fortress',
    ]);
    expect(PAWN_SLUG_LANDMARK_META.landmarks[1].x).toBeGreaterThan(PAWN_SLUG_LANDMARK_META.landmarks[0].x);
    expect(PAWN_SLUG_LANDMARK_META.landmarks[2].x).toBeGreaterThan(PAWN_SLUG_LANDMARK_META.landmarks[1].x);
    expect(PAWN_SLUG_LANDMARK_META.landmarks[3].x - PAWN_SLUG_LANDMARK_META.landmarks[2].x).toBeGreaterThan(30);
    expect(PAWN_SLUG_LANDMARK_META.landmarks[4].x).toBe(114.5);
  });

  it('builds named landmarks without requiring a WebGL renderer', () => {
    const parent = new THREE.Group();
    const root = createPawnSlugPremiumLandmarks(parent);
    expect(parent.children).toContain(root);
    expect(root.name).toBe('pawn-slug-premium-landmarks');
    expect(root.getObjectByName('pawn-slug-landmark-command-post')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-landmark-dungeon-gate')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-landmark-wrecked-searchlight')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-landmark-hero-barricade')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-landmark-boss-fortress')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-dungeon-arch')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-dungeon-chain')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-dungeon-drain')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-dungeon-depth-shadow')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-boss-fortress-arch')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-barricade-hedgehog')).toBeTruthy();
    expect(root.children).toHaveLength(5);
  });

  it('marks the dungeon slice as a canonical premium scenario beat with real scenic span', () => {
    const desktop = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: false });
    const coarse = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: true });
    const desktopDungeon = desktop.getObjectByName('pawn-slug-landmark-dungeon-gate');
    const coarseDungeon = coarse.getObjectByName('pawn-slug-landmark-dungeon-gate');
    expect(desktopDungeon.userData.premiumScenario).toBe('castle-dungeon');
    expect(desktopDungeon.userData.scenarioSpan).toBeGreaterThan(coarseDungeon.userData.scenarioSpan);
    expect(desktopDungeon.position.x).toBe(48.5);
  });

  it('marks the fortress as the real boss arena rather than a decorative wallpaper', () => {
    const root = createPawnSlugPremiumLandmarks(new THREE.Group());
    const fortress = root.getObjectByName('pawn-slug-landmark-boss-fortress');
    expect(fortress.userData.bossArena).toBe(true);
    expect(fortress.userData.bossWorldX).toBe(114.5);
  });

  it('uses a tiny shadow-free local-light budget on desktop only', () => {
    const desktop = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: false });
    const coarse = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: true });
    const lights = (root) => {
      const found = [];
      root.traverse((node) => { if (node.isLight) found.push(node); });
      return found;
    };

    const desktopLights = lights(desktop);
    expect(desktopLights).toHaveLength(PAWN_SLUG_LANDMARK_META.desktopLocalLightBudget);
    expect(desktopLights.every((light) => light.castShadow === false)).toBe(true);
    expect(desktop.getObjectByName('pawn-slug-command-post-light')).toBeTruthy();
    expect(desktop.getObjectByName('pawn-slug-searchlight-glow')).toBeTruthy();
    expect(desktop.getObjectByName('pawn-slug-boss-fortress-left-fire')).toBeTruthy();
    expect(desktop.getObjectByName('pawn-slug-boss-fortress-right-fire')).toBeTruthy();
    expect(lights(coarse)).toHaveLength(PAWN_SLUG_LANDMARK_META.coarseLocalLightBudget);
  });

  it('keeps coarse/mobile landmarks but trims decorative geometry', () => {
    const desktop = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: false });
    const coarse = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: true });
    const countMeshes = (root) => {
      let count = 0;
      root.traverse((node) => { if (node.isMesh) count += 1; });
      return count;
    };
    expect(countMeshes(coarse)).toBeLessThan(countMeshes(desktop));
    expect(coarse.children).toHaveLength(desktop.children.length);
    expect(coarse.getObjectByName('pawn-slug-barricade-hedgehog')).toBeFalsy();
    expect(coarse.getObjectByName('pawn-slug-dungeon-fallen-pawn')).toBeFalsy();
    expect(coarse.getObjectByName('pawn-slug-dungeon-depth-shadow')).toBeFalsy();
    expect(coarse.getObjectByName('pawn-slug-landmark-dungeon-gate')).toBeTruthy();
    expect(coarse.getObjectByName('pawn-slug-landmark-boss-fortress')).toBeTruthy();
  });

  it('batches repeated landmark geometry into stable instanced draw meshes', () => {
    const desktop = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: false });
    const coarse = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: true });
    const batchedInstances = (root) => {
      let count = 0;
      root.traverse((node) => {
        if (node.isInstancedMesh) {
          expect(node.userData.pawnSlugStaticInstances).toBe(PAWN_SLUG_STATIC_INSTANCE_VERSION);
          count += node.count;
        }
      });
      return count;
    };

    expect(PAWN_SLUG_LANDMARK_META.staticBatching).toBe(PAWN_SLUG_STATIC_INSTANCE_VERSION);
    expect(batchedInstances(desktop)).toBe(PAWN_SLUG_LANDMARK_META.desktopBatchedInstances);
    expect(batchedInstances(coarse)).toBe(PAWN_SLUG_LANDMARK_META.coarseBatchedInstances);
    expect(desktop.getObjectByName('pawn-slug-hero-barricade-sandbags-instanced')).toBeTruthy();
    expect(desktop.getObjectByName('pawn-slug-barricade-hedgehog-beams-instanced')).toBeTruthy();
  });
});
