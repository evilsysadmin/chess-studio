import { describe, expect, it } from 'vitest';
import {
  pawnSlugJumpVisualPhase,
  pawnSlugLandingVisualStrength,
  pawnSlugMatthiasPremiumPose,
} from './pawnSlugMatthiasPremiumMotion.js';

describe('Pawn Slug Matthias premium motion', () => {
  it('stretches on ascent and compresses on descent', () => {
    const ascent = pawnSlugMatthiasPremiumPose({ airborne: true, jumpFrame: 2, jumpFrames: 9 });
    const descent = pawnSlugMatthiasPremiumPose({ airborne: true, jumpFrame: 7, jumpFrames: 9 });
    expect(ascent.sy).toBeGreaterThan(1);
    expect(ascent.sx).toBeLessThan(1);
    expect(descent.sx).toBeGreaterThan(1);
    expect(descent.sy).toBeLessThan(1);
  });

  it('compresses briefly on takeoff before stretching into the rise', () => {
    const takeoff = pawnSlugMatthiasPremiumPose({ airborne: true, jumpFrame: 0, jumpFrames: 9 });
    const rise = pawnSlugMatthiasPremiumPose({ airborne: true, jumpFrame: 2, jumpFrames: 9 });
    expect(takeoff.jumpPhase).toBe('takeoff');
    expect(takeoff.sx).toBeGreaterThan(1);
    expect(takeoff.sy).toBeLessThan(1);
    expect(takeoff.y).toBeLessThan(0);
    expect(rise.jumpPhase).toBe('rise');
    expect(rise.sx).toBeLessThan(1);
    expect(rise.sy).toBeGreaterThan(1);
    expect(rise.y).toBeGreaterThan(0);
  });

  it('reads takeoff, rise, apex and fall as distinct visual phases', () => {
    expect(pawnSlugJumpVisualPhase(0.05)).toBe('takeoff');
    expect(pawnSlugJumpVisualPhase(0.3)).toBe('rise');
    expect(pawnSlugJumpVisualPhase(0.6)).toBe('apex');
    expect(pawnSlugJumpVisualPhase(0.85)).toBe('fall');

    const takeoff = pawnSlugMatthiasPremiumPose({ airborne: true, jumpFrame: 0, jumpFrames: 9 });
    const apex = pawnSlugMatthiasPremiumPose({ airborne: true, jumpFrame: 5, jumpFrames: 9 });
    const fall = pawnSlugMatthiasPremiumPose({ airborne: true, jumpFrame: 8, jumpFrames: 9 });

    expect(takeoff.jumpPhase).toBe('takeoff');
    expect(apex.jumpPhase).toBe('apex');
    expect(fall.jumpPhase).toBe('fall');
    expect(takeoff.sy).toBeLessThan(apex.sy);
    expect(fall.sy).toBeLessThan(apex.sy);
    expect(takeoff.rz).toBeLessThan(apex.rz);
    expect(fall.rz).toBeGreaterThan(apex.rz);
  });

  it('scales landing squash by real airtime with restrained caps', () => {
    const shortStrength = pawnSlugLandingVisualStrength(0.18);
    const normalStrength = pawnSlugLandingVisualStrength(0.76);
    const longStrength = pawnSlugLandingVisualStrength(2.4);
    expect(shortStrength).toBeLessThan(normalStrength);
    expect(normalStrength).toBeCloseTo(1.009, 2);
    expect(longStrength).toBe(1.25);

    const shortLanding = pawnSlugMatthiasPremiumPose({
      time: 3.07,
      airborne: false,
      landedAt: 3,
      landingStrength: shortStrength,
    });
    const hardLanding = pawnSlugMatthiasPremiumPose({
      time: 3.07,
      airborne: false,
      landedAt: 3,
      landingStrength: longStrength,
    });
    expect(hardLanding.sx).toBeGreaterThan(shortLanding.sx);
    expect(hardLanding.sy).toBeLessThan(shortLanding.sy);
    expect(hardLanding.y).toBeLessThan(shortLanding.y);
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
