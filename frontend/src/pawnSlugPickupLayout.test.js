import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_PICKUPS,
  PAWN_SLUG_PICKUPS_BY_SCENARIO,
  pawnSlugPickupsForScenario,
} from './pawnSlugPickupLayout.js';

describe('Pawn Slug pickup layout', () => {
  it('preserves the canonical pickup order and positions', () => {
    expect(PAWN_SLUG_PICKUPS).toEqual([
      { x: 920, type: 'machinegun' },
      { x: 1810, type: 'grenade' },
      { x: 2470, type: 'shotgun' },
      { x: 3300, type: 'medkit' },
      { x: 3500, type: 'panzerfaust' },
      { x: 4310, type: 'grenade' },
    ]);
  });

  it('authors pickups through the four existing scenarios', () => {
    expect(Object.keys(PAWN_SLUG_PICKUPS_BY_SCENARIO)).toEqual([
      'fallen-forest',
      'gambit-ruins',
      'castle-dungeon',
      'fortress-approach',
    ]);
    expect(pawnSlugPickupsForScenario('fortress-approach')).toHaveLength(3);
    expect(pawnSlugPickupsForScenario('unknown')).toEqual([]);
  });
});
