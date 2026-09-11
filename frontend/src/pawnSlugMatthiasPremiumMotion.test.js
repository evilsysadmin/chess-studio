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

  it('gives automatic, shotgun and launcher fire visibly different recoil signatures', () => {
    const machinegun = pawnSlugMatthiasPremiumPose({ time: 0.021, firing: true, weapon: 'machinegun' });
    const shotgun = pawnSlugMatthiasPremiumPose({ time: 0.021, firing: true, weapon: 'shotgun' });
    const panzerfaust = pawnSlugMatthiasPremiumPose({ time: 0.021, firing: true, weapon: 'panzerfaust' });

    expect(machinegun.weaponRecoil).toBe('machinegun-chatter');
    expect(shotgun.weaponRecoil).toBe('shotgun-kick');
    expect(panzerfaust.weaponRecoil).toBe('panzerfaust-brace');
    expect(Math.abs(machinegun.rz)).toBeLessThan(Math.abs(shotgun.rz));
    expect(Math.abs(shotgun.rz)).toBeLessThan(Math.abs(panzerfaust.rz));
    expect(panzerfaust.sy).toBeLessThan(shotgun.sy);
    expect(shotgun.sy).toBeLessThan(machinegun.sy);
  });
});
