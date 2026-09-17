import { describe, expect, it } from 'vitest';
import { chroniclesMapById } from './chroniclesMapCatalog.js';
import { chroniclesIsometricScenePlan } from './chroniclesIsometricScenePlan.js';
import {
  CHRONICLES_ISOMETRIC_CELL_SIZE,
  chroniclesIsometricContentByKind,
  chroniclesIsometricDungeonPlan,
} from './chroniclesIsometricDungeonPlan.js';

describe('Chronicles isometric dungeon geometry plan', () => {
  it('preserves the canonical crypt footprint while projecting topology and content to world space', () => {
    const scenePlan = chroniclesIsometricScenePlan(chroniclesMapById('crypt-eight-squares'));
    const plan = chroniclesIsometricDungeonPlan(scenePlan);
    const centreFloor = plan.floors.find((cell) => cell.x === 3 && cell.y === 3);
    const sigil = plan.content.find((entry) => entry.id === 'ancient-sigil');
    const lever = plan.content.find((entry) => entry.id === 'rune-cache-lever');
    const pickup = plan.content.find((entry) => entry.id === 'rune-core');

    expect(plan.mapId).toBe('crypt-eight-squares');
    expect(plan.cellSize).toBe(CHRONICLES_ISOMETRIC_CELL_SIZE);
    expect(plan.foundation.width).toBeCloseTo(7.25 * CHRONICLES_ISOMETRIC_CELL_SIZE, 6);
    expect(plan.foundation.depth).toBeCloseTo(7.25 * CHRONICLES_ISOMETRIC_CELL_SIZE, 6);
    expect(plan.floors).toHaveLength(scenePlan.floors.length);
    expect(plan.walls).toHaveLength(scenePlan.walls.length);
    expect(centreFloor?.world).toEqual({ x: 0, y: 0, z: 0 });
    expect(sigil?.world).toEqual({ x: 0, y: 0, z: 2.45 });
    expect(lever?.world).toEqual({ x: 4.9, y: 0, z: 4.9 });
    expect(pickup?.world).toEqual({ x: 4.9, y: 0, z: 2.45 });
  });

  it('changes topology and authored content with the active map instead of inheriting the first crypt', () => {
    const crypt = chroniclesIsometricDungeonPlan(chroniclesMapById('crypt-eight-squares'));
    const gallery = chroniclesIsometricDungeonPlan(chroniclesMapById('gallery-of-forks'));

    expect(gallery.mapId).toBe('gallery-of-forks');
    expect(gallery.floors).not.toEqual(crypt.floors);
    expect(gallery.walls).not.toEqual(crypt.walls);
    expect(gallery.content.map((entry) => entry.id)).toEqual([
      'gallery-lever',
      'gallery-relic',
      'gallery-gate',
    ]);
    expect(gallery.content.find((entry) => entry.id === 'gallery-lever')?.world).toEqual({ x: 4.9, y: 0, z: 4.9 });
    expect(gallery.content.find((entry) => entry.id === 'gallery-relic')?.world).toEqual({ x: 4.9, y: 0, z: 2.45 });
  });

  it('resolves visual content roles by authored kind across maps and fails closed when absent', () => {
    const crypt = chroniclesIsometricDungeonPlan(chroniclesMapById('crypt-eight-squares'));
    const gallery = chroniclesIsometricDungeonPlan(chroniclesMapById('gallery-of-forks'));
    const menagerie = chroniclesIsometricDungeonPlan(chroniclesMapById('menagerie-of-ash'));

    expect(chroniclesIsometricContentByKind(crypt, 'trigger')?.id).toBe('ancient-sigil');
    expect(chroniclesIsometricContentByKind(crypt, 'lever')?.id).toBe('rune-cache-lever');
    expect(chroniclesIsometricContentByKind(crypt, 'pickup')?.id).toBe('rune-core');

    expect(chroniclesIsometricContentByKind(gallery, 'trigger')).toBeNull();
    expect(chroniclesIsometricContentByKind(gallery, 'lever')?.id).toBe('gallery-lever');
    expect(chroniclesIsometricContentByKind(gallery, 'pickup')?.id).toBe('gallery-relic');

    expect(chroniclesIsometricContentByKind(menagerie, 'trigger')).toBeNull();
    expect(chroniclesIsometricContentByKind(menagerie, 'lever')).toBeNull();
    expect(chroniclesIsometricContentByKind(menagerie, 'pickup')).toBeNull();
    expect(chroniclesIsometricContentByKind(null, 'lever')).toBeNull();
    expect(chroniclesIsometricContentByKind(crypt, '')).toBeNull();
  });

  it('sizes non-square foundations independently and centers projected cells and content', () => {
    const scenePlan = {
      mapId: 'synthetic-room',
      width: 5,
      height: 3,
      center: { x: 2, y: 1 },
      floors: [{ x: 2, y: 1, tile: '.' }, { x: 4, y: 2, tile: '.' }],
      walls: [{ x: 0, y: 0 }],
      content: [{ id: 'synthetic-lever', kind: 'lever', position: { x: 4, y: 1 }, visible: true }],
    };
    const plan = chroniclesIsometricDungeonPlan(scenePlan, 2);

    expect(plan.foundation).toEqual({ width: 10.5, depth: 6.5 });
    expect(plan.floors[0].world).toEqual({ x: 0, y: 0, z: 0 });
    expect(plan.floors[1].world).toEqual({ x: 4, y: 0, z: 2 });
    expect(plan.walls[0].world).toEqual({ x: -4, y: 0, z: -2 });
    expect(plan.content[0]).toMatchObject({
      id: 'synthetic-lever',
      kind: 'lever',
      visible: true,
      world: { x: 4, y: 0, z: 0 },
    });
  });
});
