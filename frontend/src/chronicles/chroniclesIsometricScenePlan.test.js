import { describe, expect, it } from 'vitest';
import { chroniclesMapById } from './chroniclesMapCatalog.js';
import { chroniclesIsometricScenePlan } from './chroniclesIsometricScenePlan.js';

describe('Chronicles isometric scene plan', () => {
  it('derives topology and authored props from the active map', () => {
    const plan = chroniclesIsometricScenePlan(chroniclesMapById('crypt-eight-squares'));

    expect(plan.mapId).toBe('crypt-eight-squares');
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

  it('changes scene topology and props when the map changes without renderer constants', () => {
    const crypt = chroniclesIsometricScenePlan(chroniclesMapById('crypt-eight-squares'));
    const gallery = chroniclesIsometricScenePlan(chroniclesMapById('gallery-of-forks'));

    expect(gallery.mapId).toBe('gallery-of-forks');
    expect(gallery.floors).not.toEqual(crypt.floors);
    expect(gallery.walls).not.toEqual(crypt.walls);
    expect(gallery.wallFaces).not.toEqual(crypt.wallFaces);
    expect(gallery.content.map((entry) => entry.id)).toEqual([
      'gallery-lever',
      'gallery-relic',
      'gallery-gate',
    ]);
  });

  it('derives prop visibility from authored when rules instead of renderer flag names', () => {
    const beforeLever = chroniclesIsometricScenePlan({
      mapId: 'gallery-of-forks',
      galleryLeverPulled: false,
      galleryRelicCollected: false,
    });
    const afterLever = chroniclesIsometricScenePlan({
      mapId: 'gallery-of-forks',
      galleryLeverPulled: true,
      galleryRelicCollected: false,
    });
    const afterRelic = chroniclesIsometricScenePlan({
      mapId: 'gallery-of-forks',
      galleryLeverPulled: true,
      galleryRelicCollected: true,
    });

    const visibility = (plan, id) => plan.content.find((entry) => entry.id === id)?.visible;
    expect(visibility(beforeLever, 'gallery-lever')).toBe(true);
    expect(visibility(beforeLever, 'gallery-relic')).toBe(false);
    expect(visibility(beforeLever, 'gallery-gate')).toBe(true);
    expect(visibility(afterLever, 'gallery-lever')).toBe(false);
    expect(visibility(afterLever, 'gallery-relic')).toBe(true);
    expect(visibility(afterRelic, 'gallery-relic')).toBe(false);
  });
});
