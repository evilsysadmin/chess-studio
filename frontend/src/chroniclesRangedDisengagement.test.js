import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import {
  chroniclesChooseEnemyDisengageStep,
  chroniclesResolveEnemyActor,
} from './chroniclesOfMatthiasTurns.js';
import { chroniclesMapById } from './chronicles/chroniclesMapCatalog.js';

describe('Chronicles ranged disengagement', () => {
  it('backs a ranged enemy away from an adjacent party when a safer square exists', () => {
    const enemy = chroniclesMapById('echo-cistern').enemies.find((entry) => entry.id === 'brine-wisp');
    const state = {
      ...createChroniclesState('echo-cistern'),
      x: 3,
      y: 8,
      enemyPositions: { 'brine-wisp': { x: 2, y: 8 } },
    };

    expect(enemy.ai.disengageRange).toBe(1);
    expect(chroniclesChooseEnemyDisengageStep(state, enemy)).toBeTruthy();

    const resolved = chroniclesResolveEnemyActor(state, enemy.id);
    expect(resolved.enemyTurnEvents[0]).toMatchObject({
      type: 'move',
      enemyId: 'brine-wisp',
      from: { x: 2, y: 8 },
    });
  });

  it('keeps the Foundry artificer on the same close-range survival contract', () => {
    const enemy = chroniclesMapById('iron-foundry').enemies.find((entry) => entry.id === 'ember-artificer');
    expect(enemy.ai.disengageRange).toBe(1);
  });
});
