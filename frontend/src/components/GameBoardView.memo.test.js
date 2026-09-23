import { describe, expect, it, vi } from 'vitest';
import { sameBoardSurfaceProps } from './WarRoomBoardSurface.jsx';

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

describe('WarRoom board surface memo contract', () => {
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

  it('rerenderiza si cambia el fallback visible del surface 3D', () => {
    const first = { ...props(), isThreeD: true, loadingLabel: 'Preparando sala 3D…', loadingClassName: 'hint-text' };
    const second = { ...first, loadingLabel: 'Abriendo la sala…' };
    expect(sameBoardSurfaceProps(first, second)).toBe(false);
  });
});
