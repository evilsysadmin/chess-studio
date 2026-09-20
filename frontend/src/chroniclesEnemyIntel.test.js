import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import { chroniclesTacticsTargets } from './chroniclesOfMatthiasTactics.js';

describe('Chronicles Tactics · enemy RPG intel', () => {
  it('exposes the same EnemyBuild used by combat through target intel', () => {
    const state = {
      ...createChroniclesState('crypt-eight-squares'),
      round: 1,
      turnPhase: 'party',
      enemyPositions: {},
      enemyTurnEvents: [],
    };

    const target = chroniclesTacticsTargets(state, 'bishop')[0];
    expect(target.enemyId).toBe('corrupted-pawn');
    expect(target.enemyBuild).toEqual(expect.objectContaining({
      version: 1,
      level: expect.any(Number),
      archetype: 'corrupted-pawn',
      attributes: expect.objectContaining({ vigor: 1 }),
    }));
    expect(target.enemyBuild.skills).toContainEqual(expect.objectContaining({
      id: 'brutal-strike',
      label: 'Golpe brutal',
    }));
  });
});
