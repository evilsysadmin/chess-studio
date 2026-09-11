import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_ENEMY_FIRE_PROFILES,
  PAWN_SLUG_ENEMY_ROLE_PRESSURE,
  pawnSlugEnemyCanFire,
  pawnSlugEnemyFireCooldown,
  pawnSlugEnemyPrefireStep,
  pawnSlugEnemyShotPlan,
} from './pawnSlugEnemyFireDoctrine.js';

describe('Pawn Slug enemy fire doctrine', () => {
  it('uses the same four weapon families with distinct combat jobs', () => {
    expect(Object.keys(PAWN_SLUG_ENEMY_FIRE_PROFILES)).toEqual(['pistol', 'machinegun', 'shotgun', 'panzerfaust']);
    expect(PAWN_SLUG_ENEMY_FIRE_PROFILES.machinegun.burstContinueChance).toBeGreaterThan(0.6);
    expect(PAWN_SLUG_ENEMY_FIRE_PROFILES.machinegun.burstInterval).toBeGreaterThanOrEqual(0.1);
    expect(PAWN_SLUG_ENEMY_FIRE_PROFILES.shotgun.pellets).toBeGreaterThanOrEqual(5);
    expect(PAWN_SLUG_ENEMY_FIRE_PROFILES.shotgun.range).toBeLessThan(PAWN_SLUG_ENEMY_FIRE_PROFILES.machinegun.range);
    expect(PAWN_SLUG_ENEMY_FIRE_PROFILES.panzerfaust.telegraph).toBeGreaterThan(0.25);
  });

  it('keeps enemy rounds threatening without turning normal soldiers into damage sponges', () => {
    expect(PAWN_SLUG_ENEMY_FIRE_PROFILES.machinegun.damage).toBeLessThan(PAWN_SLUG_ENEMY_FIRE_PROFILES.pistol.damage);
    expect(PAWN_SLUG_ENEMY_FIRE_PROFILES.shotgun.damage * PAWN_SLUG_ENEMY_FIRE_PROFILES.shotgun.pellets).toBeLessThanOrEqual(32);
    expect(PAWN_SLUG_ENEMY_FIRE_PROFILES.panzerfaust.damage).toBe(30);
  });

  it('makes knights the aggressive flanker and rooks the lane controller', () => {
    expect(PAWN_SLUG_ENEMY_ROLE_PRESSURE.knight.flank).toBeGreaterThan(0.7);
    expect(PAWN_SLUG_ENEMY_ROLE_PRESSURE.knight.leap).toBe(true);
    expect(PAWN_SLUG_ENEMY_ROLE_PRESSURE.rook.preferredDistance).toBeGreaterThan(PAWN_SLUG_ENEMY_ROLE_PRESSURE.pawn.preferredDistance);
    expect(PAWN_SLUG_ENEMY_ROLE_PRESSURE.rook.flank).toBe(0);
  });

  it('caps normal fire by both weapon range and the role-specific range', () => {
    expect(pawnSlugEnemyCanFire('shotgun', 6.7, 8)).toBe(true);
    expect(pawnSlugEnemyCanFire('shotgun', 7, 8)).toBe(false);
    expect(pawnSlugEnemyCanFire('machinegun', 10.4, 16)).toBe(true);
    expect(pawnSlugEnemyCanFire('machinegun', 10.6, 16)).toBe(false);
    expect(pawnSlugEnemyCanFire('panzerfaust', 11.9, 12)).toBe(true);
    expect(pawnSlugEnemyCanFire('panzerfaust', 12.1, 12)).toBe(false);
    expect(pawnSlugEnemyCanFire('unknown', 8.9, 20)).toBe(true);
    expect(pawnSlugEnemyCanFire('unknown', 9.1, 20)).toBe(false);
    expect(pawnSlugEnemyCanFire('pistol', -1, 9)).toBe(false);
  });

  it('winds up telegraphed weapons, cancels out of range, and keeps normal guns immediate', () => {
    expect(pawnSlugEnemyPrefireStep('machinegun', { ready: true, dt: 0.016 })).toEqual({ phase: 'fire', remaining: 0, progress: 1 });

    const start = pawnSlugEnemyPrefireStep('panzerfaust', { ready: true, dt: 0.04 });
    expect(start.phase).toBe('telegraph');
    expect(start.remaining).toBeCloseTo(0.3, 5);
    expect(start.progress).toBeGreaterThan(0);

    const middle = pawnSlugEnemyPrefireStep('panzerfaust', { ready: true, remaining: start.remaining, dt: 0.18 });
    expect(middle.phase).toBe('telegraph');
    expect(middle.progress).toBeGreaterThan(start.progress);

    expect(pawnSlugEnemyPrefireStep('panzerfaust', { ready: false, remaining: middle.remaining, dt: 0.02 })).toEqual({ phase: 'idle', remaining: 0, progress: 0 });
    expect(pawnSlugEnemyPrefireStep('panzerfaust', { ready: true, remaining: 0.05, dt: 0.06 })).toEqual({ phase: 'fire', remaining: 0, progress: 1 });
  });

  it('clusters machinegun shots into short runs and compensating pauses without raising average cadence', () => {
    const profile = PAWN_SLUG_ENEMY_FIRE_PROFILES.machinegun;
    const fastA = pawnSlugEnemyFireCooldown('machinegun', 0);
    const fastB = pawnSlugEnemyFireCooldown('machinegun', profile.burstContinueChance - 0.01);
    const pauseA = pawnSlugEnemyFireCooldown('machinegun', profile.burstContinueChance);
    const pauseB = pawnSlugEnemyFireCooldown('machinegun', 1);
    expect(fastA).toBeCloseTo(profile.burstInterval, 5);
    expect(fastB).toBeCloseTo(profile.burstInterval, 5);
    expect(pauseA).toBeCloseTo(profile.burstPauseMin, 5);
    expect(pauseB).toBeCloseTo(profile.burstPauseMax, 5);

    const clusteredMean = profile.burstContinueChance * profile.burstInterval
      + (1 - profile.burstContinueChance) * ((profile.burstPauseMin + profile.burstPauseMax) / 2);
    const legacyMean = (profile.cooldownMin + profile.cooldownMax) / 2;
    expect(clusteredMean).toBeCloseTo(legacyMean, 3);
  });

  it('interpolates non-machinegun cooldowns and returns a weapon-shaped shot plan with travel range', () => {
    const min = pawnSlugEnemyFireCooldown('pistol', 0);
    const middle = pawnSlugEnemyFireCooldown('pistol', 0.5);
    const max = pawnSlugEnemyFireCooldown('pistol', 1);
    expect(min).toBeLessThan(middle);
    expect(middle).toBeLessThan(max);
    expect(pawnSlugEnemyShotPlan('shotgun')).toMatchObject({ weapon: 'shotgun', range: 6.8, pellets: 5, explosive: false });
    expect(pawnSlugEnemyShotPlan('panzerfaust')).toMatchObject({ weapon: 'panzerfaust', range: 15, pellets: 1, explosive: true });
  });
});
