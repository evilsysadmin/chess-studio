import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import { chroniclesMapById, chroniclesValidateMapDefinition } from './chronicles/chroniclesMapCatalog.js';
import { chroniclesChooseEnemyStep } from './chroniclesOfMatthiasTurns.js';

describe('Chronicles proximity engagement movement', () => {
  it('lets the bone hound roam until the party enters its engagement range', () => {
    const enemy = chroniclesMapById('menagerie-of-ash').enemies.find((entry) => entry.id === 'bone-hound');
    const base = {
      ...createChroniclesState('menagerie-of-ash'),
      round: 0,
      enemyPositions: { 'bone-hound': { x: 1, y: 1 } },
    };

    expect(enemy.ai).toMatchObject({
      movement: 'cardinal-roam',
      engagedMovement: 'cardinal-chase',
      engageRange: 4,
    });
    expect(chroniclesChooseEnemyStep({ ...base, x: 5, y: 5 }, enemy)).toMatchObject({ x: 2, y: 1 });
    expect(chroniclesChooseEnemyStep({ ...base, x: 1, y: 3 }, enemy)).toMatchObject({ x: 1, y: 2 });
  });

  it('lets the crypt spider patrol until the party gets close enough to be hunted', () => {
    const enemy = chroniclesMapById('menagerie-of-ash').enemies.find((entry) => entry.id === 'crypt-spider');
    const base = {
      ...createChroniclesState('menagerie-of-ash'),
      enemyPositions: { 'crypt-spider': { x: 3, y: 3 } },
    };

    expect(enemy.ai).toMatchObject({
      movement: 'patrol-route',
      engagedMovement: 'cardinal-chase',
      engageRange: 3,
    });
    expect(chroniclesChooseEnemyStep({ ...base, x: 1, y: 5 }, enemy)).toMatchObject({ x: 4, y: 3 });
    expect(chroniclesChooseEnemyStep({ ...base, x: 3, y: 5 }, enemy)).toMatchObject({ x: 3, y: 4 });
  });

  it('rejects incomplete or unsupported engagement contracts', () => {
    const base = {
      id: 'engagement-contract-room',
      title: 'Engagement contract room',
      grid: ['#####', '#...#', '#..X#', '#####'],
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
      id: 'watcher',
      visualType: 'watcher',
      name: 'watcher',
      x: 2,
      y: 1,
      hpKey: 'watcherHp',
      maxHp: 3,
      retaliation: 1,
      activation: 'always',
      ai: { movement: 'hold', attackReach: 1 },
    };

    expect(() => chroniclesValidateMapDefinition({
      ...base,
      enemies: [{ ...enemy, ai: { ...enemy.ai, engagedMovement: 'cardinal-chase' } }],
    })).toThrow(/requires engageRange/i);

    expect(() => chroniclesValidateMapDefinition({
      ...base,
      enemies: [{ ...enemy, ai: { ...enemy.ai, engageRange: 3 } }],
    })).toThrow(/requires engagedMovement/i);

    expect(() => chroniclesValidateMapDefinition({
      ...base,
      enemies: [{ ...enemy, ai: { ...enemy.ai, engagedMovement: 'teleport', engageRange: 3 } }],
    })).toThrow(/unsupported engagedMovement/i);
  });
});
