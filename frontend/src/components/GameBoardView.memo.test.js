import { describe, expect, it, vi } from 'vitest';
import { sameBoardSurfaceProps } from './GameBoardView.jsx';

function props(overrides = {}) {
  return {
    isThreeD: false,
    boardProps: {
      gameId: 'g1',
      fen: 'fen-a',
      onSquareClick: vi.fn(),
      selectedSquare: 'e2',
      legalTargets: [{ to: 'e4', san: 'e4' }],
      lastMove: null,
      animate: null,
      hintMove: null,
      checkSquare: null,
      gameOver: false,
      turnState: 'human',
      orientation: 'white',
      showCoordinates: true,
      matthiasKingColor: 'b',
      onCustomize: vi.fn(),
      hansFireplaceIteration: false,
      hansFireCallEnabled: false,
      ...overrides,
    },
  };
}

describe('GameBoardView board surface memo contract', () => {
  it('ignora arrays recreados de objetivos si su contenido no cambia', () => {
    const first = props();
    const second = props({
      onSquareClick: first.boardProps.onSquareClick,
      onCustomize: first.boardProps.onCustomize,
      legalTargets: [{ to: 'e4', san: 'e4' }],
    });
    expect(sameBoardSurfaceProps(first, second)).toBe(true);
  });

  it('rerenderiza cuando cambia una entrada visual real del tablero', () => {
    const first = props();
    const stable = {
      onSquareClick: first.boardProps.onSquareClick,
      onCustomize: first.boardProps.onCustomize,
    };
    expect(sameBoardSurfaceProps(first, props({ ...stable, fen: 'fen-b' }))).toBe(false);
    expect(sameBoardSurfaceProps(first, props({ ...stable, legalTargets: [{ to: 'e3', san: 'e3' }] }))).toBe(false);
    expect(sameBoardSurfaceProps(first, { ...props(stable), isThreeD: true })).toBe(false);
  });
});
