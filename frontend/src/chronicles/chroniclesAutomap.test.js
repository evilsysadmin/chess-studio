import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from '../safeStorage.js';
import {
  chroniclesAutomapCellKey,
  chroniclesAutomapFacingDegrees,
  chroniclesAutomapLocalVisibleCells,
  chroniclesAutomapMarkVisited,
  chroniclesAutomapMarkSeen,
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

  it('reveals only geometry explicitly seen or walked, not adjacent tiles', () => {
    const map = {
      grid: [
        '#####',
        '#...#',
        '#...#',
        '#####',
      ],
    };
    const revealed = chroniclesAutomapRevealedCells(map, [chroniclesAutomapCellKey(2, 1)]);

    expect([...revealed].sort()).toEqual(['2:1']);
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

    const visible = chroniclesAutomapLocalVisibleCells(map, { x: 1, y: 1, direction: 1 }, 3);

    expect(visible.has('1:1')).toBe(true);
    expect(visible.has('2:1')).toBe(true);
    expect(visible.has('3:1')).toBe(true);
    expect(visible.has('4:1')).toBe(false);
    expect(visible.has('4:2')).toBe(false);
  });


});

describe('Chronicles automap remembers actual sight, not reachable geometry', () => {
  const map = { grid: ['#######', '#.....#', '#.###.#', '#.....#', '#######'] };

  it('records forward sight including visible walls, preserving distinct visited tiles', () => {
    const state = { mapId: 'm', x: 1, y: 1, direction: 1 };
    const seen = chroniclesAutomapMarkSeen({}, map, state, 3);
    expect(seen.m).toEqual(expect.arrayContaining(['1:1', '2:1:s', '3:1:s', '4:1:s']));
    expect(seen.m).not.toContain('1:2:s');
    expect(seen.m).not.toContain('1:3:s');
    expect(seen.m).not.toContain('2:3:s');
    expect(seen.m).not.toContain('2:1');
    const walked = chroniclesAutomapMarkSeen(seen, map, { ...state, x: 2 }, 3);
    expect(walked.m).toContain('2:1');
    expect(chroniclesAutomapMarkSeen(seen, map, state, 3)).toBe(seen);
  });

  it('discovers a new corridor only when the company turns to see it', () => {
    const east = chroniclesAutomapMarkSeen({}, map, { mapId: 'm', x: 1, y: 1, direction: 1 });
    expect(east.m).not.toContain('1:3:s');
    const south = chroniclesAutomapMarkSeen(east, map, { mapId: 'm', x: 1, y: 1, direction: 2 });
    expect(south.m).toContain('1:2:s');
    expect(south.m).toContain('1:3:s');
    expect(south.m).toContain('3:1:s'); // East remains in explored memory.
  });

  it('does not see through a wall, past a right-angle bend, or behind the group', () => {
    const bend = { grid: ['########', '#....###', '####.###', '####...#', '########'] };
    const visible = chroniclesAutomapLocalVisibleCells(bend, { x: 1, y: 1, direction: 1 }, 4);
    expect(visible.has('4:1')).toBe(true);
    expect(visible.has('4:2')).toBe(false);
    expect(visible.has('4:3')).toBe(false);
    expect(visible.has('0:1')).toBe(false);
  });

  it('shows the nearest wall face but no floor behind it', () => {
    const blocked = { grid: ['#######', '#.#...#', '#.....#', '#######'] };
    const seen = chroniclesAutomapMarkSeen({}, blocked, { mapId: 'm', x: 1, y: 1, direction: 1 }, 4);
    expect(seen.m).toContain('2:1:s');
    expect(seen.m).not.toContain('3:1:s');
    expect(chroniclesAutomapRevealedCells(blocked, seen.m).has('3:1')).toBe(false);
  });
});

describe('Chronicles map coordinates, MM3 style', () => {
  it('counts X east and Y north from the south-west corner', async () => {
    const { chroniclesMapCoordinates, chroniclesMapCoordinatesLabel } = await import('./chroniclesAutomap.js');
    const map = { grid: ['#####', '#...#', '#...#', '#####'] };
    expect(chroniclesMapCoordinates(map, { x: 1, y: 2 })).toEqual({ x: 1, y: 1 });
    expect(chroniclesMapCoordinatesLabel(map, { x: 3, y: 1 })).toBe('X3 Y2');
    expect(chroniclesMapCoordinatesLabel(map, {})).toBe('');
  });
});
