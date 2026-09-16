import { describe, expect, it } from 'vitest';
import { CHRONICLES_ENEMIES, createChroniclesState } from './chroniclesOfMatthias.js';
import {
  chroniclesChooseEnemyStep,
  chroniclesEnemyCanAttackParty,
  chroniclesResolveEnemyTurn,
  chroniclesRuntimeEnemyPosition,
} from './chroniclesOfMatthiasTurns.js';

function enemy(id) {
  return CHRONICLES_ENEMIES.find((entry) => entry.id === id);
}

describe('Chronicles alternating creature turns', () => {
  it('moves a melee creature one cell, then attacks on its following turn', () => {
    const pawn = enemy('corrupted-pawn');
    let state = createChroniclesState();

    state = chroniclesResolveEnemyTurn(state);
    expect(chroniclesRuntimeEnemyPosition(state, pawn)).toEqual({ x: 2, y: 5 });
    expect(state.enemyTurnEvents).toEqual([
      { type: 'move', enemyId: 'corrupted-pawn', from: { x: 3, y: 5 }, to: { x: 2, y: 5 } },
    ]);
    expect(state.party.find((member) => member.id === 'matthias')?.hp).toBe(7);

    state = chroniclesResolveEnemyTurn(state);
    expect(chroniclesRuntimeEnemyPosition(state, pawn)).toEqual({ x: 2, y: 5 });
    expect(state.enemyTurnEvents[0]).toMatchObject({ type: 'attack', enemyId: 'corrupted-pawn', damage: 1 });
    expect(state.party.find((member) => member.id === 'matthias')?.hp).toBe(7);
    expect(state.party.find((member) => member.id === 'rook')?.hp).toBe(9);
  });

  it('lets the spectral bishop attack down a clear two-cell lane without moving first', () => {
    const bishop = enemy('spectral-bishop');
    const state = {
      ...createChroniclesState(),
      x: 5,
      y: 5,
      enemyHp: 0,
      jailerHp: 0,
      spectralBishopHp: 5,
      scavengerHp: 0,
      sigilAwake: true,
    };

    expect(chroniclesEnemyCanAttackParty(state, bishop)).toBe(true);
    const next = chroniclesResolveEnemyTurn(state);
    expect(next.enemyTurnEvents[0]).toMatchObject({ type: 'attack', enemyId: 'spectral-bishop' });
    expect(chroniclesRuntimeEnemyPosition(next, bishop)).toEqual({ x: 5, y: 3 });
  });

  it('keeps the scavenger knight movement chess-authentic once the party enters its engagement range', () => {
    const knight = enemy('scavenger-knight');
    const state = {
      ...createChroniclesState(),
      x: 5,
      y: 3,
      enemyHp: 0,
      jailerHp: 0,
      spectralBishopHp: 0,
      scavengerHp: 6,
      sigilAwake: true,
    };

    const from = chroniclesRuntimeEnemyPosition(state, knight);
    const next = chroniclesResolveEnemyTurn(state);
    const to = chroniclesRuntimeEnemyPosition(next, knight);
    const delta = [Math.abs(from.x - to.x), Math.abs(from.y - to.y)].sort((a, b) => a - b);

    expect(delta).toEqual([1, 2]);
    expect(next.enemyTurnEvents[0]).toMatchObject({ type: 'move', enemyId: 'scavenger-knight' });
  });

  it('selects movement from enemy AI data rather than hardcoded enemy ids', () => {
    const state = createChroniclesState();
    const basePawn = enemy('corrupted-pawn');

    expect(chroniclesChooseEnemyStep(state, { ...basePawn, ai: { ...basePawn.ai, movement: 'hold' } })).toBeNull();

    const knightPolicyPawn = {
      ...basePawn,
      id: 'map-authored-knight-policy',
      ai: { ...basePawn.ai, movement: 'knight-chase' },
    };
    const step = chroniclesChooseEnemyStep(state, knightPolicyPawn);
    expect(step).not.toBeNull();
    expect([
      Math.abs(step.x - basePawn.x),
      Math.abs(step.y - basePawn.y),
    ].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('marks the expedition defeated when the final living party member falls', () => {
    const state = {
      ...createChroniclesState(),
      x: 2,
      y: 5,
      party: createChroniclesState().party.map((member) => ({
        ...member,
        hp: member.id === 'matthias' ? 1 : 0,
      })),
    };

    const next = chroniclesResolveEnemyTurn(state);
    expect(next.phase).toBe('defeated');
    expect(next.party.every((member) => member.hp <= 0)).toBe(true);
    expect(next.enemyTurnEvents[0]).toMatchObject({ type: 'attack', enemyId: 'corrupted-pawn', targetId: 'matthias' });
  });
});
