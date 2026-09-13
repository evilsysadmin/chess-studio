import { describe, expect, it } from 'vitest';
import {
  chroniclesActiveEnemies,
  chroniclesEnemyDistanceAhead,
  chroniclesJournalEntries,
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

function clearOpeningPawn(state) {
  let next = chroniclesReduce(state, 'forward');
  next = attack(next, 'rook');
  next = attack(next, 'rook');
  next = attack(next, 'rook');
  return next;
}

function awakenSigil(state) {
  return act(state, 'forward', 'turn-left', 'forward');
}

function reachGateApproach(state) {
  return act(
    state,
    'forward',
    'turn-left', 'forward', 'forward',
    'turn-right', 'forward', 'forward',
    'turn-right', 'forward',
  );
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

  it('wakes a second, distinct gate encounter only after the sigil is activated', () => {
    let state = createChroniclesState();
    expect(chroniclesActiveEnemies(state).map((enemy) => enemy.id)).toEqual(['corrupted-pawn']);

    state = clearOpeningPawn(state);
    state = awakenSigil(state);

    expect(state.sigilAwake).toBe(true);
    expect(chroniclesActiveEnemies(state).map((enemy) => enemy.id)).toEqual(['gate-jailer']);
    expect(chroniclesObjective(state)).toBe('Derrota a la torre carcelero');
    expect(state.message).toMatch(/algo pesado/i);
  });

  it('makes the gate jailer a stronger blocker before the exit can finish the expedition', () => {
    let state = awakenSigil(clearOpeningPawn(createChroniclesState()));
    state = reachGateApproach(state);
    expect([state.x, state.y, state.direction]).toEqual([2, 1, 1]);
    expect(chroniclesEnemyDistanceAhead(state, 1)).toBe(1);

    const blocked = chroniclesReduce(state, 'forward');
    expect([blocked.x, blocked.y]).toEqual([2, 1]);
    expect(blocked.message).toMatch(/torre carcelero/i);

    state = blocked;
    const hpBefore = state.party.find((member) => member.id === 'rook')?.hp;
    state = attack(state, 'rook');
    expect(state.jailerHp).toBe(6);
    expect(state.party.find((member) => member.id === 'rook')?.hp).toBe(hpBefore - 2);
    state = attack(state, 'rook');
    state = attack(state, 'rook');
    state = attack(state, 'rook');
    expect(state.jailerHp).toBe(0);
    expect(chroniclesObjective(state)).toBe('Cruza la puerta negra');

    state = chroniclesReduce(state, 'forward');
    expect(state.phase).toBe('escaped');
    expect(chroniclesObjective(state)).toBe('Vertical slice completado');
  });

  it('records only real expedition milestones instead of logging routine movement', () => {
    let state = createChroniclesState();
    expect(chroniclesJournalEntries(state).map((entry) => entry.id)).toEqual(['descent']);

    state = act(state, 'turn-left', 'turn-right', 'backward');
    expect(chroniclesJournalEntries(state).map((entry) => entry.id)).toEqual(['descent']);

    state = clearOpeningPawn(createChroniclesState());
    expect(chroniclesJournalEntries(state).map((entry) => entry.id)).toEqual(['descent', 'corrupted-pawn-falls']);

    state = awakenSigil(state);
    expect(chroniclesJournalEntries(state).map((entry) => entry.id)).toEqual(['descent', 'corrupted-pawn-falls', 'sigil-awake']);

    state = reachGateApproach(state);
    state = attack(state, 'rook');
    state = attack(state, 'rook');
    state = attack(state, 'rook');
    state = attack(state, 'rook');
    expect(chroniclesJournalEntries(state).some((entry) => entry.id === 'gate-jailer-falls')).toBe(true);

    state = chroniclesReduce(state, 'forward');
    expect(chroniclesJournalEntries(state).at(-1)?.id).toBe('escape');
  });

  it('records a party member only when they actually fall', () => {
    let state = awakenSigil(clearOpeningPawn(createChroniclesState()));
    state = reachGateApproach(state);
    state = { ...state, party: state.party.map((member) => member.id === 'rook' ? { ...member, hp: 2 } : member) };
    state = attack(state, 'rook');
    const fall = chroniclesJournalEntries(state).find((entry) => entry.id === 'down-rook');
    expect(fall?.title).toMatch(/Hildegard cae/i);
    expect(state.party.find((member) => member.id === 'rook')?.hp).toBe(0);
  });

  it('does not let the party walk through stone', () => {
    const state = chroniclesReduce(createChroniclesState(), 'backward');
    expect([state.x, state.y]).toEqual([1, 5]);
    expect(state.message).toMatch(/pared/i);
  });
});
