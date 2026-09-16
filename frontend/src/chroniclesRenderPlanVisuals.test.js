import { describe, expect, it } from 'vitest';
import {
  chroniclesMapById,
  chroniclesMapRenderPlan,
  chroniclesValidateMapDefinition,
} from './chronicles/chroniclesMapCatalog.js';

describe('Chronicles render-plan enemy visuals', () => {
  it('projects authored fantasy visual metadata into the renderer contract', () => {
    const plan = chroniclesMapRenderPlan(chroniclesMapById('menagerie-of-ash'));
    const byId = Object.fromEntries(plan.enemies.map((enemy) => [enemy.id, enemy]));

    expect(byId['ash-goblin']).toMatchObject({ visualType: 'ash-goblin', visualScale: 0.9, visualMotion: 'grounded' });
    expect(byId['crypt-spider']).toMatchObject({ visualType: 'crypt-spider', visualScale: 0.82, visualMotion: 'skitter' });
    expect(byId['ember-wisp']).toMatchObject({ visualType: 'ember-wisp', visualScale: 0.78, visualMotion: 'hover' });
    expect(byId['bone-hound']).toMatchObject({ visualType: 'bone-hound', visualScale: 0.92, visualMotion: 'grounded' });
  });

  it('provides stable defaults for maps that do not author visual scale or motion', () => {
    const map = chroniclesValidateMapDefinition({
      id: 'render-plan-defaults',
      title: 'Render plan defaults',
      grid: ['#####', '#..X#', '#####'],
      partyStart: { x: 1, y: 1, direction: 1 },
      initialFlags: {},
      enemies: [{
        id: 'thing',
        name: 'thing',
        x: 2,
        y: 1,
        hpKey: 'thingHp',
        maxHp: 1,
        retaliation: 0,
        activation: 'always',
        ai: { movement: 'hold', attackReach: 1 },
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

    expect(chroniclesMapRenderPlan(map).enemies).toEqual([
      { id: 'thing', visualType: 'thing', visualScale: 1, visualMotion: 'grounded' },
    ]);
  });
});
