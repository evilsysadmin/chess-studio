import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_DESTRUCTIBLE_ART_META,
  createPawnSlugDestructibleModel,
} from './pawnSlugDestructibleArt.js';

describe('Pawn Slug premium destructible art', () => {
  it('keeps gameplay hitboxes while upgrading field-prop presentation', () => {
    const crate = createPawnSlugDestructibleModel('crate');
    const barrel = createPawnSlugDestructibleModel('barrel');

    expect(crate.userData.hitbox).toEqual({ width: 1.12, height: 0.96 });
    expect(barrel.userData.hitbox).toEqual({ width: 0.82, height: 1.18 });
    expect(crate.userData.premiumArt).toBe('field-prop-v2');
    expect(barrel.userData.premiumArt).toBe('field-prop-v2');
  });

  it('grounds both props with contact shadows and preserves the crate stencil', () => {
    const crate = createPawnSlugDestructibleModel('crate');
    const barrel = createPawnSlugDestructibleModel('barrel');

    expect(crate.getObjectByName('pawn-slug-destructible-contact-shadow')).toBeTruthy();
    expect(barrel.getObjectByName('pawn-slug-destructible-contact-shadow')).toBeTruthy();
    expect(crate.getObjectByName('pawn-slug-destructible-stencil')).toBeTruthy();
    expect(PAWN_SLUG_DESTRUCTIBLE_ART_META.contactShadow).toBe(true);
    expect(PAWN_SLUG_DESTRUCTIBLE_ART_META.dynamicLights).toBe(0);
  });

  it('keeps the premium pass performance-bounded', () => {
    expect(PAWN_SLUG_DESTRUCTIBLE_ART_META.artVersion).toBe('field-prop-v2');
    expect(PAWN_SLUG_DESTRUCTIBLE_ART_META.intactIdleAnimation).toBe('none');
    expect(PAWN_SLUG_DESTRUCTIBLE_ART_META.materialRefresh).toBe('stage-change-only');
  });
});
