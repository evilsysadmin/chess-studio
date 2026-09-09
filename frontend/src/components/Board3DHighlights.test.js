import { describe, expect, it } from 'vitest';
import { FILES } from './Board3DConfig.js';
import { squarePosition } from './Board3DBoardMath.js';
import {
  BOARD3D_HIGHLIGHT_COLORS,
  BOARD3D_HIGHLIGHT_SIZE,
  BOARD3D_HIGHLIGHT_Y,
  board3DHighlightStyle,
} from './Board3DHighlights.js';

const ALL_SQUARES = Object.freeze(
  Array.from({ length: 8 }, (_, rankIndex) =>
    FILES.map((file) => `${file}${rankIndex + 1}`),
  ).flat(),
);

function highlightedSquares(state, kind = null) {
  return ALL_SQUARES.filter((square) => {
    const style = board3DHighlightStyle({ square, ...state });
    return kind ? style?.kind === kind : Boolean(style);
  });
}

function expectOnlySquares(state, expected, kind = null) {
  expect(highlightedSquares(state, kind).sort()).toEqual([...expected].sort());
}

describe('War Room 3D premium highlight visibility', () => {
  it('keeps the overlay safely above the settled tile surface', () => {
    expect(BOARD3D_HIGHLIGHT_Y).toBeGreaterThan(0.11);
    expect(BOARD3D_HIGHLIGHT_SIZE).toBeGreaterThan(0.8);
  });

  it('uses a cool high-contrast blue for legal destinations while preserving warm semantics', () => {
    expect(BOARD3D_HIGHLIGHT_COLORS.legal).toBe(0x245f9f);
    expect(BOARD3D_HIGHLIGHT_COLORS.selected).toBe(0xc99a43);
    expect(BOARD3D_HIGHLIGHT_COLORS.capture).toBe(0x96462e);
    const legal = board3DHighlightStyle({ square: 'e4', legalMap: new Map([['e4', false]]) });
    const selected = board3DHighlightStyle({ square: 'e2', selectedSquare: 'e2', legalMap: new Map() });
    expect(legal).toMatchObject({ kind: 'legal', color: 0x245f9f, opacity: 0.84, scale: 0.82 });
    expect(selected).toMatchObject({ kind: 'selected', color: 0xc99a43, opacity: 0.82 });
  });

  it('binds selection and legal targets to exact algebraic squares with no mirrored spill', () => {
    const whiteState = {
      selectedSquare: 'e2',
      legalMap: new Map([['e3', false], ['e4', false]]),
    };
    expectOnlySquares(whiteState, ['e2', 'e3', 'e4']);
    expectOnlySquares(whiteState, ['e2'], 'selected');
    expectOnlySquares(whiteState, ['e3', 'e4'], 'legal');

    const blackState = {
      selectedSquare: 'e7',
      legalMap: new Map([['e6', false], ['e5', false]]),
    };
    expectOnlySquares(blackState, ['e5', 'e6', 'e7']);
    expectOnlySquares(blackState, ['e7'], 'selected');
    expectOnlySquares(blackState, ['e5', 'e6'], 'legal');

    for (const wrongSquare of ['d2', 'd7', 'e1', 'e8', 'f2', 'f7']) {
      expect(board3DHighlightStyle({ square: wrongSquare, ...whiteState })?.kind).not.toBe('selected');
      expect(board3DHighlightStyle({ square: wrongSquare, ...blackState })?.kind).not.toBe('selected');
    }
  });

  it('keeps last-move endpoints and check on their exact board squares', () => {
    const lastMove = { from: 'b8', to: 'c6' };
    expectOnlySquares({ lastMove }, ['b8', 'c6'], 'lastMove');
    expectOnlySquares({ checkSquare: 'e1' }, ['e1'], 'check');
    expectOnlySquares({ checkSquare: 'e8' }, ['e8'], 'check');

    expect(board3DHighlightStyle({ square: 'b1', lastMove })).toBeNull();
    expect(board3DHighlightStyle({ square: 'c3', lastMove })).toBeNull();
    expect(board3DHighlightStyle({ square: 'd8', checkSquare: 'e8' })).toBeNull();
  });

  it('maps every highlighted algebraic square to one unique 3D tile center', () => {
    const centers = new Map();
    for (const square of ALL_SQUARES) {
      const { x, z } = squarePosition(square);
      const key = `${x}:${z}`;
      expect(centers.has(key), `${square} shares a 3D center with ${centers.get(key)}`).toBe(false);
      centers.set(key, square);
    }
    expect(centers.size).toBe(64);

    expect(squarePosition('a1')).toEqual({ x: -3.5, z: 3.5 });
    expect(squarePosition('h1')).toEqual({ x: 3.5, z: 3.5 });
    expect(squarePosition('a8')).toEqual({ x: -3.5, z: -3.5 });
    expect(squarePosition('h8')).toEqual({ x: 3.5, z: -3.5 });
    expect(squarePosition('d8')).toEqual({ x: -0.5, z: -3.5 });
    expect(squarePosition('e8')).toEqual({ x: 0.5, z: -3.5 });
  });

  it('keeps Combat technique targets distinct from ordinary legal moves and captures', () => {
    const technique = board3DHighlightStyle({
      square: 'f5',
      legalMap: new Map([['f5', { capture: false, technique: true }]]),
    });
    const normal = board3DHighlightStyle({
      square: 'e4',
      legalMap: new Map([['e4', { capture: false, technique: false }]]),
    });
    expect(technique).toMatchObject({ kind: 'technique', color: BOARD3D_HIGHLIGHT_COLORS.technique, opacity: 0.9 });
    expect(technique.color).not.toBe(normal.color);
  });

  it('keeps semantic precedence: parity < capture/technique < selection < check', () => {
    const parity = { parityHighlights: { d5: 'mistake', e2: 'terrain', e8: 'veteran', f5: 'xp' } };
    const capture = board3DHighlightStyle({ square: 'd5', hintMove: parity, legalMap: new Map([['d5', true]]) });
    const technique = board3DHighlightStyle({ square: 'f5', hintMove: parity, legalMap: new Map([['f5', { technique: true }]]) });
    const selected = board3DHighlightStyle({ square: 'e2', hintMove: parity, selectedSquare: 'e2', legalMap: new Map([['e2', false]]) });
    const check = board3DHighlightStyle({ square: 'e8', hintMove: parity, selectedSquare: 'e8', checkSquare: 'e8', legalMap: new Map() });
    expect(capture).toMatchObject({ kind: 'capture', color: BOARD3D_HIGHLIGHT_COLORS.capture });
    expect(technique).toMatchObject({ kind: 'technique', color: BOARD3D_HIGHLIGHT_COLORS.technique });
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

  it('renders forensic mistakes and arena terrain with distinct 3D semantics', () => {
    const mistake = board3DHighlightStyle({
      square: 'f3',
      hintMove: { parityHighlights: { f3: 'mistake' } },
    });
    const terrain = board3DHighlightStyle({
      square: 'd4',
      hintMove: { parityHighlights: { d4: 'terrain' } },
    });
    const veteran = board3DHighlightStyle({
      square: 'e2',
      hintMove: { parityHighlights: { e2: 'veteran' } },
    });

    expect(mistake).toMatchObject({ kind: 'mistake', color: BOARD3D_HIGHLIGHT_COLORS.mistake });
    expect(terrain).toMatchObject({ kind: 'terrain', color: BOARD3D_HIGHLIGHT_COLORS.terrain });
    expect(veteran).toMatchObject({ kind: 'veteran', color: BOARD3D_HIGHLIGHT_COLORS.veteran });
    expect(mistake.color).not.toBe(terrain.color);
  });
});
