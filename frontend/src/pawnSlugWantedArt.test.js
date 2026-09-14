import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  PAWN_SLUG_WANTED_ART_META,
  animatePawnSlugWantedInsignia,
  attachPawnSlugWantedInsignia,
} from './pawnSlugWantedArt.js';

describe('Pawn Slug wanted officer insignia art', () => {
  it('attaches rank-specific physical insignia without extra lights', () => {
    const model = new THREE.Group();
    const officer = { wanted: true, rank: 3, insignia: 'gold-rook-chevron' };
    const badge = attachPawnSlugWantedInsignia(model, officer);

    expect(badge).not.toBeNull();
    expect(badge.name).toBe('pawn-slug-wanted-rank-3');
    expect(badge.userData.insignia).toBe('gold-rook-chevron');
    expect(model.userData.wantedOfficer).toBe(officer);
    expect(model.children.filter((child) => child.isLight)).toHaveLength(0);
    expect(PAWN_SLUG_WANTED_ART_META.extraLights).toBe(false);
  });

  it('uses only a brief entrance pulse and respects reduced motion', () => {
    const animated = new THREE.Group();
    const officer = { wanted: true, rank: 2, insignia: 'silver-crossed-pawns' };
    const badge = attachPawnSlugWantedInsignia(animated, officer);
    animatePawnSlugWantedInsignia(animated, 10);
    expect(badge.scale.x).toBeGreaterThan(1);
    animatePawnSlugWantedInsignia(animated, 11);
    expect(badge.scale.x).toBeCloseTo(1, 5);
    expect(badge.userData.settled).toBe(true);

    const reduced = new THREE.Group();
    const reducedBadge = attachPawnSlugWantedInsignia(reduced, officer, { reducedMotion: true });
    animatePawnSlugWantedInsignia(reduced, 10);
    expect(reducedBadge.scale.x).toBe(1);
    expect(reducedBadge.material.emissiveIntensity).toBeCloseTo(0.28, 5);
    expect(reducedBadge.userData.settled).toBe(true);
  });

  it('uses a cached badge reference and early-returns once the entrance has settled', () => {
    const model = new THREE.Group();
    const officer = { wanted: true, rank: 1, insignia: 'red-tab' };
    const badge = attachPawnSlugWantedInsignia(model, officer);
    const find = vi.spyOn(model.children, 'find');

    animatePawnSlugWantedInsignia(model, 4);
    animatePawnSlugWantedInsignia(model, 5);
    const settledScale = badge.scale.x;
    const settledEmissive = badge.material.emissiveIntensity;
    animatePawnSlugWantedInsignia(model, 6);
    animatePawnSlugWantedInsignia(model, 7);

    expect(find).not.toHaveBeenCalled();
    expect(badge.userData.settled).toBe(true);
    expect(badge.scale.x).toBe(settledScale);
    expect(badge.material.emissiveIntensity).toBe(settledEmissive);
    expect(PAWN_SLUG_WANTED_ART_META.runtimeLookup).toBe('weakmap');
    expect(PAWN_SLUG_WANTED_ART_META.settledCost).toBe('early-return');
  });

  it('does nothing for ordinary enemies', () => {
    const model = new THREE.Group();
    expect(attachPawnSlugWantedInsignia(model, null)).toBeNull();
    expect(model.children).toHaveLength(0);
    expect(() => animatePawnSlugWantedInsignia(model, 1)).not.toThrow();
  });
});
