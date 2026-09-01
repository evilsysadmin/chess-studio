import { describe, expect, it } from 'vitest';
import {
  BOARD3D_HIGHLIGHT_COLORS,
  BOARD3D_HIGHLIGHT_SIZE,
  BOARD3D_HIGHLIGHT_Y,
  board3DHighlightStyle,
} from './Board3DHighlights.js';

describe('War Room 3D highlight visibility', () => {
  it('keeps the overlay safely above the settled tile surface', () => {
    expect(BOARD3D_HIGHLIGHT_Y).toBeGreaterThan(0.11);
    expect(BOARD3D_HIGHLIGHT_SIZE).toBeGreaterThan(0.8);
  });

  it('uses a substantially darker blue for legal moves and selection', () => {
    expect(BOARD3D_HIGHLIGHT_COLORS.legal).toBe(0x145f8a);
    expect(BOARD3D_HIGHLIGHT_COLORS.selected).toBe(0x0b3f66);
    const legal = board3DHighlightStyle({ square: 'e4', legalMap: new Map([['e4', false]]) });
    const selected = board3DHighlightStyle({ square: 'e2', selectedSquare: 'e2', legalMap: new Map() });
    expect(legal).toMatchObject({ color: 0x145f8a, opacity: 0.86 });
    expect(selected).toMatchObject({ color: 0x0b3f66, opacity: 0.96 });
  });

  it('keeps captures and check red while selection wins over ordinary legal styling', () => {
    const capture = board3DHighlightStyle({ square: 'd5', legalMap: new Map([['d5', true]]) });
    const selected = board3DHighlightStyle({ square: 'e2', selectedSquare: 'e2', legalMap: new Map([['e2', false]]) });
    const check = board3DHighlightStyle({ square: 'e8', selectedSquare: 'e8', checkSquare: 'e8', legalMap: new Map() });
    expect(capture.color).toBe(BOARD3D_HIGHLIGHT_COLORS.capture);
    expect(selected.color).toBe(BOARD3D_HIGHLIGHT_COLORS.selected);
    expect(check.color).toBe(BOARD3D_HIGHLIGHT_COLORS.check);
  });
});
