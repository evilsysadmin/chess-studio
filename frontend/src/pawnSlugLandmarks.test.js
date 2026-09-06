import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PAWN_SLUG_LANDMARK_META,
  createPawnSlugPremiumLandmarks,
} from './pawnSlugLandmarks.js';

describe('Pawn Slug premium landmarks', () => {
  it('keeps three recognizable hero beats distributed across the battlefield', () => {
    expect(PAWN_SLUG_LANDMARK_META.landmarks).toHaveLength(3);
    expect(PAWN_SLUG_LANDMARK_META.landmarks.map((landmark) => landmark.id)).toEqual([
      'command-post',
      'wrecked-searchlight',
      'hero-barricade',
    ]);
    expect(PAWN_SLUG_LANDMARK_META.landmarks[1].x - PAWN_SLUG_LANDMARK_META.landmarks[0].x).toBeGreaterThan(30);
    expect(PAWN_SLUG_LANDMARK_META.landmarks[2].x - PAWN_SLUG_LANDMARK_META.landmarks[1].x).toBeGreaterThan(30);
  });

  it('builds named landmarks without requiring a WebGL renderer', () => {
    const parent = new THREE.Group();
    const root = createPawnSlugPremiumLandmarks(parent);
    expect(parent.children).toContain(root);
    expect(root.name).toBe('pawn-slug-premium-landmarks');
    expect(root.getObjectByName('pawn-slug-landmark-command-post')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-landmark-wrecked-searchlight')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-landmark-hero-barricade')).toBeTruthy();
    expect(root.children).toHaveLength(3);
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
  });
});
