import { describe, expect, it } from 'vitest';
import { chroniclesMapById, chroniclesMapRenderPlan } from './chroniclesMapCatalog.js';

describe('Chronicles generic render content contract', () => {
  it('projects every authored content group instead of one special prop per kind', () => {
    const gallery = chroniclesMapRenderPlan(chroniclesMapById('gallery-of-forks'));

    expect(gallery.content).toEqual([
      {
        id: 'gallery-lever',
        kind: 'lever',
        group: 'interactables',
        visualType: 'lever',
        position: { x: 5, y: 5 },
      },
      {
        id: 'gallery-relic',
        kind: 'pickup',
        group: 'treasures',
        visualType: 'pickup',
        position: { x: 5, y: 4 },
      },
      {
        id: 'gallery-gate',
        kind: 'exit',
        group: 'exits',
        visualType: 'exit',
        position: { x: 3, y: 1 },
      },
    ]);

    expect(gallery.lever).toEqual({ id: 'gallery-lever', position: { x: 5, y: 5 } });
    expect(gallery.pickup).toEqual({ id: 'gallery-relic', position: { x: 5, y: 4 } });
    expect(gallery.sigil).toBeNull();
  });

  it('keeps authored identity separate from reusable visual roles', () => {
    const map = {
      id: 'synthetic-room',
      title: 'Synthetic',
      grid: ['###', '#.#', '###'],
      enemies: [],
      triggers: [],
      interactables: [
        { id: 'north-switch', kind: 'lever', visualType: 'dwarven-switch', x: 1, y: 1 },
        { id: 'south-switch', kind: 'lever', visualType: 'dwarven-switch', x: 1, y: 1 },
      ],
      treasures: [],
      traps: [],
      exits: [],
    };

    const content = chroniclesMapRenderPlan(map).content;

    expect(content).toHaveLength(2);
    expect(content.map((entry) => entry.id)).toEqual(['north-switch', 'south-switch']);
    expect(content.every((entry) => entry.visualType === 'dwarven-switch')).toBe(true);
  });
});
