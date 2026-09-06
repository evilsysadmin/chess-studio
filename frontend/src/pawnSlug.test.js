import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_PLAYER,
  PAWN_SLUG_WEAPON_ORDER,
  PAWN_SLUG_WEAPONS,
  PAWN_SLUG_WORLD,
  pawnSlugAmmoForPickup,
  pawnSlugBossUnlocked,
  pawnSlugClamp,
  pawnSlugDamageMultiplier,
  pawnSlugLevelForXp,
  pawnSlugLevelProgress,
  pawnSlugMatthiasLine,
  pawnSlugMaxHpForLevel,
  pawnSlugPickupCopy,
  pawnSlugProgress,
  pawnSlugScoreForKill,
  pawnSlugSpawnWindow,
  pawnSlugWeaponLabel,
  pawnSlugWeaponShortLabel,
  pawnSlugXpForKill,
  pawnSlugXpForLevel,
} from './pawnSlug.js';

describe('Pawn Slug contracts', () => {
  it('keeps clamp and mission progress bounded', () => {
    expect(pawnSlugClamp(-2, 0, 1)).toBe(0);
    expect(pawnSlugClamp(3, 0, 1)).toBe(1);
    expect(pawnSlugProgress(-100)).toBe(0);
    expect(pawnSlugProgress(PAWN_SLUG_WORLD.extractionX * 2)).toBe(1);
  });

  it('starts with a semi-auto pistol and keeps MG as the automatic weapon', () => {
    expect(PAWN_SLUG_WEAPON_ORDER).toEqual(['pistol', 'machinegun', 'shotgun', 'panzerfaust']);
    expect(PAWN_SLUG_WEAPONS.pistol.slot).toBe(1);
    expect(PAWN_SLUG_WEAPONS.pistol.trigger).toBe('semi');
    expect(PAWN_SLUG_WEAPONS.machinegun.trigger).toBe('auto');
    expect(PAWN_SLUG_WEAPONS.shotgun.trigger).toBe('semi');
    expect(PAWN_SLUG_WEAPONS.panzerfaust.trigger).toBe('semi');
    expect(PAWN_SLUG_WEAPONS.pistol.ammo).toBe(Infinity);
    expect(pawnSlugWeaponShortLabel('panzerfaust')).toBe('PZF');
  });

  it('exposes distinct weapons and finite pickup ammunition', () => {
    expect(pawnSlugWeaponLabel('machinegun')).toContain('MG-42');
    expect(pawnSlugWeaponLabel('shotgun')).toContain('Escopeta');
    expect(pawnSlugWeaponLabel('panzerfaust')).toContain('Panzerfaust');
    expect(pawnSlugAmmoForPickup('machinegun')).toBeGreaterThan(100);
    expect(pawnSlugAmmoForPickup('grenade')).toBe(3);
  });

  it('spawns enemies only inside the current forward window', () => {
    const spawned = new Set(['pawn-0']);
    const nearStart = pawnSlugSpawnWindow(0, spawned, 1300);
    expect(nearStart.some((spawn) => spawn.id === 'pawn-0')).toBe(false);
    expect(nearStart.every((spawn) => spawn.x <= 1300)).toBe(true);
    expect(nearStart.some((spawn) => spawn.type === 'knight')).toBe(true);
  });

  it('keeps boss progression explicit and late in the level', () => {
    expect(pawnSlugBossUnlocked(PAWN_SLUG_WORLD.bossX - 721)).toBe(false);
    expect(pawnSlugBossUnlocked(PAWN_SLUG_WORLD.bossX - 720)).toBe(true);
    expect(pawnSlugProgress(PAWN_SLUG_WORLD.bossX)).toBeGreaterThan(0.8);
  });

  it('rewards tougher enemies and gives Matthias factual event barks', () => {
    expect(pawnSlugScoreForKill('rook')).toBeGreaterThan(pawnSlugScoreForKill('pawn'));
    expect(pawnSlugScoreForKill('boss')).toBeGreaterThan(3000);
    expect(pawnSlugXpForKill('rook')).toBeGreaterThan(pawnSlugXpForKill('pawn'));
    expect(pawnSlugXpForKill('boss')).toBeGreaterThan(500);
    expect(pawnSlugMatthiasLine('boss')).toContain('castillo');
    expect(pawnSlugMatthiasLine('death')).toContain('culo');
    expect(pawnSlugMatthiasLine('levelUp')).toContain('Ascenso');
    expect(pawnSlugPickupCopy('panzerfaust')).toContain('sutileza');
  });

  it('scales XP requirements, HP and damage without unbounded levels', () => {
    expect(pawnSlugXpForLevel(1)).toBe(0);
    expect(pawnSlugXpForLevel(2)).toBe(120);
    expect(pawnSlugXpForLevel(3)).toBeGreaterThan(pawnSlugXpForLevel(2));
    expect(pawnSlugLevelForXp(119)).toBe(1);
    expect(pawnSlugLevelForXp(120)).toBe(2);
    expect(pawnSlugLevelForXp(Number.MAX_SAFE_INTEGER)).toBe(PAWN_SLUG_PLAYER.maxLevel);
    expect(pawnSlugLevelProgress(0)).toBe(0);
    expect(pawnSlugLevelProgress(Number.MAX_SAFE_INTEGER, PAWN_SLUG_PLAYER.maxLevel)).toBe(1);
    expect(pawnSlugMaxHpForLevel(2)).toBe(PAWN_SLUG_PLAYER.baseMaxHp + PAWN_SLUG_PLAYER.hpPerLevel);
    expect(pawnSlugMaxHpForLevel(999)).toBe(pawnSlugMaxHpForLevel(PAWN_SLUG_PLAYER.maxLevel));
    expect(pawnSlugDamageMultiplier(2)).toBeCloseTo(1.05);
  });
});