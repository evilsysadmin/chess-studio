import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import {
  CHRONICLES_PARTY_GRID_ORDER,
  chroniclesPartyGridFootprint,
} from './chroniclesPartyFootprint.js';

function footprintCells(footprint) {
  return CHRONICLES_PARTY_GRID_ORDER.map((id) => footprint[id]).filter(Boolean);
}

function key(cell) {
  return `${cell.x.toFixed(4)}:${cell.y.toFixed(4)}`;
}

describe('Chronicles Tactics party deploy footprint', () => {
  it('keeps the full party compact inside the logical anchor cell', () => {
    const state = createChroniclesState();
    const footprint = chroniclesPartyGridFootprint(state);
    const cells = footprintCells(footprint);

    expect(Object.keys(footprint)).toEqual(CHRONICLES_PARTY_GRID_ORDER);
    expect(cells).toHaveLength(4);
    expect(new Set(cells.map(key)).size).toBe(4);

    cells.forEach((cell) => {
      expect(Math.abs(cell.x - state.x)).toBeLessThan(0.5);
      expect(Math.abs(cell.y - state.y)).toBeLessThan(0.5);
    });

    const centroid = cells.reduce(
      (sum, cell) => ({ x: sum.x + cell.x, y: sum.y + cell.y }),
      { x: 0, y: 0 },
    );
    expect(centroid.x / cells.length).toBeCloseTo(state.x, 8);
    expect(centroid.y / cells.length).toBeCloseTo(state.y, 8);
  });

  it('rotates front/back and left/right deployment with party facing', () => {
    const eastState = { ...createChroniclesState(), direction: 1 };
    const east = chroniclesPartyGridFootprint(eastState);

    expect(east.matthias.x).toBeGreaterThan(eastState.x);
    expect(east.rook.x).toBeGreaterThan(eastState.x);
    expect(east.bishop.x).toBeLessThan(eastState.x);
    expect(east.knight.x).toBeLessThan(eastState.x);
    expect(east.matthias.y).toBeLessThan(eastState.y);
    expect(east.bishop.y).toBeLessThan(eastState.y);
    expect(east.rook.y).toBeGreaterThan(eastState.y);
    expect(east.knight.y).toBeGreaterThan(eastState.y);

    const northState = { ...eastState, direction: 0 };
    const north = chroniclesPartyGridFootprint(northState);

    expect(north.matthias.y).toBeLessThan(northState.y);
    expect(north.rook.y).toBeLessThan(northState.y);
    expect(north.bishop.y).toBeGreaterThan(northState.y);
    expect(north.knight.y).toBeGreaterThan(northState.y);
    expect(north.matthias.x).toBeLessThan(northState.x);
    expect(north.bishop.x).toBeLessThan(northState.x);
    expect(north.rook.x).toBeGreaterThan(northState.x);
    expect(north.knight.x).toBeGreaterThan(northState.x);
  });

  it('does not reshuffle survivors when one party member falls', () => {
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
    };

    const first = chroniclesPartyGridFootprint(firstState);
    const second = chroniclesPartyGridFootprint(equivalentState);

    expect(second).toEqual(first);
  });
});
