import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_ENEMY_FIRE_PROFILES,
  PAWN_SLUG_ENEMY_ROLE_PRESSURE,
  pawnSlugEnemyFireCooldown,
  pawnSlugEnemyShotPlan,
} from './pawnSlugEnemyFireDoctrine.js';

describe('Pawn Slug enemy fire doctrine', () => {
  it('uses the same four weapon families with distinct combat jobs', () => {
    expect(Object.keys(PAWN_SLUG_ENEMY_FIRE_PROFILES)).toEqual(['pistol', 'machinegun', 'shotgun', 'panzerfaust']);
    expect(PAWN_SLUG_ENEMY_FIRE_PROFILES.machinegun.burstMin).toBeGreaterThanOrEqual(2);
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

  it('interpolates cooldown deterministically and returns a weapon-shaped shot plan', () => {
    const min = pawnSlugEnemyFireCooldown('machinegun', 0);
    const middle = pawnSlugEnemyFireCooldown('machinegun', 0.5);
    const max = pawnSlugEnemyFireCooldown('machinegun', 1);
    expect(min).toBeLessThan(middle);
    expect(middle).toBeLessThan(max);
    expect(pawnSlugEnemyShotPlan('shotgun')).toMatchObject({ weapon: 'shotgun', pellets: 5, explosive: false });
    expect(pawnSlugEnemyShotPlan('panzerfaust')).toMatchObject({ weapon: 'panzerfaust', pellets: 1, explosive: true });
  });
});
