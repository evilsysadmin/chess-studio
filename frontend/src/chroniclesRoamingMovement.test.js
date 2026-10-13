import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import { chroniclesMapById } from './chronicles/chroniclesMapCatalog.js';
import { chroniclesChooseEnemyStep } from './chroniclesOfMatthiasTurns.js';

function rawRoamingEnemy() {
  const enemy = chroniclesMapById('menagerie-of-ash').enemies.find((entry) => entry.id === 'bone-hound');
  return {
    ...enemy,
    ai: {
      ...enemy.ai,
      engagedMovement: undefined,
      engageRange: undefined,
    },
  };
}

describe('Chronicles cardinal-roam enemy AI', () => {
  it('moves independently of the party using a deterministic turn rotation', () => {
    const enemy = rawRoamingEnemy();
    const base = {
      ...createChroniclesState('menagerie-of-ash'),
      x: 5,
      y: 5,
      enemyPositions: { 'bone-hound': { x: 3, y: 3 } },
    };

    expect(enemy.ai.movement).toBe('cardinal-roam');
    expect(chroniclesChooseEnemyStep({ ...base, round: 0 }, enemy)).toEqual({ x: 2, y: 3 });
    expect(chroniclesChooseEnemyStep({ ...base, round: 1 }, enemy)).toEqual({ x: 2, y: 3 });
    expect(chroniclesChooseEnemyStep({ ...base, round: 4 }, enemy)).toEqual({ x: 3, y: 2 });
    expect(chroniclesChooseEnemyStep({ ...base, round: 0 }, enemy)).toEqual({ x: 2, y: 3 });
  });

  it('keeps unalerted patrols near their spawn instead of wandering across the map', () => {
    const enemy = rawRoamingEnemy();
    const base = createChroniclesState('menagerie-of-ash');
    const from = { x: enemy.x + 3, y: enemy.y };
    const state = {
      ...base, round: 0, x: 9, y: 9,
      enemyPositions: { 'bone-hound': from },
    };
    const next = chroniclesChooseEnemyStep(state, enemy);
    if (next) {
      expect(Math.abs(next.x - enemy.x) + Math.abs(next.y - enemy.y)).toBeLessThanOrEqual(3);
    }
  });

  it('skips blocked choices instead of walking through walls, the party or another enemy', () => {
    const enemy = rawRoamingEnemy();
    const state = {
      ...createChroniclesState('menagerie-of-ash'),
      round: 0,
      x: 2,
      y: 3,
      enemyPositions: {
        'bone-hound': { x: 3, y: 3 },
        'crypt-spider': { x: 3, y: 2 },
      },
    };

    // No legal move stays inside the patrol territory; hold position instead of escaping it.\n    expect(chroniclesChooseEnemyStep(state, enemy)).toBeNull();
  });
});
