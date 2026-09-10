import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_POW_META,
  PAWN_SLUG_POWS,
  pawnSlugCanRescuePow,
  pawnSlugPowMissionBonus,
  pawnSlugPowsForScenario,
  pawnSlugRescuePow,
} from './pawnSlugPows.js';

describe('Pawn Slug POW rescues', () => {
  it('places stable one-shot POWs across premium scenarios', () => {
    expect(PAWN_SLUG_POW_META.rescueMode).toBe('contact-one-shot');
    expect(PAWN_SLUG_POW_META.total).toBe(PAWN_SLUG_POWS.length);
    expect(pawnSlugPowsForScenario('gambit-ruins')).toHaveLength(1);
    expect(new Set(PAWN_SLUG_POWS.map((pow) => pow.id)).size).toBe(PAWN_SLUG_POWS.length);
  });

  it('rewards first rescue and rejects farming the same prisoner', () => {
    const pow = PAWN_SLUG_POWS[0];
    const rescued = new Set();
    expect(pawnSlugCanRescuePow(pow, rescued)).toBe(true);
    expect(pawnSlugRescuePow(pow, rescued)).toMatchObject({ ok: true, rescuedId: pow.id, reward: pow.reward });
    rescued.add(pow.id);
    expect(pawnSlugCanRescuePow(pow, rescued)).toBe(false);
    expect(pawnSlugRescuePow(pow, rescued)).toEqual({ ok: false, reward: null, rescuedId: null });
  });

  it('keeps POW rewards inside the existing economy vocabulary', () => {
    for (const pow of PAWN_SLUG_POWS) {
      expect(Object.keys(pow.reward).every((key) => ['credits', 'ammo', 'grenades'].includes(key))).toBe(true);
    }
  });

  it('adds an explicit all-rescued mission bonus', () => {
    expect(pawnSlugPowMissionBonus(0)).toBe(0);
    expect(pawnSlugPowMissionBonus(1)).toBe(350);
    expect(pawnSlugPowMissionBonus(PAWN_SLUG_POWS.length)).toBe(PAWN_SLUG_POWS.length * 350 + PAWN_SLUG_POW_META.allRescuedBonus);
  });
});
