import { describe, expect, it, vi } from 'vitest';
import { sameBoardSurfaceProps } from './WarRoomBoardSurface.jsx';

function props(overrides = {}) {
  return {
    isThreeD: true,
    loadingLabel: 'loading',
    loadingClassName: 'hint',
    boardProps: {
      gameId: 'g1',
      fen: 'fen',
      onSquareClick: vi.fn(),
      selectedSquare: null,
      legalTargets: [],
      lastMove: null,
      animate: null,
      hintMove: null,
      checkSquare: null,
      gameOver: false,
      turnState: 'human',
      orientation: 'white',
      showCoordinates: true,
      matthiasKingColor: null,
      onCustomize: vi.fn(),
      cameraProfile: 'tactical',
      immersive: true,
      warRoomVariantOverride: 'v4',
      warRoomMobilePerformance: true,
      themeOverride: null,
      hansFireplaceIteration: false,
      hansFireCallEnabled: false,
      ...overrides,
    },
  };
}

describe('WarRoomBoardSurface memo contract', () => {
  it.each([
    ['immersive', false],
    ['warRoomVariantOverride', 'duel'],
    ['cameraProfile', 'classroom'],
    ['warRoomMobilePerformance', false],
    ['themeOverride', 'midnight'],
  ])('rerenders when %s changes', (key, value) => {
    const a = props();
    const b = props();
    b.boardProps.onSquareClick = a.boardProps.onSquareClick;
    b.boardProps.onCustomize = a.boardProps.onCustomize;
    b.boardProps[key] = value;

    expect(sameBoardSurfaceProps(a, b)).toBe(false);
  });
});
