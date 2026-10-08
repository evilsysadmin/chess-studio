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

  it('never performs legacy immediate retaliation while initiative combat is active', () => {
    const adjacent = chroniclesReduce(createChroniclesState(), 'forward');
    const previous = {
      ...adjacent,
      phase: 'combat',
      initiative: {
        version: 1,
        die: '1d8',
        round: 1,
        cursor: 0,
        order: [
          { id: 'rook', kind: 'party', name: 'Hildegard', agility: 2, roll: 8, initiative: 10 },
          { id: 'corrupted-pawn', kind: 'enemy', name: 'Peón corrompido', agility: 2, roll: 4, initiative: 6 },
        ],
      },
    };
    const hpBefore = previous.party.find((member) => member.id === 'rook').hp;
    const next = attack(previous, 'rook');

    expect(next.enemyHp).toBe(previous.enemyHp - 2);
    expect(next.party.find((member) => member.id === 'rook').hp).toBe(hpBefore);
    expect(chroniclesRetaliationCue(previous, next)).toBeNull();
  });

  it('identifies the corrupted pawn when it actually damages the front line', () => {
    const start = createChroniclesState();
    const previous = chroniclesReduce(start, 'forward');
    const next = attack(previous, 'rook');

    expect(chroniclesRetaliationCue(previous, next)).toMatchObject({
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

  it('ignores stale enemy HP from another map when deriving retaliation', () => {
    const previous = {
      ...createChroniclesState('gallery-of-forks'),
      spectralBishopHp: 3,
    };
    const next = {
      ...previous,
      spectralBishopHp: 2,
      party: previous.party.map((member) => member.id === 'matthias'
        ? { ...member, hp: member.hp - 1 }
        : member),
    };

    expect(chroniclesRetaliationCue(previous, next)).toBeNull();
  });

  it('does not show retaliation when the enemy dies from the hit', () => {
    const previous = { ...createChroniclesState(), x: 2, enemyHp: 1 };
    const next = attack(previous, 'matthias');

    expect(next.enemyHp).toBe(0);
    expect(chroniclesRetaliationCue(previous, next)).toBeNull();
  });
  it('recognizes initiative enemy attacks even when enemy HP does not change', () => {
    const previous = {
      ...createChroniclesState(),
      party: createChroniclesState().party.map((member) => (
        member.id === 'matthias' ? { ...member, hp: 7 } : member
      )),
      enemyTurnEvents: [],
    };
    const next = {
      ...previous,
      party: previous.party.map((member) => (
        member.id === 'matthias' ? { ...member, hp: 6 } : member
      )),
      enemyTurnEvents: [{
        type: 'attack',
        enemyId: 'corrupted-pawn',
        targetId: 'matthias',
        damage: 1,
        fromHp: 7,
        toHp: 6,
      }],
    };

    expect(chroniclesRetaliationCue(previous, next)).toMatchObject({
      enemyId: 'corrupted-pawn',
      targetId: 'matthias',
      targetName: 'Matthias',
      damage: 1,
    });
  });

});
