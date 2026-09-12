import { describe, expect, it } from 'vitest';
import { pawnSlugModelArmoryHighlights } from './pawnSlugModelArmoryHighlights.js';

describe('Pawn Slug model armory highlights', () => {
  it('shows only model modifiers that currently affect live combat', () => {
    expect(pawnSlugModelArmoryHighlights({
      damage: 1.12,
      cadence: 0.9,
      spread: 0.82,
      recoil: 0.5,
      capacity: 1.5,
    })).toEqual([
      ['Precisión', 22],
      ['Daño', 12],
    ]);
  });

  it('does not advertise recoil or capacity while they are not wired into runtime', () => {
    expect(pawnSlugModelArmoryHighlights({
      damage: 1,
      cadence: 1,
      spread: 1,
      recoil: 0.5,
      capacity: 1.5,
    })).toEqual([['Equilibrio', 0]]);
  });
});
