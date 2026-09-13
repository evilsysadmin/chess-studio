import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import { chroniclesTargetAhead } from './chroniclesOfMatthiasTargeting.js';

describe('Chronicles tactical target margin', () => {
  it('shows only enemies the selected reach can actually hit', () => {
    const state = createChroniclesState();

    expect(chroniclesTargetAhead(state, 1)).toBeNull();
    expect(chroniclesTargetAhead(state, 2)).toMatchObject({
      id: 'corrupted-pawn',
      hp: 6,
      maxHp: 6,
      distance: 2,
      willRetaliate: false,
    });
  });

  it('reports the spectral bishop ranged retaliation honestly', () => {
    const state = {
      ...createChroniclesState(),
      x: 5,
      y: 5,
      direction: 0,
      enemyHp: 0,
      sigilAwake: true,
    };

    expect(chroniclesTargetAhead(state, 2)).toMatchObject({
      id: 'spectral-bishop',
      distance: 2,
      retaliationReach: 2,
      willRetaliate: true,
    });
  });

  it('tracks the scavenger knight current square instead of its authored spawn', () => {
    const state = {
      ...createChroniclesState(),
      x: 1,
      y: 4,
      direction: 0,
      enemyHp: 0,
      sigilAwake: true,
      jailerHp: 0,
      scavengerHp: 4,
      scavengerPosition: 'west',
    };

    expect(chroniclesTargetAhead(state, 2)).toMatchObject({ id: 'scavenger-knight', distance: 2 });
    expect(chroniclesTargetAhead({ ...state, scavengerPosition: 'gate' }, 2)).toBeNull();
  });
});
