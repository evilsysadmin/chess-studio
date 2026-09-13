import { describe, expect, it } from 'vitest';
import {
  chroniclesObjective,
  chroniclesReduce,
  createChroniclesState,
} from './chroniclesOfMatthias.js';

function act(state, ...actions) {
  return actions.reduce((current, action) => chroniclesReduce(current, action), state);
}

describe('Chronicles of Matthias vertical slice', () => {
  it('keeps the corrupted pawn as a real blocker until combat resolves it', () => {
    let state = createChroniclesState();
    state = chroniclesReduce(state, 'forward');
    expect(state.x).toBe(2);
    state = chroniclesReduce(state, 'forward');
    expect(state.x).toBe(2);
    expect(state.enemyHp).toBe(2);

    state = chroniclesReduce(state, 'attack');
    expect(state.enemyHp).toBe(1);
    expect(state.party[0].hp).toBe(6);
    state = chroniclesReduce(state, 'attack');
    expect(state.enemyHp).toBe(0);
    expect(chroniclesObjective(state)).toBe('Encuentra y pisa el sello');

    state = chroniclesReduce(state, 'forward');
    expect([state.x, state.y]).toEqual([3, 5]);
  });

  it('requires the sigil before the black gate can finish the expedition', () => {
    let state = createChroniclesState();
    state = act(state, 'forward', 'attack', 'attack', 'forward', 'turn-left', 'forward');
    expect([state.x, state.y]).toEqual([3, 4]);
    expect(state.sigilAwake).toBe(true);
    expect(chroniclesObjective(state)).toBe('Regresa a la puerta negra');

    state = act(
      state,
      'turn-right', 'forward', 'forward',
      'turn-left', 'forward', 'forward', 'forward', 'forward',
      'turn-left', 'forward', 'forward',
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
