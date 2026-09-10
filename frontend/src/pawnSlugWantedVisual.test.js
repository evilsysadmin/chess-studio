import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_WANTED_VISUAL_META, animatePawnSlugWantedInsignia, decoratePawnSlugWantedModel } from './pawnSlugWantedVisual.js';

describe('Pawn Slug wanted officer visuals', () => {
  it('adds a diegetic rank insignia without adding lights', () => {
    const model = new THREE.Group();
    model.userData.enemyType = 'knight';
    const badge = decoratePawnSlugWantedModel(model, { wanted: true, rank: 2, insignia: 'silver-crossed-pawns' });
    expect(badge?.name).toBe('pawn-slug-wanted-insignia');
    expect(badge?.userData).toMatchObject({ wanted: true, rank: 2, insignia: 'silver-crossed-pawns' });
    expect(model.getObjectByName('pawn-slug-wanted-insignia-disc')).toBeTruthy();
    expect(PAWN_SLUG_WANTED_VISUAL_META.addsLights).toBe(false);
    expect(model.children.some((child) => child.isLight)).toBe(false);
  });

  it('supports a restrained entry pulse and reduced motion', () => {
    const model = new THREE.Group();
    model.userData.enemyType = 'pawn';
    const badge = decoratePawnSlugWantedModel(model, { wanted: true, rank: 1, insignia: 'red-knight-tab' });
    animatePawnSlugWantedInsignia(badge, 0.3);
    expect(badge.scale.x).toBeGreaterThan(0.7);

    const reducedModel = new THREE.Group();
    reducedModel.userData.enemyType = 'rook';
    const reducedBadge = decoratePawnSlugWantedModel(reducedModel, { wanted: true, rank: 3, insignia: 'gold-rook-chevron' }, { reducedMotion: true });
    animatePawnSlugWantedInsignia(reducedBadge, 1);
    expect(reducedBadge.scale.x).toBe(1);
    expect(reducedBadge.rotation.z).toBe(0);
  });

  it('does nothing for ordinary soldiers', () => {
    expect(decoratePawnSlugWantedModel(new THREE.Group(), null)).toBeNull();
  });
});
