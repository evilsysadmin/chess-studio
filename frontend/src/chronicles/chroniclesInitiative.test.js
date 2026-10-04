import { describe, expect, it } from 'vitest';
import {
  chroniclesAdvanceInitiative,
  chroniclesCurrentInitiativeActor,
  chroniclesEnemyInitiativeAgility,
  chroniclesPartyInitiativeAgility,
  chroniclesRollInitiative,
} from './chroniclesInitiative.js';

function sequence(values) {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe('Chronicles initiative', () => {
  it('rolls AGI + 1d8 for every living combatant and sorts highest first', () => {
    const state = {
      party: [
        { id: 'fast', name: 'Fast', hp: 4, agility: 5 },
        { id: 'slow', name: 'Slow', hp: 4, agility: 2 },
        { id: 'down', name: 'Down', hp: 0, agility: 99 },
      ],
      enemyHp: 5,
      rpgModifiers: {},
    };
    const enemies = [{
      id: 'enemy',
      name: 'Enemy',
      hpKey: 'enemyHp',
      maxHp: 5,
      retaliation: 1,
      ai: { movement: 'hold' },
    }];

    const initiative = chroniclesRollInitiative(state, enemies, {
      random: sequence([0, 0.999, 0.5]),
    });

    expect(initiative.die).toBe('1d8');
    expect(initiative.order.map((actor) => [actor.id, actor.agility, actor.roll, actor.initiative])).toEqual([
      ['slow', 2, 8, 10],
      ['fast', 5, 1, 6],
      ['enemy', 1, 5, 6],
    ]);
  });

  it('keeps low-level order chaotic enough for a slower actor to beat a faster one', () => {
    const state = {
      party: [
        { id: 'agi-4', hp: 1, agility: 4 },
        { id: 'agi-6', hp: 1, agility: 6 },
      ],
      rpgModifiers: {},
    };
    const initiative = chroniclesRollInitiative(state, [], {
      random: sequence([0.999, 0]),
    });
    expect(initiative.order.map((actor) => actor.id)).toEqual(['agi-4', 'agi-6']);
    expect(initiative.order[0].initiative).toBe(12);
    expect(initiative.order[1].initiative).toBe(7);
  });

  it('adds progression AGI to the resolved party stat and advances by rounds', () => {
    const state = {
      party: [{ id: 'matthias', hp: 7, agility: 4 }],
      rpgModifiers: { matthias: { initiativeBonus: 3 } },
    };
    expect(chroniclesPartyInitiativeAgility(state, state.party[0])).toBe(7);

    const initiative = chroniclesRollInitiative(state, [], { random: () => 0 });
    expect(chroniclesCurrentInitiativeActor(initiative)?.id).toBe('matthias');
    const next = chroniclesAdvanceInitiative(initiative);
    expect(next.cursor).toBe(0);
    expect(next.round).toBe(2);
  });

  it('derives legacy enemy AGI from movement when no authored AGI exists', () => {
    expect(chroniclesEnemyInitiativeAgility({
      id: 'horse-thing',
      maxHp: 3,
      retaliation: 1,
      ai: { movement: 'knight-chase' },
    })).toBe(4);
  });
});
