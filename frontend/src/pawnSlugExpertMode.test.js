import { afterEach, describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_PLAYER,
  PAWN_SLUG_WEAPONS,
  pawnSlugDamageMultiplier,
  pawnSlugLevelForXp,
  pawnSlugLevelProgress,
  pawnSlugMaxHpForLevel,
  pawnSlugRuntimeRpgEnabled,
  pawnSlugWeaponStatsForLevel,
  pawnSlugWeaponUpgradeCrossed,
  pawnSlugXpForKill,
  setPawnSlugRuntimeRpgEnabled,
} from './pawnSlug.js';

afterEach(() => {
  setPawnSlugRuntimeRpgEnabled(true);
});

describe('Pawn Slug expert RPG runtime policy', () => {
  it('keeps the existing RPG progression semantics when expert runtime is enabled', () => {
    setPawnSlugRuntimeRpgEnabled(true);
    expect(pawnSlugRuntimeRpgEnabled()).toBe(true);
    expect(pawnSlugXpForKill('boss')).toBeGreaterThan(0);
    expect(pawnSlugLevelForXp(120)).toBe(2);
    expect(pawnSlugMaxHpForLevel(4)).toBeGreaterThan(PAWN_SLUG_PLAYER.baseMaxHp);
    expect(pawnSlugDamageMultiplier(4)).toBeGreaterThan(1);
    expect(pawnSlugWeaponStatsForLevel('machinegun', 9).upgradeCode).toBe('Mk III');
  });

  it('collapses progression to the level-one arcade baseline when expert runtime is disabled', () => {
    setPawnSlugRuntimeRpgEnabled(false);
    expect(pawnSlugRuntimeRpgEnabled()).toBe(false);
    expect(pawnSlugXpForKill('boss')).toBe(0);
    expect(pawnSlugLevelForXp(99999)).toBe(1);
    expect(pawnSlugLevelProgress(99999, 12)).toBe(0);
    expect(pawnSlugMaxHpForLevel(12)).toBe(PAWN_SLUG_PLAYER.baseMaxHp);
    expect(pawnSlugDamageMultiplier(12)).toBe(1);

    const weapon = pawnSlugWeaponStatsForLevel('machinegun', 12);
    expect(weapon.upgradeCode).toBe('Mk I');
    expect(weapon.damage).toBe(PAWN_SLUG_WEAPONS.machinegun.damage);
    expect(pawnSlugWeaponUpgradeCrossed('machinegun', 1, 12)).toBeNull();
  });
});
