import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_WANTED_META, pawnSlugWantedCreditBonus, pawnSlugWantedOfficerFor } from './pawnSlugWantedOfficers.js';

describe('Pawn Slug wanted officers', () => {
  it('keeps officers rare, deterministic and limited to normal soldier classes', () => {
    expect(PAWN_SLUG_WANTED_META.frequency).toBe('rare-deterministic');
    expect(PAWN_SLUG_WANTED_META.eligibleTypes).toEqual(['pawn', 'knight', 'rook']);
    expect(pawnSlugWantedOfficerFor({ id: 'bishop-1', type: 'bishop' })).toBeNull();
    const first = pawnSlugWantedOfficerFor({ id: 'pawn-0', type: 'pawn' });
    const second = pawnSlugWantedOfficerFor({ id: 'pawn-0', type: 'pawn' });
    expect(second).toEqual(first);
  });

  it('rewards threat without turning officers into hp sponges', () => {
    let officer = null;
    for (let index = 0; index < 100 && !officer; index += 1) officer = pawnSlugWantedOfficerFor({ id: `knight-${index}`, type: 'knight' });
    expect(officer).not.toBeNull();
    expect(officer).not.toHaveProperty('hp');
    expect(officer.aggression).toBeGreaterThan(1);
    expect(officer.aggression).toBeLessThanOrEqual(PAWN_SLUG_WANTED_META.maxAggressionMultiplier);
    expect(pawnSlugWantedCreditBonus(officer)).toBeGreaterThan(0);
  });

  it('does not invent a bounty for ordinary enemies', () => {
    expect(pawnSlugWantedCreditBonus(null)).toBe(0);
    expect(pawnSlugWantedCreditBonus({ wanted: false, creditBonus: 999 })).toBe(0);
  });
});
