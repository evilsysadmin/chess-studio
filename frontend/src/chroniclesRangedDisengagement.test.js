import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import {
  chroniclesEnemyCanAttackParty,
  chroniclesResolveEnemyActor,
} from './chroniclesOfMatthiasTurns.js';
import { chroniclesMapById } from './chronicles/chroniclesMapCatalog.js';

function hpById(state) {
  return Object.fromEntries(state.party.map((member) => [member.id, member.hp]));
}

describe('Chronicles ranged disengagement', () => {
  it('lets the brine wisp back away instead of shooting point-blank when it has room', () => {
    const enemy = chroniclesMapById('echo-cistern').enemies.find((entry) => entry.id === 'brine-wisp');
    const state = {
      ...createChroniclesState('echo-cistern'),
      x: 3,
      y: 8,
      enemyPositions: { 'brine-wisp': { x: 2, y: 8 } },
    };
    const hpBefore = hpById(state);

    expect(enemy.ai).toMatchObject({ movement: 'hold', attackReach: 2, disengageRange: 1 });
    expect(chroniclesEnemyCanAttackParty(state, enemy)).toBe(true);

    const resolved = chroniclesResolveEnemyActor(state, enemy.id);
    expect(resolved.enemyTurnEvents).toEqual([
      expect.objectContaining({
        type: 'move',
        enemyId: 'brine-wisp',
        from: { x: 2, y: 8 },
        to: { x: 1, y: 8 },
      }),
    ]);
    expect(hpById(resolved)).toEqual(hpBefore);
    expect(resolved.enemyTurnEvents.some((event) => event.type === 'attack')).toBe(false);
  });

  it('keeps firing from its intended range once the party is no longer adjacent', () => {
    const enemy = chroniclesMapById('echo-cistern').enemies.find((entry) => entry.id === 'brine-wisp');
    const state = {
      ...createChroniclesState('echo-cistern'),
      x: 4,
      y: 8,
      enemyPositions: { 'brine-wisp': { x: 2, y: 8 } },
    };

    expect(chroniclesEnemyCanAttackParty(state, enemy)).toBe(true);
    const resolved = chroniclesResolveEnemyActor(state, enemy.id);
    expect(resolved.enemyTurnEvents[0]).toMatchObject({
      type: 'attack',
      enemyId: 'brine-wisp',
      damage: 1,
    });
  });

  it('gives the Foundry artificer the same close-range survival instinct', () => {
    const enemy = chroniclesMapById('iron-foundry').enemies.find((entry) => entry.id === 'ember-artificer');
    const state = {
      ...createChroniclesState('iron-foundry'),
      x: 9,
      y: 4,
      enemyPositions: { 'ember-artificer': { x: 9, y: 3 } },
    };

    const resolved = chroniclesResolveEnemyActor(state, enemy.id);
    const move = resolved.enemyTurnEvents[0];

    expect(enemy.ai.disengageRange).toBe(1);
    expect(move).toMatchObject({
      type: 'move',
      enemyId: 'ember-artificer',
      from: { x: 9, y: 3 },
    });
    expect(Math.abs(move.to.x - state.x) + Math.abs(move.to.y - state.y)).toBeGreaterThan(1);
  });
});
