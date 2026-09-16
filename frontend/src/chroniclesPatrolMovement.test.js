import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import { chroniclesValidateMapDefinition } from './chronicles/chroniclesMapCatalog.js';
import { chroniclesChooseEnemyStep } from './chroniclesOfMatthiasTurns.js';

describe('Chronicles patrol-route enemy AI', () => {
  it('accepts a map-authored cardinal patrol loop and freezes its normalized route', () => {
    const map = chroniclesValidateMapDefinition({
      id: 'patrol-room',
      title: 'Patrol room',
      grid: ['######', '#....#', '#....#', '#....#', '#..X.#', '######'],
      partyStart: { x: 1, y: 1, direction: 1 },
      initialFlags: {},
      enemies: [{
        id: 'crypt-stalker',
        visualType: 'crypt-stalker',
        name: 'acechador de cripta',
        x: 2,
        y: 2,
        hpKey: 'cryptStalkerHp',
        maxHp: 4,
        retaliation: 1,
        activation: 'always',
        ai: {
          movement: 'patrol-route',
          attackReach: 1,
          patrolRoute: [
            { x: 2, y: 2 },
            { x: 3, y: 2 },
            { x: 3, y: 3 },
            { x: 2, y: 3 },
          ],
        },
      }],
      triggers: [],
      interactables: [],
      treasures: [],
      traps: [],
      exits: [{
        id: 'exit',
        kind: 'exit',
        tile: 'X',
        openLabel: 'Salir',
        lockedLabel: 'Mirar',
        action: { effects: [{ type: 'set', key: 'phase', value: 'escaped' }] },
      }],
      initialJournal: { id: 'entry', title: 'Entry', body: 'Entry', sigil: 'I' },
      introMessage: 'Entry',
    });

    expect(map.enemies[0].ai.movement).toBe('patrol-route');
    expect(map.enemies[0].ai.patrolRoute).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
      { x: 2, y: 3 },
    ]);
    expect(Object.isFrozen(map.enemies[0].ai.patrolRoute)).toBe(true);
  });

  it('moves along the authored route instead of homing toward the party', () => {
    const state = createChroniclesState('gallery-of-forks');
    const patrolEnemy = {
      id: 'wandering-goblin',
      x: 2,
      y: 3,
      ai: {
        movement: 'patrol-route',
        attackReach: 1,
        patrolRoute: [{ x: 2, y: 3 }, { x: 3, y: 3 }],
      },
    };

    expect(chroniclesChooseEnemyStep(state, patrolEnemy)).toEqual({ x: 3, y: 3 });
    expect(chroniclesChooseEnemyStep({
      ...state,
      enemyPositions: { [patrolEnemy.id]: { x: 3, y: 3 } },
    }, patrolEnemy)).toEqual({ x: 2, y: 3 });
  });

  it('waits instead of walking through the party when its next patrol cell is occupied', () => {
    const state = {
      ...createChroniclesState('gallery-of-forks'),
      x: 3,
      y: 3,
    };
    const patrolEnemy = {
      id: 'wandering-goblin',
      x: 2,
      y: 3,
      ai: {
        movement: 'patrol-route',
        attackReach: 1,
        patrolRoute: [{ x: 2, y: 3 }, { x: 3, y: 3 }],
      },
    };

    expect(chroniclesChooseEnemyStep(state, patrolEnemy)).toBeNull();
  });

  it('rejects patrol routes that jump cells or do not contain the enemy spawn', () => {
    const base = {
      id: 'broken-patrol-room',
      title: 'Broken patrol room',
      grid: ['######', '#....#', '#....#', '#..X.#', '######'],
      partyStart: { x: 1, y: 1, direction: 1 },
      initialFlags: {},
      triggers: [],
      interactables: [],
      treasures: [],
      traps: [],
      exits: [{
        id: 'exit',
        kind: 'exit',
        tile: 'X',
        openLabel: 'Salir',
        lockedLabel: 'Mirar',
        action: { effects: [{ type: 'set', key: 'phase', value: 'escaped' }] },
      }],
      initialJournal: { id: 'entry', title: 'Entry', body: 'Entry', sigil: 'I' },
      introMessage: 'Entry',
    };
    const enemy = {
      id: 'stalker',
      x: 2,
      y: 2,
      hpKey: 'stalkerHp',
      maxHp: 3,
      retaliation: 1,
      activation: 'always',
      ai: { movement: 'patrol-route', attackReach: 1 },
    };

    expect(() => chroniclesValidateMapDefinition({
      ...base,
      enemies: [{ ...enemy, ai: { ...enemy.ai, patrolRoute: [{ x: 2, y: 2 }, { x: 4, y: 2 }] } }],
    })).toThrow(/cardinal-adjacent/i);

    expect(() => chroniclesValidateMapDefinition({
      ...base,
      enemies: [{ ...enemy, ai: { ...enemy.ai, patrolRoute: [{ x: 1, y: 2 }, { x: 1, y: 1 }] } }],
    })).toThrow(/must include its spawn/i);
  });
});
