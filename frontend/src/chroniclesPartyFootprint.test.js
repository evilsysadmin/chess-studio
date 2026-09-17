import { describe, expect, it } from 'vitest';
import {
  CHRONICLES_ENEMIES,
  CHRONICLES_MAP,
  createChroniclesState,
} from './chroniclesOfMatthias.js';
import {
  CHRONICLES_PARTY_GRID_ORDER,
  chroniclesPartyGridFootprint,
} from './chroniclesPartyFootprint.js';

function footprintCells(footprint) {
  return CHRONICLES_PARTY_GRID_ORDER.map((id) => footprint[id]).filter(Boolean);
}

function key(cell) {
  return `${cell.x}:${cell.y}`;
}

describe('Chronicles Tactics party grid footprint', () => {
  it('puts every hero on a distinct walkable dungeon cell', () => {
    const state = createChroniclesState();
    const footprint = chroniclesPartyGridFootprint(state);
    const cells = footprintCells(footprint);

    expect(Object.keys(footprint)).toEqual(CHRONICLES_PARTY_GRID_ORDER);
    expect(cells).toHaveLength(4);
    expect(new Set(cells.map(key)).size).toBe(4);
    expect(footprint.matthias).toEqual({ x: state.x, y: state.y });
    cells.forEach((cell) => {
      expect(Number.isInteger(cell.x)).toBe(true);
      expect(Number.isInteger(cell.y)).toBe(true);
      expect(CHRONICLES_MAP[cell.y]?.[cell.x]).toBeTruthy();
      expect(CHRONICLES_MAP[cell.y]?.[cell.x]).not.toBe('#');
    });
  });

  it('routes formation slots around an occupied enemy cell instead of overlapping it', () => {
    const base = createChroniclesState();
    const enemy = CHRONICLES_ENEMIES[0];
    const blocked = { x: base.x, y: base.y - 1 };
    const state = {
      ...base,
      [enemy.hpKey]: Math.max(1, Number(base[enemy.hpKey] || 0)),
      enemyPositions: {
        ...(base.enemyPositions || {}),
        [enemy.id]: blocked,
      },
    };

    const footprint = chroniclesPartyGridFootprint(state);
    const cells = footprintCells(footprint);

    expect(cells).toHaveLength(4);
    expect(new Set(cells.map(key)).size).toBe(4);
    expect(cells.map(key)).not.toContain(key(blocked));
  });

  it('is deterministic for the same map state and facing', () => {
    const state = { ...createChroniclesState(), direction: 0 };
    expect(chroniclesPartyGridFootprint(state)).toEqual(chroniclesPartyGridFootprint(state));
  });
});
