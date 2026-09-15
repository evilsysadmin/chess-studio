import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_SPRITE_META } from './pawnSlugSprites.js';

describe('Pawn Slug Matthias run polish integration', () => {
  it('exposes the compact planted sixteen-frame run contract through public sprite metadata', () => {
    expect(PAWN_SLUG_SPRITE_META.matthias.runPolish).toMatchObject({
      frameCount: 16,
      frameRate: 14,
      leftTrimTexels: 4,
      rightTrimTexels: 4,
      bottomTrimTexels: 2,
      maxVerticalCompensation: 0,
      purpose: 'grounded-16-frame-run-with-clean-edges-and-visible-authored-footwork',
    });
    expect(PAWN_SLUG_SPRITE_META.matthias.primaryAspect).toMatchObject({
      scaleY: 0.9,
      purpose: 'restore-compact-pre-v5-silhouette-without-changing-hitbox',
    });
  });
});