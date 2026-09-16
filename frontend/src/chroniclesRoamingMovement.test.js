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
    expect(chroniclesChooseEnemyStep({ ...base, round: 1 }, enemy)).toEqual({ x: 3, y: 2 });
    expect(chroniclesChooseEnemyStep({ ...base, round: 0 }, enemy)).toEqual({ x: 2, y: 3 });
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

    expect(chroniclesChooseEnemyStep(state, enemy)).toEqual({ x: 4, y: 3 });
  });
});
