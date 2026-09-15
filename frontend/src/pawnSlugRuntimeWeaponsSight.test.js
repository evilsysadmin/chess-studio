import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_ENEMY_SIGHT_RANGE,
  pawnSlugEnemyCanEngageAtSight,
  pawnSlugEnemyProjectileLife,
  pawnSlugPlayerWeaponVisualScale,
} from './pawnSlugRuntimeWeapons.js';
import { pawnSlugEnemyShotPlan } from './pawnSlugEnemyFireDoctrine.js';

describe('Pawn Slug visible-range fire and weapon presentation', () => {
  it('lets regular enemies engage as soon as the player is visibly in front of them', () => {
    expect(pawnSlugEnemyCanEngageAtSight('pistol', PAWN_SLUG_ENEMY_SIGHT_RANGE - 0.1, 9)).toBe(true);
    expect(pawnSlugEnemyCanEngageAtSight('pistol', PAWN_SLUG_ENEMY_SIGHT_RANGE + 0.1, 9)).toBe(false);
    expect(pawnSlugEnemyCanEngageAtSight('machinegun', 12, 8)).toBe(true);
    expect(pawnSlugEnemyCanEngageAtSight('shotgun', 12, 8)).toBe(true);
  });

  it('preserves explicit fire gates and panzerfaust minimum safety distance', () => {
    expect(pawnSlugEnemyCanEngageAtSight('machinegun', 4, 0)).toBe(false);
    expect(pawnSlugEnemyCanEngageAtSight('panzerfaust', 3.5, 16)).toBe(false);
    expect(pawnSlugEnemyCanEngageAtSight('panzerfaust', 3.6, 16)).toBe(true);
  });

  it('keeps long sight shots alive until they can actually reach the player', () => {
    const pistol = pawnSlugEnemyShotPlan('pistol');
    const closeLife = pawnSlugEnemyProjectileLife(pistol, 5);
    const sightLife = pawnSlugEnemyProjectileLife(pistol, PAWN_SLUG_ENEMY_SIGHT_RANGE - 0.2);
    expect(sightLife).toBeGreaterThan(closeLife);
    expect(sightLife * pistol.speed).toBeGreaterThan(PAWN_SLUG_ENEMY_SIGHT_RANGE);
  });

  it('renders the sidearm materially smaller than long guns', () => {
    const pistol = pawnSlugPlayerWeaponVisualScale('pistol');
    const machinegun = pawnSlugPlayerWeaponVisualScale('machinegun');
    const panzerfaust = pawnSlugPlayerWeaponVisualScale('panzerfaust');
    expect(pistol[0]).toBeLessThan(machinegun[0]);
    expect(pistol[1]).toBeLessThan(machinegun[1]);
    expect(machinegun[0]).toBeLessThan(panzerfaust[0]);
  });
});
