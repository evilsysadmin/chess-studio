import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_IMPACT_SOUND_PROFILES,
  PAWN_SLUG_WEAPON_SOUND_PROFILES,
  pawnSlugImpactSoundProfile,
  pawnSlugWeaponSoundProfile,
} from './pawnSlugSfx.js';

describe('Pawn Slug arcade combat SFX', () => {
  it('gives each weapon family a distinct firing signature', () => {
    expect(Object.keys(PAWN_SLUG_WEAPON_SOUND_PROFILES)).toEqual([
      'pistol',
      'machinegun',
      'shotgun',
      'panzerfaust',
    ]);
    expect(pawnSlugWeaponSoundProfile('pistol').crack).toBeGreaterThan(pawnSlugWeaponSoundProfile('shotgun').crack);
    expect(pawnSlugWeaponSoundProfile('shotgun').noise).toBeGreaterThan(pawnSlugWeaponSoundProfile('machinegun').noise);
    expect(pawnSlugWeaponSoundProfile('panzerfaust').tail).toBeGreaterThan(pawnSlugWeaponSoundProfile('shotgun').tail);
    expect(new Set(Object.values(PAWN_SLUG_WEAPON_SOUND_PROFILES).map((profile) => profile.mechanic)).size).toBe(4);
    expect(pawnSlugWeaponSoundProfile('pistol').mechanic).toBe('casing');
    expect(pawnSlugWeaponSoundProfile('shotgun').mechanic).toBe('pump');
  });

  it('uses more metallic impact rings for armored chess soldiers', () => {
    expect(PAWN_SLUG_IMPACT_SOUND_PROFILES.pawn.ring).toBe(0);
    expect(pawnSlugImpactSoundProfile('knight').ring).toBeGreaterThan(0);
    expect(pawnSlugImpactSoundProfile('rook').ring).toBeGreaterThan(0);
    expect(pawnSlugImpactSoundProfile('boss').body).toBeLessThan(pawnSlugImpactSoundProfile('pawn').body);
  });

  it('falls back to stable pistol and pawn profiles', () => {
    expect(pawnSlugWeaponSoundProfile('unknown')).toBe(PAWN_SLUG_WEAPON_SOUND_PROFILES.pistol);
    expect(pawnSlugImpactSoundProfile('unknown')).toBe(PAWN_SLUG_IMPACT_SOUND_PROFILES.pawn);
  });
});
