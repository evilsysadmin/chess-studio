import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_POWS } from './pawnSlugPows.js';
import {
  PAWN_SLUG_POW_ART_META,
  animatePawnSlugPowModel,
  createPawnSlugPowModel,
  pawnSlugPowRescueRise,
} from './pawnSlugPowArt.js';

describe('Pawn Slug POW art', () => {
  it('builds a physical rescueable model for every configured POW', () => {
    for (const pow of PAWN_SLUG_POWS) {
      const model = createPawnSlugPowModel(pow);
      expect(model.name).toBe(`pawn-slug-pow-${pow.id}`);
      expect(model.userData).toMatchObject({ pawnSlugPow: true, powId: pow.id, pose: pow.pose, rescued: false });
      expect(model.userData.rescueRadius).toBeGreaterThan(0.7);
      expect(model.getObjectByName('pawn-slug-pow-body')).toBeTruthy();
      expect(model.getObjectByName('pawn-slug-pow-rescue-marker')).toBeTruthy();
      expect(model.getObjectByName('pawn-slug-pow-release-flash')).toBeTruthy();
      if (pow.pose === 'caged') expect(model.getObjectByName('pawn-slug-pow-cage')).toBeTruthy();
      else expect(model.getObjectByName('pawn-slug-pow-chains')).toBeTruthy();
    }
  });

  it('visibly breaks captivity and flashes when the prisoner is rescued', () => {
    const cagedPow = PAWN_SLUG_POWS.find((pow) => pow.pose === 'caged') || PAWN_SLUG_POWS[0];
    const model = createPawnSlugPowModel(cagedPow);
    animatePawnSlugPowModel(model, 1, { rescued: false });
    animatePawnSlugPowModel(model, 1.1, { rescued: true });
    expect(model.userData.rescued).toBe(true);
    expect(model.getObjectByName('pawn-slug-pow-rescue-marker').visible).toBe(false);
    const restraint = model.getObjectByName('pawn-slug-pow-cage') || model.getObjectByName('pawn-slug-pow-chains');
    expect(restraint.visible).toBe(false);
    expect(model.getObjectByName('pawn-slug-pow-release-flash').visible).toBe(true);
    animatePawnSlugPowModel(model, 1.7, { rescued: true });
    expect(model.getObjectByName('pawn-slug-pow-release-flash').visible).toBe(false);
  });

  it('makes rescue rise depend on elapsed time rather than render-frame count', () => {
    expect(pawnSlugPowRescueRise(0)).toBe(0);
    expect(pawnSlugPowRescueRise(PAWN_SLUG_POW_ART_META.rescueRiseSeconds)).toBeCloseTo(PAWN_SLUG_POW_ART_META.rescueRiseHeight, 6);

    const sparse = createPawnSlugPowModel(PAWN_SLUG_POWS[0]);
    const dense = createPawnSlugPowModel(PAWN_SLUG_POWS[0]);
    animatePawnSlugPowModel(sparse, 4, { rescued: true });
    animatePawnSlugPowModel(dense, 4, { rescued: true });

    animatePawnSlugPowModel(sparse, 4.11, { rescued: true });
    for (const time of [4.02, 4.04, 4.06, 4.08, 4.1, 4.11]) {
      animatePawnSlugPowModel(dense, time, { rescued: true });
    }

    const sparseY = sparse.getObjectByName('pawn-slug-pow-body').position.y;
    const denseY = dense.getObjectByName('pawn-slug-pow-body').position.y;
    expect(sparseY).toBeCloseTo(denseY, 6);
    expect(sparseY).toBeCloseTo(pawnSlugPowRescueRise(0.11), 6);
  });

  it('keeps release feedback readable with reduced motion', () => {
    const model = createPawnSlugPowModel(PAWN_SLUG_POWS[0]);
    animatePawnSlugPowModel(model, 2, { rescued: true, reducedMotion: true });
    const flash = model.getObjectByName('pawn-slug-pow-release-flash');
    expect(flash.visible).toBe(true);
    expect(flash.scale.x).toBeCloseTo(1.15);
  });

  it('keeps the art contract arcade and contact-driven', () => {
    expect(PAWN_SLUG_POW_ART_META.style).toBe('military-arcade-prisoner');
    expect(PAWN_SLUG_POW_ART_META.rescueFeedback).toContain('contact');
    expect(PAWN_SLUG_POW_ART_META.rescueFeedback).toContain('break');
    expect(PAWN_SLUG_POW_ART_META.rescueRiseSeconds).toBeGreaterThan(0.15);
    expect(PAWN_SLUG_POW_ART_META.rescueRiseHeight).toBeCloseTo(0.2, 6);
    expect(PAWN_SLUG_POW_ART_META.poses).toEqual(['kneeling', 'bound', 'caged']);
  });
});
