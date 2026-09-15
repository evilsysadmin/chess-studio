import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_MATTHIAS_INTEGRATED_ART } from './pawnSlugMatthiasIntegratedSprites.js';

describe('Pawn Slug integrated Matthias facing contract', () => {
  it('documents Blender left-facing source with runtime direction normalization', () => {
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.sourceFacing).toBe('left');
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.runtimeFacing).toBe('world-direction-normalized');
  });
});
