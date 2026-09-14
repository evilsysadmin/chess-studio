import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_SPRITE_META } from './pawnSlugSprites.js';

describe('Pawn Slug Matthias run polish integration', () => {
  it('exposes the runtime run cleanup through the public sprite metadata', () => {
    expect(PAWN_SLUG_SPRITE_META.matthias.runPolish).toMatchObject({
      frameCount: 16,
      bottomTrimTexels: 4,
      purpose: 'sprint-readability-and-lower-corner-cleanup',
    });
  });
});
