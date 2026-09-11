import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_WEAPONS } from './pawnSlug.js';
import { PAWN_SLUG_ENEMY_LOADOUTS, pawnSlugEnemyLoadoutFor, pawnSlugEnemyWeaponFor } from './pawnSlugEnemyLoadouts.js';

describe('Pawn Slug enemy weapon doctrine', () => {
  it('uses only weapons from the player arsenal', () => {
    const arsenal = new Set(Object.keys(PAWN_SLUG_WEAPONS));
    for (const loadout of Object.values(PAWN_SLUG_ENEMY_LOADOUTS)) {
      expect(arsenal.has(loadout.primary)).toBe(true);
      for (const weapon of loadout.alternates) expect(arsenal.has(weapon)).toBe(true);
    }
  });

  it('gives each chess-soldier class a combat role', () => {
    expect(pawnSlugEnemyLoadoutFor('pawn').role).toBe('pressure-infantry');
    expect(pawnSlugEnemyLoadoutFor('knight').role).toBe('mobile-flanker');
    expect(pawnSlugEnemyLoadoutFor('rook').role).toBe('lane-controller');
    expect(pawnSlugEnemyLoadoutFor('bishop').role).toBe('suppression-artillery');
  });

  it('selects loadout variants deterministically', () => {
    expect(pawnSlugEnemyWeaponFor('pawn', 0)).toBe('pistol');
    expect(pawnSlugEnemyWeaponFor('pawn', 1)).toBe('machinegun');
    expect(pawnSlugEnemyWeaponFor('knight', 1)).toBe('shotgun');
  });

  it('weights rook machinegun duty above untelegraphed rockets without removing the alternate', () => {
    expect(pawnSlugEnemyLoadoutFor('rook').primaryWeight).toBe(2);
    expect(pawnSlugEnemyWeaponFor('rook', 0)).toBe('machinegun');
    expect(pawnSlugEnemyWeaponFor('rook', 1)).toBe('machinegun');
    expect(pawnSlugEnemyWeaponFor('rook', 2)).toBe('panzerfaust');
    expect(pawnSlugEnemyWeaponFor('rook', 5)).toBe('panzerfaust');
  });

  it('keeps bishop regular fire machinegun-led so artillery remains the telegraphed heavy attack', () => {
    expect(pawnSlugEnemyLoadoutFor('bishop').primaryWeight).toBe(2);
    expect(pawnSlugEnemyWeaponFor('bishop', 0)).toBe('machinegun');
    expect(pawnSlugEnemyWeaponFor('bishop', 1)).toBe('machinegun');
    expect(pawnSlugEnemyWeaponFor('bishop', 2)).toBe('panzerfaust');
  });
});
