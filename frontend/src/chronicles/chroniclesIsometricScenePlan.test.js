import { describe, expect, it } from 'vitest';
import { chroniclesMapById } from './chroniclesMapCatalog.js';
import {
  chroniclesIsometricCellToWorld,
  chroniclesIsometricContentPlan,
  chroniclesIsometricScenePlan,
} from './chroniclesIsometricScenePlan.js';

describe('Chronicles isometric scene plan', () => {
  it('derives topology, authored props and visual style from the active map', () => {
    const plan = chroniclesIsometricScenePlan(chroniclesMapById('crypt-eight-squares'));

    expect(plan.mapId).toBe('crypt-eight-squares');
    expect(plan.sceneStyle).toMatchObject({ id: 'crypt-stone', version: 2, dressing: 'crypt-legacy' });
    expect(plan.sceneStyle.palette).toEqual(expect.objectContaining({
      background: 0x100c09,
      floor: expect.any(Array),
      wall: expect.any(Array),
    }));
    expect(plan.width).toBe(7);
    expect(plan.height).toBe(7);
    expect(plan.center).toEqual({ x: 3, y: 3 });
    expect(plan.partyStart).toEqual({ x: 1, y: 5 });
    expect(plan.floors).toContainEqual({ x: 3, y: 4, tile: 'S' });
    expect(plan.walls).toContainEqual({ x: 2, y: 2 });
    expect(plan.wallFaces).toContainEqual({ x: 2, y: 6, side: 'north' });
    expect(plan.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'ancient-sigil', kind: 'trigger', position: { x: 3, y: 4 }, visible: true, active: false }),
      expect.objectContaining({ id: 'rune-cache-lever', kind: 'lever', position: { x: 5, y: 5 }, visible: true, active: false }),
      expect.objectContaining({ id: 'rune-core', kind: 'pickup', position: { x: 5, y: 4 }, visible: true, active: false }),
      expect.objectContaining({ id: 'black-gate', kind: 'exit', position: { x: 3, y: 1 }, visible: true, active: false }),
    ]));
  });

  it('changes scene topology, props and visual style when the map changes without renderer constants', () => {
    const crypt = chroniclesIsometricScenePlan(chroniclesMapById('crypt-eight-squares'));
    const gallery = chroniclesIsometricScenePlan(chroniclesMapById('gallery-of-forks'));

    expect(gallery.mapId).toBe('gallery-of-forks');
    expect(gallery.sceneStyle).toMatchObject({ id: 'gallery-stone', version: 2, dressing: 'none' });
    expect(gallery.sceneStyle.palette).not.toEqual(crypt.sceneStyle.palette);
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

    expect(plan.sceneStyle).toMatchObject({ id: 'neutral', version: 2, dressing: 'none' });
    expect(plan.sceneStyle.palette.floor.length).toBeGreaterThan(0);
    expect(plan.sceneStyle.palette.wall.length).toBeGreaterThan(0);
    expect(plan.center).toEqual({ x: 2, y: 1 });
    expect(chroniclesIsometricCellToWorld(plan, 2, 1, 2)).toEqual({ x: 0, y: 0, z: 0 });
    expect(chroniclesIsometricCellToWorld(plan, 4, 2, 2)).toEqual({ x: 4, y: 0, z: 2 });
    expect(chroniclesIsometricCellToWorld(plan, 0, 0, 2)).toEqual({ x: -4, y: 0, z: -2 });
  });

  it('derives live prop visibility and activation from authored rules and action effects', () => {
    const beforeLever = chroniclesIsometricContentPlan({
      mapId: 'gallery-of-forks',
      galleryLeverPulled: false,
      galleryRelicCollected: false,
    });
    const afterLever = chroniclesIsometricContentPlan({
      mapId: 'gallery-of-forks',
      galleryLeverPulled: true,
      galleryRelicCollected: false,
    });
    const afterRelic = chroniclesIsometricContentPlan({
      mapId: 'gallery-of-forks',
      galleryLeverPulled: true,
      galleryRelicCollected: true,
    });

    const entry = (content, id) => content.find((item) => item.id === id);
    expect(entry(beforeLever, 'gallery-lever')).toMatchObject({ visible: true, active: false });
    expect(entry(beforeLever, 'gallery-relic')).toMatchObject({ visible: false, active: false });
    expect(entry(afterLever, 'gallery-lever')).toMatchObject({ visible: false, active: true });
    expect(entry(afterLever, 'gallery-relic')).toMatchObject({ visible: true, active: false });
    expect(entry(afterRelic, 'gallery-lever')).toMatchObject({ visible: false, active: true });
    expect(entry(afterRelic, 'gallery-relic')).toMatchObject({ visible: false, active: true });
  });
});
