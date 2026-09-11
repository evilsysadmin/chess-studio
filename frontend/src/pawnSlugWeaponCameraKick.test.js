import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_WEAPON_CAMERA_KICK,
  pawnSlugWeaponCameraKick,
} from './pawnSlugWeaponCameraKick.js';

describe('Pawn Slug weapon camera kick', () => {
  it('keeps the kick hierarchy aligned with weapon weight', () => {
    expect(PAWN_SLUG_WEAPON_CAMERA_KICK.pistol).toBeLessThan(PAWN_SLUG_WEAPON_CAMERA_KICK.machinegun);
    expect(PAWN_SLUG_WEAPON_CAMERA_KICK.machinegun).toBeLessThan(PAWN_SLUG_WEAPON_CAMERA_KICK.shotgun);
    expect(PAWN_SLUG_WEAPON_CAMERA_KICK.shotgun).toBeLessThan(PAWN_SLUG_WEAPON_CAMERA_KICK.panzerfaust);
  });

  it('keeps light weapons subtle and heavy weapons restrained', () => {
    expect(pawnSlugWeaponCameraKick('pistol')).toBeLessThan(0.01);
    expect(pawnSlugWeaponCameraKick('machinegun')).toBeLessThan(0.025);
    expect(pawnSlugWeaponCameraKick('panzerfaust')).toBeLessThanOrEqual(0.12);
  });

  it('falls back to the pistol profile for unknown weapons', () => {
    expect(pawnSlugWeaponCameraKick('unknown')).toBe(PAWN_SLUG_WEAPON_CAMERA_KICK.pistol);
  });
});
