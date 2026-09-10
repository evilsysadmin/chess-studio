import { describe, expect, it } from 'vitest';
import { pawnSlugMatthiasPremiumPose } from './pawnSlugMatthiasPremiumMotion.js';

describe('Pawn Slug Matthias premium motion', () => {
  it('stretches on ascent and compresses on descent', () => {
    const ascent = pawnSlugMatthiasPremiumPose({ airborne: true, jumpFrame: 2, jumpFrames: 9 });
    const descent = pawnSlugMatthiasPremiumPose({ airborne: true, jumpFrame: 7, jumpFrames: 9 });
    expect(ascent.sy).toBeGreaterThan(1);
    expect(ascent.sx).toBeLessThan(1);
    expect(descent.sx).toBeGreaterThan(1);
    expect(descent.sy).toBeLessThan(1);
  });

  it('adds a short landing squash after leaving the air', () => {
    const landed = pawnSlugMatthiasPremiumPose({
      time: 3,
      airborne: false,
      previousAirborne: true,
      landedAt: 3,
    });
    const settled = pawnSlugMatthiasPremiumPose({
      time: 3.3,
      airborne: false,
      previousAirborne: false,
      landedAt: 3,
    });
    expect(landed.landing).toBe(1);
    expect(settled.landing).toBe(0);
  });

  it('makes firing and hurt poses visually distinct without changing gameplay', () => {
    const firing = pawnSlugMatthiasPremiumPose({ firing: true });
    const hurt = pawnSlugMatthiasPremiumPose({ hurt: true });
    expect(Math.abs(firing.rz)).toBeGreaterThan(0);
    expect(hurt.sy).toBeLessThan(firing.sy);
    expect(Math.abs(hurt.rz)).toBeGreaterThan(Math.abs(firing.rz));
  });
});
