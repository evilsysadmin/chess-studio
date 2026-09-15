import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_SPRITE_META } from './pawnSlugSprites.js';

describe('Pawn Slug Matthias run polish integration', () => {
  it('exposes the planted four-edge run cleanup through the public sprite metadata', () => {
    expect(PAWN_SLUG_SPRITE_META.matthias.runPolish).toMatchObject({
      frameCount: 16,
      frameRate: 10.5,
      leftTrimTexels: 4,
      rightTrimTexels: 4,
      bottomTrimTexels: 10,
      maxVerticalCompensation: 0,
      purpose: 'grounded-sprint-with-clean-four-edge-crop-and-no-trotting-bob',
    });
  });
});
