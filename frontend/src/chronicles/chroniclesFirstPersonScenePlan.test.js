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
});
