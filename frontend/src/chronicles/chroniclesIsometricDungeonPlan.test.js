import { describe, expect, it } from 'vitest';
import { chroniclesMapById } from './chroniclesMapCatalog.js';
import { chroniclesIsometricScenePlan } from './chroniclesIsometricScenePlan.js';
import {
  CHRONICLES_ISOMETRIC_CELL_SIZE,
  chroniclesIsometricDungeonPlan,
} from './chroniclesIsometricDungeonPlan.js';

describe('Chronicles isometric dungeon geometry plan', () => {
  it('preserves the canonical crypt footprint while projecting floor and wall cells to world space', () => {
    const scenePlan = chroniclesIsometricScenePlan(chroniclesMapById('crypt-eight-squares'));
    const plan = chroniclesIsometricDungeonPlan(scenePlan);
    const centreFloor = plan.floors.find((cell) => cell.x === 3 && cell.y === 3);

    expect(plan.mapId).toBe('crypt-eight-squares');
    expect(plan.cellSize).toBe(CHRONICLES_ISOMETRIC_CELL_SIZE);
    expect(plan.foundation.width).toBeCloseTo(7.25 * CHRONICLES_ISOMETRIC_CELL_SIZE, 6);
    expect(plan.foundation.depth).toBeCloseTo(7.25 * CHRONICLES_ISOMETRIC_CELL_SIZE, 6);
    expect(plan.floors).toHaveLength(scenePlan.floors.length);
    expect(plan.walls).toHaveLength(scenePlan.walls.length);
    expect(centreFloor?.world).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('changes topology with the authored map instead of inheriting the first crypt', () => {
    const crypt = chroniclesIsometricDungeonPlan(chroniclesMapById('crypt-eight-squares'));
    const gallery = chroniclesIsometricDungeonPlan(chroniclesMapById('gallery-of-forks'));

    expect(gallery.mapId).toBe('gallery-of-forks');
    expect(gallery.floors).not.toEqual(crypt.floors);
    expect(gallery.walls).not.toEqual(crypt.walls);
  });

  it('sizes non-square foundations independently and centers their projected cells', () => {
    const scenePlan = {
      mapId: 'synthetic-room',
      width: 5,
      height: 3,
      center: { x: 2, y: 1 },
      floors: [{ x: 2, y: 1, tile: '.' }, { x: 4, y: 2, tile: '.' }],
      walls: [{ x: 0, y: 0 }],
    };
    const plan = chroniclesIsometricDungeonPlan(scenePlan, 2);

    expect(plan.foundation).toEqual({ width: 10.5, depth: 6.5 });
    expect(plan.floors[0].world).toEqual({ x: 0, y: 0, z: 0 });
    expect(plan.floors[1].world).toEqual({ x: 4, y: 0, z: 2 });
    expect(plan.walls[0].world).toEqual({ x: -4, y: 0, z: -2 });
  });
});
