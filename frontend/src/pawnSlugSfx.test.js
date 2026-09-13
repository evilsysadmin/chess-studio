import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_COMBAT_CUE_PRIORITY,
  PAWN_SLUG_HOSTILE_WEAPON_SCALES,
  PAWN_SLUG_IMPACT_SOUND_PROFILES,
  PAWN_SLUG_SFX_RESOURCE_META,
  PAWN_SLUG_WEAPON_PITCH_WIDTHS,
  PAWN_SLUG_WEAPON_SOUND_PROFILES,
  PAWN_SLUG_WEAPON_STEREO_PAN,
  pawnSlugCombatCuePriority,
  pawnSlugImpactSoundProfile,
  pawnSlugShouldPlayCombatCue,
  pawnSlugSoundPitchVariation,
  pawnSlugWeaponGainScale,
  pawnSlugWeaponPitchWidth,
  pawnSlugWeaponSoundProfile,
  pawnSlugWeaponStereoPan,
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

  it('uses intentional pitch stability per weapon instead of one global wobble', () => {
    expect(Object.keys(PAWN_SLUG_WEAPON_PITCH_WIDTHS)).toEqual([
      'pistol',
      'machinegun',
      'shotgun',
      'panzerfaust',
    ]);
    expect(pawnSlugWeaponPitchWidth('machinegun')).toBeLessThan(pawnSlugWeaponPitchWidth('panzerfaust'));
    expect(pawnSlugWeaponPitchWidth('panzerfaust')).toBeLessThan(pawnSlugWeaponPitchWidth('pistol'));
    expect(pawnSlugWeaponPitchWidth('pistol')).toBeLessThan(pawnSlugWeaponPitchWidth('shotgun'));
    expect(pawnSlugWeaponPitchWidth('unknown')).toBe(pawnSlugWeaponPitchWidth('pistol'));
    expect(Math.max(...Object.values(PAWN_SLUG_WEAPON_PITCH_WIDTHS))).toBeLessThanOrEqual(0.035);
  });

  it('keeps routine hostile fire restrained while prioritizing shotgun and Panzerfaust warnings', () => {
    expect(Object.keys(PAWN_SLUG_HOSTILE_WEAPON_SCALES)).toEqual([
      'pistol',
      'machinegun',
      'shotgun',
      'panzerfaust',
    ]);
    expect(pawnSlugWeaponGainScale('machinegun', { enemy: true })).toBeLessThan(pawnSlugWeaponGainScale('pistol', { enemy: true }));
    expect(pawnSlugWeaponGainScale('pistol', { enemy: true })).toBeLessThan(pawnSlugWeaponGainScale('shotgun', { enemy: true }));
    expect(pawnSlugWeaponGainScale('shotgun', { enemy: true })).toBeLessThan(pawnSlugWeaponGainScale('panzerfaust', { enemy: true }));
    expect(pawnSlugWeaponGainScale('unknown', { enemy: true })).toBe(pawnSlugWeaponGainScale('pistol', { enemy: true }));
    expect(pawnSlugWeaponGainScale('panzerfaust', { enemy: true })).toBeLessThan(pawnSlugWeaponGainScale('panzerfaust'));
  });

  it('does not change player weapon gain when hostile prioritization is enabled', () => {
    const playerScales = ['pistol', 'machinegun', 'shotgun', 'panzerfaust']
      .map((weapon) => pawnSlugWeaponGainScale(weapon));
    expect(new Set(playerScales)).toEqual(new Set([0.72]));
    expect(pawnSlugWeaponGainScale('unknown')).toBe(0.72);
  });

  it('uses restrained stereo separation between Matthias and hostile fire', () => {
    const playerPan = pawnSlugWeaponStereoPan();
    const enemyPan = pawnSlugWeaponStereoPan({ enemy: true });

    expect(playerPan).toBe(PAWN_SLUG_WEAPON_STEREO_PAN.player);
    expect(enemyPan).toBe(PAWN_SLUG_WEAPON_STEREO_PAN.enemy);
    expect(playerPan).toBeLessThan(0);
    expect(enemyPan).toBeGreaterThan(0);
    expect(Math.abs(playerPan)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(enemyPan)).toBeLessThanOrEqual(0.15);
    expect(enemyPan - playerPan).toBeLessThanOrEqual(0.25);
  });

  it('batches settings reads once per composite cue', () => {
    expect(PAWN_SLUG_SFX_RESOURCE_META.preferenceReadStrategy).toBe('once-per-cue');
    expect(PAWN_SLUG_SFX_RESOURCE_META.noiseStrategy).toBe('shared-random-window');
    expect(PAWN_SLUG_SFX_RESOURCE_META.weaponPannerStrategy).toBe('shared-player-enemy');
  });

  it('uses more metallic impact rings for armored chess soldiers', () => {
    expect(PAWN_SLUG_IMPACT_SOUND_PROFILES.pawn.ring).toBe(0);
    expect(pawnSlugImpactSoundProfile('knight').ring).toBeGreaterThan(0);
    expect(pawnSlugImpactSoundProfile('rook').ring).toBeGreaterThan(0);
    expect(pawnSlugImpactSoundProfile('boss').body).toBeLessThan(pawnSlugImpactSoundProfile('pawn').body);
  });

  it('ranks combat cues by threat weight', () => {
    expect(PAWN_SLUG_COMBAT_CUE_PRIORITY).toEqual({
      pawn: 1,
      knight: 2,
      bishop: 2,
      rook: 3,
      boss: 4,
    });
    expect(pawnSlugCombatCuePriority('pawn')).toBeLessThan(pawnSlugCombatCuePriority('knight'));
    expect(pawnSlugCombatCuePriority('knight')).toBe(pawnSlugCombatCuePriority('bishop'));
    expect(pawnSlugCombatCuePriority('bishop')).toBeLessThan(pawnSlugCombatCuePriority('rook'));
    expect(pawnSlugCombatCuePriority('rook')).toBeLessThan(pawnSlugCombatCuePriority('boss'));
    expect(pawnSlugCombatCuePriority('unknown')).toBe(pawnSlugCombatCuePriority('pawn'));
  });

  it('lets heavier cues preempt throttling without letting routine cues spam', () => {
    expect(pawnSlugShouldPlayCombatCue({
      now: 10,
      lastAt: 0,
      lastPriority: pawnSlugCombatCuePriority('pawn'),
      type: 'rook',
      cooldown: 24,
    })).toBe(true);
    expect(pawnSlugShouldPlayCombatCue({
      now: 10,
      lastAt: 0,
      lastPriority: pawnSlugCombatCuePriority('rook'),
      type: 'pawn',
      cooldown: 24,
    })).toBe(false);
    expect(pawnSlugShouldPlayCombatCue({
      now: 10,
      lastAt: 0,
      lastPriority: pawnSlugCombatCuePriority('rook'),
      type: 'rook',
      cooldown: 24,
    })).toBe(false);
    expect(pawnSlugShouldPlayCombatCue({
      now: 24,
      lastAt: 0,
      lastPriority: pawnSlugCombatCuePriority('boss'),
      type: 'pawn',
      cooldown: 24,
    })).toBe(true);
  });

  it('falls back to stable pistol and pawn profiles', () => {
    expect(pawnSlugWeaponSoundProfile('unknown')).toBe(PAWN_SLUG_WEAPON_SOUND_PROFILES.pistol);
    expect(pawnSlugImpactSoundProfile('unknown')).toBe(PAWN_SLUG_IMPACT_SOUND_PROFILES.pawn);
  });

  it('keeps pitch variation subtle and preserves enemy/player separation', () => {
    expect(pawnSlugSoundPitchVariation(0, { width: 0.035 })).toBeCloseTo(0.965, 5);
    expect(pawnSlugSoundPitchVariation(1, { width: 0.035 })).toBeCloseTo(1.035, 5);
    expect(pawnSlugSoundPitchVariation(0.5, { width: 0.035 })).toBeCloseTo(1, 5);
    expect(pawnSlugSoundPitchVariation(0.5, { enemy: true, width: 0.035 })).toBeCloseTo(0.9, 5);
    expect(pawnSlugSoundPitchVariation(1, { width: 99 })).toBeLessThanOrEqual(1.08);
  });
});