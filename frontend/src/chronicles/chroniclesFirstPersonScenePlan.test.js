import { afterEach, describe, expect, it } from 'vitest';
import {
  chroniclesClearRuntimeMapDefinitions,
  chroniclesInstallRuntimeMapDefinition,
  chroniclesMapById,
} from './chroniclesMapCatalog.js';
import { chroniclesFirstPersonScenePlan } from './chroniclesFirstPersonScenePlan.js';

describe('Chronicles first-person runtime scene plan', () => {
  afterEach(() => {
    chroniclesClearRuntimeMapDefinitions();
  });

  it('reads the installed runtime grid instead of a module-load bundled snapshot', () => {
    const bundled = chroniclesMapById('crypt-eight-squares');
    expect(bundled.grid[2]).toBe('#.###.#');

    const runtimeGrid = [...bundled.grid];
    runtimeGrid[2] = '#.....#';
    chroniclesInstallRuntimeMapDefinition({
      ...bundled,
      version: Number(bundled.version || 0) + 1000,
      grid: runtimeGrid,
    });

    const plan = chroniclesFirstPersonScenePlan({ mapId: 'crypt-eight-squares' });
    expect(plan.mapId).toBe('crypt-eight-squares');
    expect(plan.grid[2]).toBe('#.....#');
  });
  it('keeps the canonical crypt dressing only on the canonical map', () => {
    const crypt = chroniclesFirstPersonScenePlan({ mapId: 'crypt-eight-squares' });
    const gallery = chroniclesFirstPersonScenePlan({ mapId: 'gallery-of-forks' });

    expect(crypt.useAuthoredCryptDressing).toBe(true);
    expect(gallery.useAuthoredCryptDressing).toBe(false);
  });

  it('inherits topology and center from the active map instead of a 7x7 renderer constant', () => {
    const map = chroniclesMapById('gallery-of-forks');
    const plan = chroniclesFirstPersonScenePlan({ mapId: map.id });

    expect(plan.width).toBe(map.grid[0].length);
    expect(plan.height).toBe(map.grid.length);
    expect(plan.center).toEqual({
      x: (plan.width - 1) / 2,
      y: (plan.height - 1) / 2,
    });
    expect(plan.floors.length).toBeGreaterThan(0);
    expect(plan.wallFaces.length).toBeGreaterThan(0);
  });

});
