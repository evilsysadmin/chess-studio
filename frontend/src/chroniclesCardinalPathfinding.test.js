import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import { chroniclesChooseEnemyStep } from './chroniclesOfMatthiasTurns.js';

describe('Chronicles cardinal chase pathfinding', () => {
  it('routes around a wall instead of following a Manhattan dead end', () => {
    const state = {
      ...createChroniclesState('ash-vault'),
      x: 3,
      y: 1,
      cinderWardenHp: 0,
      sootMimicHp: 0,
      vaultSpiderHp: 0,
      vaultWispHp: 0,
      enemyPositions: {
        'path-hunter': { x: 5, y: 3 },
      },
    };
    const hunter = {
      id: 'path-hunter',
      x: 5,
      y: 3,
      ai: {
        movement: 'cardinal-chase',
        attackReach: 1,
      },
    };

    // Going north to 5,2 looks equally good by Manhattan distance, but it
    // funnels the hunter into the sealed upper-right pocket. The shortest
    // legal route to an attack square starts west through 4,3.
    expect(chroniclesChooseEnemyStep(state, hunter)).toEqual({ x: 4, y: 3 });
  });

  it('keeps chase movement deterministic when two shortest routes exist', () => {
    const state = {
      ...createChroniclesState('gallery-of-forks'),
      x: 1,
      y: 3,
      enemyHp: 0,
      jailerHp: 0,
      enemyPositions: {
        'path-hunter': { x: 5, y: 3 },
      },
    };
    const hunter = {
      id: 'path-hunter',
      x: 5,
      y: 3,
      ai: {
        movement: 'cardinal-chase',
        attackReach: 1,
      },
    };

    expect(chroniclesChooseEnemyStep(state, hunter)).toEqual({ x: 4, y: 3 });
    expect(chroniclesChooseEnemyStep(state, hunter)).toEqual({ x: 4, y: 3 });
  });
});
