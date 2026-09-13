import { describe, expect, it } from 'vitest';
import { chroniclesReduce, createChroniclesState } from './chroniclesOfMatthias.js';
import { chroniclesRetaliationCue } from './chroniclesOfMatthiasRetaliation.js';

function attack(state, memberId) {
  return chroniclesReduce(state, { type: 'attack', memberId });
}

describe('Chronicles enemy retaliation cues', () => {
  it('does not fake a retaliation for a ranged hit outside enemy reach', () => {
    const previous = createChroniclesState();
    const next = attack(previous, 'bishop');

    expect(next.enemyHp).toBe(5);
    expect(chroniclesRetaliationCue(previous, next)).toBeNull();
  });

  it('identifies the corrupted pawn when it actually damages the front line', () => {
    const start = createChroniclesState();
    const previous = chroniclesReduce(start, 'forward');
    const next = attack(previous, 'rook');

    expect(chroniclesRetaliationCue(previous, next)).toEqual({
      enemyId: 'corrupted-pawn',
      targetId: 'rook',
      targetName: 'Hildegard',
      damage: 1,
    });
  });

  it('identifies the spectral bishop retaliation at distance two', () => {
    const previous = {
      ...createChroniclesState(),
      x: 5,
      y: 5,
      direction: 0,
      enemyHp: 0,
      sigilAwake: true,
    };
    const next = attack(previous, 'bishop');

    expect(chroniclesRetaliationCue(previous, next)).toMatchObject({
      enemyId: 'spectral-bishop',
      targetId: 'matthias',
      damage: 1,
    });
  });

  it('does not show retaliation when the enemy dies from the hit', () => {
    const previous = { ...createChroniclesState(), x: 2, enemyHp: 1 };
    const next = attack(previous, 'matthias');

    expect(next.enemyHp).toBe(0);
    expect(chroniclesRetaliationCue(previous, next)).toBeNull();
  });
});
