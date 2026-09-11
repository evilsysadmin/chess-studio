import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_POWS } from './pawnSlugPows.js';
import { PAWN_SLUG_POW_ART_META, animatePawnSlugPowModel, createPawnSlugPowModel } from './pawnSlugPowArt.js';

describe('Pawn Slug POW art', () => {
  it('builds a physical rescueable model for every configured POW', () => {
    for (const pow of PAWN_SLUG_POWS) {
      const model = createPawnSlugPowModel(pow);
      expect(model.name).toBe(`pawn-slug-pow-${pow.id}`);
      expect(model.userData).toMatchObject({ pawnSlugPow: true, powId: pow.id, pose: pow.pose, rescued: false });
      expect(model.userData.rescueRadius).toBeGreaterThan(0.7);
      expect(model.getObjectByName('pawn-slug-pow-body')).toBeTruthy();
      expect(model.getObjectByName('pawn-slug-pow-rescue-marker')).toBeTruthy();
      if (pow.pose === 'caged') expect(model.getObjectByName('pawn-slug-pow-cage')).toBeTruthy();
      else expect(model.getObjectByName('pawn-slug-pow-chains')).toBeTruthy();
    }
  });

  it('hides the rescue marker once the prisoner has been rescued', () => {
    const model = createPawnSlugPowModel(PAWN_SLUG_POWS[0]);
    animatePawnSlugPowModel(model, 1, { rescued: true });
    expect(model.userData.rescued).toBe(true);
    expect(model.getObjectByName('pawn-slug-pow-rescue-marker').visible).toBe(false);
  });

  it('keeps the art contract arcade and contact-driven', () => {
    expect(PAWN_SLUG_POW_ART_META.style).toBe('military-arcade-prisoner');
    expect(PAWN_SLUG_POW_ART_META.rescueFeedback).toContain('contact');
    expect(PAWN_SLUG_POW_ART_META.poses).toEqual(['kneeling', 'bound', 'caged']);
  });
});
