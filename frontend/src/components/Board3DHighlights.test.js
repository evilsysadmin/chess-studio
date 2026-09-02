import { describe, expect, it } from 'vitest';
import {
  BOARD3D_HIGHLIGHT_COLORS,
  BOARD3D_HIGHLIGHT_SIZE,
  BOARD3D_HIGHLIGHT_Y,
  board3DHighlightStyle,
} from './Board3DHighlights.js';

describe('War Room 3D premium highlight visibility', () => {
  it('keeps the overlay safely above the settled tile surface', () => {
    expect(BOARD3D_HIGHLIGHT_Y).toBeGreaterThan(0.11);
    expect(BOARD3D_HIGHLIGHT_SIZE).toBeGreaterThan(0.8);
  });

  it('uses brass and ember instead of the old electric-blue interaction palette', () => {
    expect(BOARD3D_HIGHLIGHT_COLORS.legal).toBe(0x9c8244);
    expect(BOARD3D_HIGHLIGHT_COLORS.selected).toBe(0xc99a43);
    expect(BOARD3D_HIGHLIGHT_COLORS.capture).toBe(0x96462e);
    const legal = board3DHighlightStyle({ square: 'e4', legalMap: new Map([['e4', false]]) });
    const selected = board3DHighlightStyle({ square: 'e2', selectedSquare: 'e2', legalMap: new Map() });
    expect(legal).toMatchObject({ kind: 'legal', color: 0x9c8244, opacity: 0.68 });
    expect(selected).toMatchObject({ kind: 'selected', color: 0xc99a43, opacity: 0.82 });
  });

  it('keeps semantic precedence: capture < selection < check', () => {
    const capture = board3DHighlightStyle({ square: 'd5', legalMap: new Map([['d5', true]]) });
    const selected = board3DHighlightStyle({ square: 'e2', selectedSquare: 'e2', legalMap: new Map([['e2', false]]) });
    const check = board3DHighlightStyle({ square: 'e8', selectedSquare: 'e8', checkSquare: 'e8', legalMap: new Map() });
    expect(capture).toMatchObject({ kind: 'capture', color: BOARD3D_HIGHLIGHT_COLORS.capture });
    expect(selected).toMatchObject({ kind: 'selected', color: BOARD3D_HIGHLIGHT_COLORS.selected });
    expect(check).toMatchObject({ kind: 'check', color: BOARD3D_HIGHLIGHT_COLORS.check });
  });

  it('keeps last move and hint visually quieter than an active selection', () => {
    const lastMove = board3DHighlightStyle({ square: 'e4', lastMove: { from: 'e2', to: 'e4' } });
    const hint = board3DHighlightStyle({ square: 'f3', hintMove: { from: 'g1', to: 'f3' } });
    const selected = board3DHighlightStyle({ square: 'e4', selectedSquare: 'e4' });
    expect(lastMove.kind).toBe('lastMove');
    expect(hint.kind).toBe('hint');
    expect(lastMove.opacity).toBeLessThan(selected.opacity);
    expect(hint.opacity).toBeLessThan(selected.opacity);
  });
});
