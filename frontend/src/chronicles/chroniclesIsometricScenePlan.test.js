import { describe, expect, it } from 'vitest';
import { chroniclesMapById } from './chroniclesMapCatalog.js';
import {
  chroniclesIsometricCellToWorld,
  chroniclesIsometricScenePlan,
} from './chroniclesIsometricScenePlan.js';

describe('Chronicles isometric scene plan', () => {
  it('derives topology, authored props and visual style from the active map', () => {
    const plan = chroniclesIsometricScenePlan(chroniclesMapById('crypt-eight-squares'));

    expect(plan.mapId).toBe('crypt-eight-squares');
    expect(plan.sceneStyle).toEqual({ id: 'crypt-stone', version: 1, dressing: 'crypt-legacy' });
    expect(plan.width).toBe(7);
    expect(plan.height).toBe(7);
    expect(plan.center).toEqual({ x: 3, y: 3 });
    expect(plan.partyStart).toEqual({ x: 1, y: 5 });
    expect(plan.floors).toContainEqual({ x: 3, y: 4, tile: 'S' });
    expect(plan.walls).toContainEqual({ x: 2, y: 2 });
    expect(plan.wallFaces).toContainEqual({ x: 2, y: 6, side: 'north' });
    expect(plan.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'ancient-sigil', kind: 'trigger', position: { x: 3, y: 4 }, visible: true }),
      expect.objectContaining({ id: 'rune-cache-lever', kind: 'lever', position: { x: 5, y: 5 }, visible: true }),
      expect.objectContaining({ id: 'rune-core', kind: 'pickup', position: { x: 5, y: 4 }, visible: true }),
      expect.objectContaining({ id: 'black-gate', kind: 'exit', position: { x: 3, y: 1 }, visible: true }),
    ]));
  });

  it('changes scene topology, props and visual style when the map changes without renderer constants', () => {
    const crypt = chroniclesIsometricScenePlan(chroniclesMapById('crypt-eight-squares'));
    const gallery = chroniclesIsometricScenePlan(chroniclesMapById('gallery-of-forks'));

    expect(gallery.mapId).toBe('gallery-of-forks');
    expect(gallery.sceneStyle).toEqual({ id: 'gallery-stone', version: 1, dressing: 'none' });
    expect(gallery.sceneStyle).not.toEqual(crypt.sceneStyle);
    expect(gallery.floors).not.toEqual(crypt.floors);
    expect(gallery.walls).not.toEqual(crypt.walls);
    expect(gallery.wallFaces).not.toEqual(crypt.wallFaces);
    expect(gallery.content.map((entry) => entry.id)).toEqual([
      'gallery-lever',
      'gallery-relic',
      'gallery-gate',
    ]);
  });

  it('derives world coordinates from the active scene center instead of a 7x7 constant', () => {
    const plan = chroniclesIsometricScenePlan({
      id: 'small-test-room',
      title: 'Small test room',
      grid: [
        '#####',
        '#...#',
        '#####',
      ],
      partyStart: { x: 1, y: 1 },
      enemies: [],
      triggers: [],
      interactables: [],
      treasures: [],
      traps: [],
      exits: [],
    });

    expect(plan.sceneStyle).toEqual({ id: 'neutral', version: 1, dressing: 'none' });
    expect(plan.center).toEqual({ x: 2, y: 1 });
    expect(chroniclesIsometricCellToWorld(plan, 2, 1, 2)).toEqual({ x: 0, y: 0, z: 0 });
    expect(chroniclesIsometricCellToWorld(plan, 4, 2, 2)).toEqual({ x: 4, y: 0, z: 2 });
    expect(chroniclesIsometricCellToWorld(plan, 0, 0, 2)).toEqual({ x: -4, y: 0, z: -2 });
  });

  it('derives prop visual lifecycle from authored rules instead of renderer flag names', () => {
    const beforeLever = chroniclesIsometricScenePlan({
      mapId: 'gallery-of-forks',
      galleryLeverPulled: false,
      galleryRelicCollected: false,
    });
    const afterLever = chroniclesIsometricScenePlan({
      mapId: 'gallery-of-forks',
      galleryLeverPulled: true,
      galleryRelicCollected: false,
      runeCacheOpened: false,
    });
    const afterRelic = chroniclesIsometricScenePlan({
      mapId: 'gallery-of-forks',
      galleryLeverPulled: true,
      galleryRelicCollected: true,
      runeCacheOpened: false,
      runeCoreCollected: false,
    });

    const prop = (plan, id) => plan.content.find((entry) => entry.id === id);
    expect(prop(beforeLever, 'gallery-lever')).toMatchObject({
      available: true,
      activated: false,
      visible: true,
    });
    expect(prop(beforeLever, 'gallery-relic')).toMatchObject({
      available: false,
      activated: false,
      visible: false,
    });
    expect(prop(beforeLever, 'gallery-gate')).toMatchObject({ visible: true });
    expect(prop(afterLever, 'gallery-lever')).toMatchObject({
      available: false,
      activated: true,
      visible: true,
    });
    expect(prop(afterLever, 'gallery-relic')).toMatchObject({
      available: true,
      activated: false,
      visible: true,
    });
    expect(prop(afterRelic, 'gallery-relic')).toMatchObject({
      available: false,
      activated: true,
      visible: false,
    });
  });
});
