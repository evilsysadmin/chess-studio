import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_ENEMY_ACQUISITION_META,
  pawnSlugEnemyAcquisitionStep,
} from './pawnSlugEnemyAcquisition.js';

describe('Pawn Slug enemy target acquisition', () => {
  it('cancels only the random initial delay on first sight', () => {
    expect(pawnSlugEnemyAcquisitionStep({ acquired: false, canEngage: true, fireCooldown: 1.37 })).toEqual({
      acquired: true,
      acquiredNow: true,
      fireCooldown: 0,
    });
    expect(pawnSlugEnemyAcquisitionStep({ acquired: true, canEngage: true, fireCooldown: 0.72 })).toEqual({
      acquired: true,
      acquiredNow: false,
      fireCooldown: 0.72,
    });
  });

  it('does not wake an enemy before the player enters its valid engagement envelope', () => {
    expect(pawnSlugEnemyAcquisitionStep({ acquired: false, canEngage: false, fireCooldown: 1.1 })).toEqual({
      acquired: false,
      acquiredNow: false,
      fireCooldown: 1.1,
    });
  });

  it('remembers a sighting so repeated peeking cannot reset cadence', () => {
    const acquired = pawnSlugEnemyAcquisitionStep({ acquired: false, canEngage: true, fireCooldown: 2 });
    const hidden = pawnSlugEnemyAcquisitionStep({ acquired: acquired.acquired, canEngage: false, fireCooldown: 0.44 });
    expect(hidden).toEqual({ acquired: true, acquiredNow: false, fireCooldown: 0.44 });
    expect(PAWN_SLUG_ENEMY_ACQUISITION_META.dangerousWeaponsKeepPrefireTelegraph).toBe(true);
  });
});
