import { describe, expect, it } from 'vitest';
import {
  CHRONICLES_ENEMIES,
  createChroniclesState,
  chroniclesTileAt,
} from './chroniclesOfMatthias.js';
import {
  CHRONICLES_PARTY_GRID_ORDER,
  chroniclesPartyGridFootprint,
} from './chroniclesPartyFootprint.js';
import { chroniclesContentVisualStates } from './chronicles/chroniclesContentVisualState.js';

function footprintCells(footprint) {
  return CHRONICLES_PARTY_GRID_ORDER.map((id) => footprint[id]).filter(Boolean);
}

function key(cell) {
  return `${cell.x}:${cell.y}`;
}

describe('Chronicles Tactics party deploy footprint', () => {
  it('uses exactly one walkable dungeon cell per living hero', () => {
    const state = createChroniclesState();
    const footprint = chroniclesPartyGridFootprint(state);
    const cells = footprintCells(footprint);

    expect(Object.keys(footprint)).toEqual(CHRONICLES_PARTY_GRID_ORDER);
    expect(cells).toHaveLength(4);
    expect(new Set(cells.map(key)).size).toBe(4);
    cells.forEach((cell) => {
      expect(Number.isInteger(cell.x)).toBe(true);
      expect(Number.isInteger(cell.y)).toBe(true);
      expect(chroniclesTileAt(cell.x, cell.y, state)).not.toBe('#');
    });
  });

  it('never deploys a hero onto an active enemy cell', () => {
    const base = createChroniclesState();
    const enemy = CHRONICLES_ENEMIES[0];
    const blocked = { x: base.x + 1, y: base.y };
    const state = {
      ...base,
      [enemy.hpKey]: Math.max(1, Number(base[enemy.hpKey] || 0)),
      enemyPositions: {
        ...(base.enemyPositions || {}),
        [enemy.id]: blocked,
      },
    };

    const cells = footprintCells(chroniclesPartyGridFootprint(state));

    expect(cells).toHaveLength(4);
    expect(cells.map(key)).not.toContain(key(blocked));
  });

  it('treats visible authored content as occupied cells', () => {
    const state = {
      ...createChroniclesState(),
      x: 3,
      y: 3,
      direction: 2,
    };
    const visibleContent = chroniclesContentVisualStates(state)
      .filter((entry) => entry.visible && entry.position);
    const occupied = new Set(visibleContent.map((entry) => key(entry.position)));
    const cells = footprintCells(chroniclesPartyGridFootprint(state));

    expect(occupied.has('3:4')).toBe(true);
    expect(cells).toHaveLength(4);
    cells.forEach((cell) => expect(occupied.has(key(cell))).toBe(false));
  });

  it('keeps a constrained corridor formation connected and local', () => {
    const state = createChroniclesState();
    const cells = footprintCells(chroniclesPartyGridFootprint(state));
    const cellKeys = new Set(cells.map(key));

    expect(Math.max(...cells.map((cell) => (
      Math.abs(cell.x - state.x) + Math.abs(cell.y - state.y)
    )))).toBeLessThanOrEqual(3);

    const visited = new Set();
    const queue = [cells[0]];
    while (queue.length) {
      const current = queue.shift();
      const currentKey = key(current);
      if (visited.has(currentKey)) continue;
      visited.add(currentKey);
      [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ].forEach((neighbor) => {
        if (cellKeys.has(key(neighbor)) && !visited.has(key(neighbor))) queue.push(neighbor);
      });
    }

    expect(visited.size).toBe(cells.length);
  });

  it('keeps surviving heroes in their assigned cells when a member falls', () => {
    const base = createChroniclesState();
    const full = chroniclesPartyGridFootprint(base);
    const state = {
      ...base,
      party: base.party.map((member) => (
        member.id === 'bishop' ? { ...member, hp: 0 } : { ...member }
      )),
    };

    const reduced = chroniclesPartyGridFootprint(state);

    expect(reduced.bishop).toBeUndefined();
    expect(reduced.matthias).toEqual(full.matthias);
    expect(reduced.rook).toEqual(full.rook);
    expect(reduced.knight).toEqual(full.knight);
  });

  it('is deterministic for equivalent map state and facing', () => {
    const firstState = { ...createChroniclesState(), direction: 3 };
    const equivalentState = {
      ...firstState,
      party: firstState.party.map((member) => ({ ...member })),
      enemyPositions: Object.fromEntries(Object.entries(firstState.enemyPositions || {}).map(([id, cell]) => [id, { ...cell }])),
    };

    expect(chroniclesPartyGridFootprint(equivalentState)).toEqual(
      chroniclesPartyGridFootprint(firstState),
    );
  });
});
