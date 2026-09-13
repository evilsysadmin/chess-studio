import { describe, expect, it } from 'vitest';
import {
  chroniclesEnemyDistanceAhead,
  chroniclesObjective,
  chroniclesReduce,
  createChroniclesState,
} from './chroniclesOfMatthias.js';

function act(state, ...actions) {
  return actions.reduce((current, action) => chroniclesReduce(current, action), state);
}

function attack(state, memberId) {
  return chroniclesReduce(state, { type: 'attack', memberId });
}

describe('Chronicles of Matthias vertical slice', () => {
  it('turns the four-piece party into positional combat instead of one generic attack', () => {
    let state = createChroniclesState();
    expect(chroniclesEnemyDistanceAhead(state, 1)).toBeNull();
    expect(chroniclesEnemyDistanceAhead(state, 2)).toBe(2);

    state = attack(state, 'bishop');
    expect(state.enemyHp).toBe(5);
    expect(state.party.map((member) => member.hp)).toEqual([7, 10, 6, 8]);
    expect(state.message).toMatch(/retaguardia/i);

    state = chroniclesReduce(state, 'forward');
    state = attack(state, 'rook');
    expect(state.enemyHp).toBe(3);
    expect(state.party.find((member) => member.id === 'rook')?.hp).toBe(9);

    state = attack(state, 'rook');
    expect(state.enemyHp).toBe(1);
    expect(state.party.find((member) => member.id === 'rook')?.hp).toBe(8);

    state = attack(state, 'matthias');
    expect(state.enemyHp).toBe(0);
    expect(state.party.find((member) => member.id === 'matthias')?.hp).toBe(7);
    expect(chroniclesObjective(state)).toBe('Encuentra y pisa el sello');
  });

  it('keeps the corrupted pawn as a real blocker until combat resolves it', () => {
    let state = createChroniclesState();
    state = chroniclesReduce(state, 'forward');
    expect(state.x).toBe(2);
    state = chroniclesReduce(state, 'forward');
    expect(state.x).toBe(2);
    expect(state.enemyHp).toBe(6);

    state = attack(state, 'rook');
    state = attack(state, 'rook');
    state = attack(state, 'rook');
    expect(state.enemyHp).toBe(0);

    state = chroniclesReduce(state, 'forward');
    expect([state.x, state.y]).toEqual([3, 5]);
  });

  it('requires the sigil before the black gate can finish the expedition', () => {
    let state = createChroniclesState();
    state = chroniclesReduce(state, 'forward');
    state = attack(state, 'rook');
    state = attack(state, 'rook');
    state = attack(state, 'rook');
    state = act(state, 'forward', 'turn-left', 'forward');
    expect([state.x, state.y]).toEqual([3, 4]);
    expect(state.sigilAwake).toBe(true);
    expect(chroniclesObjective(state)).toBe('Regresa a la puerta negra');

    state = act(
      state,
      'forward',
      'turn-left', 'forward', 'forward',
      'turn-right', 'forward', 'forward',
      'turn-right', 'forward', 'forward',
    );
    expect(state.phase).toBe('escaped');
    expect(chroniclesObjective(state)).toBe('Vertical slice completado');
  });

  it('does not let the party walk through stone', () => {
    const state = chroniclesReduce(createChroniclesState(), 'backward');
    expect([state.x, state.y]).toEqual([1, 5]);
    expect(state.message).toMatch(/pared/i);
  });
});
