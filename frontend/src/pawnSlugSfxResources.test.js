import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_SFX_RESOURCE_META,
  pawnSlugNoiseWindow,
} from './pawnSlugSfx.js';

describe('Pawn Slug SFX shared noise resources', () => {
  it('keeps every noise slice inside the shared buffer', () => {
    const duration = PAWN_SLUG_SFX_RESOURCE_META.sharedNoiseBufferSeconds;
    const start = pawnSlugNoiseWindow(0.14, 0);
    const middle = pawnSlugNoiseWindow(0.14, 0.5);
    const end = pawnSlugNoiseWindow(0.14, 1);

    expect(start.offset).toBe(0);
    expect(middle.offset).toBeGreaterThan(start.offset);
    expect(end.offset + end.duration).toBeCloseTo(duration, 8);
  });

  it('caps requested noise duration to the reusable buffer', () => {
    expect(pawnSlugNoiseWindow(4, 0.8)).toEqual({
      duration: PAWN_SLUG_SFX_RESOURCE_META.sharedNoiseBufferSeconds,
      offset: 0,
    });
  });
});
