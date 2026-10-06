import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from '../safeStorage.js';
import {
  chroniclesAutomapCellKey,
  chroniclesAutomapFacingDegrees,
  chroniclesAutomapLocalVisibleCells,
  chroniclesAutomapMarkVisited,
  chroniclesAutomapRevealedCells,
  clearChroniclesAutomapVisited,
  loadChroniclesAutomapVisited,
  saveChroniclesAutomapVisited,
} from './chroniclesAutomap.js';

describe('Chronicles automap', () => {
  const runId = 'automap-test-run';

  beforeEach(() => {
    clearStorageMemoryFallback();
    clearChroniclesAutomapVisited(runId);
  });
  it('tracks visited cells per map without mutating the previous ledger', () => {
    const empty = {};
    const first = chroniclesAutomapMarkVisited(empty, { mapId: 'crypt', x: 2, y: 3 });
    const duplicate = chroniclesAutomapMarkVisited(first, { mapId: 'crypt', x: 2, y: 3 });
    const secondMap = chroniclesAutomapMarkVisited(first, { mapId: 'gallery', x: 1, y: 1 });

    expect(empty).toEqual({});
    expect(first).toEqual({ crypt: ['2:3'] });
    expect(duplicate).toBe(first);
    expect(secondMap).toEqual({ crypt: ['2:3'], gallery: ['1:1'] });
  });

  it('reveals the visited tile plus immediately visible cardinal geometry', () => {
    const map = {
      grid: [
        '#####',
        '#...#',
        '#...#',
        '#####',
      ],
    };
    const revealed = chroniclesAutomapRevealedCells(map, [chroniclesAutomapCellKey(2, 1)]);

    expect([...revealed].sort()).toEqual(['1:1', '2:0', '2:1', '2:2', '3:1']);
    expect(revealed.has('0:0')).toBe(false);
  });

  it('survives reload through safe session storage without touching the run checkpoint', () => {
    const visited = {
      crypt: ['1:1', '1:2', '1:2'],
      gallery: ['3:4'],
    };

    expect(saveChroniclesAutomapVisited(runId, visited)).toBeTypeOf('boolean');
    expect(loadChroniclesAutomapVisited(runId)).toEqual({
      crypt: ['1:1', '1:2'],
      gallery: ['3:4'],
    });

    clearChroniclesAutomapVisited(runId);
    expect(loadChroniclesAutomapVisited(runId)).toEqual({});
  });

  it('maps the canonical N/E/S/O direction index to arrow rotation', () => {
    expect([0, 1, 2, 3].map(chroniclesAutomapFacingDegrees)).toEqual([0, 90, 180, 270]);
    expect(chroniclesAutomapFacingDegrees(4)).toBe(0);
    expect(chroniclesAutomapFacingDegrees(-1)).toBe(270);
  });
  it('reveals nearby walkable cells but does not flood through walls', () => {
    const map = {
      grid: [
        '#######',
        '#..#..#',
        '#..#..#',
        '#.....#',
        '#######',
      ],
    };

    const visible = chroniclesAutomapLocalVisibleCells(map, { x: 1, y: 1 }, 3);

    expect(visible.has('1:1')).toBe(true);
    expect(visible.has('2:1')).toBe(true);
    expect(visible.has('3:1')).toBe(true);
    expect(visible.has('4:1')).toBe(false);
    expect(visible.has('4:2')).toBe(false);
  });


});
