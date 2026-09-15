import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_SPRITE_META } from './pawnSlugSprites.js';

describe('Pawn Slug Matthias run polish integration', () => {
  it('exposes the planted sixteen-frame run cleanup through public sprite metadata', () => {
    expect(PAWN_SLUG_SPRITE_META.matthias.runPolish).toMatchObject({
      frameCount: 16,
      frameRate: 14,
      leftTrimTexels: 4,
      rightTrimTexels: 4,
      bottomTrimTexels: 10,
      maxVerticalCompensation: 0,
      purpose: 'grounded-16-frame-run-with-clean-four-edge-crop-and-no-trotting-bob',
    });
  });
});
