import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_WEAPONS } from './pawnSlug.js';
import { PAWN_SLUG_PISTOL_FEEL, pawnSlugPistolFirePhase } from './pawnSlugPistolFeel.js';

describe('Pawn Slug deliberate pistol feel', () => {
  it('keeps the sidearm infinite, semiautomatic and deliberately slow', () => {
    expect(PAWN_SLUG_WEAPONS.pistol.trigger).toBe('semi');
    expect(PAWN_SLUG_WEAPONS.pistol.ammo).toBe(Infinity);
    expect(PAWN_SLUG_WEAPONS.pistol.cadence).toBe(PAWN_SLUG_PISTOL_FEEL.cadenceMs);
    expect(PAWN_SLUG_WEAPONS.pistol.cadence).toBeGreaterThanOrEqual(350);
    expect(PAWN_SLUG_WEAPONS.machinegun.cadence).toBeLessThan(PAWN_SLUG_WEAPONS.pistol.cadence / 3);
  });

  it('uses raise, blast and recover phases instead of one generic recoil pose', () => {
    const total = PAWN_SLUG_PISTOL_FEEL.recoilSeconds;
    expect(pawnSlugPistolFirePhase(total * 0.95).phase).toBe('raise');
    expect(pawnSlugPistolFirePhase(total * 0.65).phase).toBe('blast');
    expect(pawnSlugPistolFirePhase(total * 0.25).phase).toBe('recover');
    expect(pawnSlugPistolFirePhase(0).phase).toBe('idle');
  });
});
