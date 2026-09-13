import { describe, expect, it } from 'vitest';
import { chroniclesReduce, createChroniclesState } from './chroniclesOfMatthias.js';

function attack(state, memberId) {
  return chroniclesReduce(state, { type: 'attack', memberId });
}

function adjacentToOpeningPawn() {
  return chroniclesReduce(createChroniclesState(), 'forward');
}

describe('Chronicles front-line collapse', () => {
  it('exposes the attacking backliner when no front piece is still standing', () => {
    let state = adjacentToOpeningPawn();
    state = {
      ...state,
      party: state.party.map((member) => (
        member.row === 'front' ? { ...member, hp: 0 } : member
      )),
    };

    const before = state.party.find((member) => member.id === 'bishop').hp;
    state = attack(state, 'bishop');

    expect(state.enemyHp).toBe(5);
    expect(state.party.find((member) => member.id === 'bishop').hp).toBe(before - 1);
    expect(state.message).toMatch(/alcanza a Aziz/i);
  });

  it('keeps a surviving front piece protecting the backline', () => {
    let state = adjacentToOpeningPawn();
    state = {
      ...state,
      party: state.party.map((member) => (
        member.id === 'matthias' ? { ...member, hp: 0 } : member
      )),
    };

    const rookBefore = state.party.find((member) => member.id === 'rook').hp;
    const bishopBefore = state.party.find((member) => member.id === 'bishop').hp;
    state = attack(state, 'bishop');

    expect(state.party.find((member) => member.id === 'rook').hp).toBe(rookBefore - 1);
    expect(state.party.find((member) => member.id === 'bishop').hp).toBe(bishopBefore);
    expect(state.message).toMatch(/alcanza a Hildegard/i);
  });
});
