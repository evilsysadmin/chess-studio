import { describe, expect, it } from 'vitest';
import {
  QUICK_MATCH_READY_ROOM_BOARD_LAYOUT,
  quickMatchReadyRoomSquareCenter,
} from './QuickMatchReadyRoomScene3D.jsx';

describe('QuickMatchReadyRoomScene3D board grid', () => {
  it('keeps all 64 authored square centers on one shared 8x8 grid', () => {
    const { squareSize } = QUICK_MATCH_READY_ROOM_BOARD_LAYOUT;
    const centers = [];

    for (let rank = 0; rank < 8; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const [x, z] = quickMatchReadyRoomSquareCenter(file, rank);
        centers.push(`${x.toFixed(4)}:${z.toFixed(4)}`);

        if (file < 7) {
          const [nextX] = quickMatchReadyRoomSquareCenter(file + 1, rank);
          expect(nextX - x).toBeCloseTo(squareSize, 8);
        }
        if (rank < 7) {
          const [, nextZ] = quickMatchReadyRoomSquareCenter(file, rank + 1);
          expect(nextZ - z).toBeCloseTo(squareSize, 8);
        }
      }
    }

    expect(new Set(centers)).toHaveLength(64);
  });

  it('places the chess starting ranks on square centers, never outside the board', () => {
    const [, blackBackZ] = quickMatchReadyRoomSquareCenter(0, 0);
    const [, blackPawnZ] = quickMatchReadyRoomSquareCenter(0, 1);
    const [, whitePawnZ] = quickMatchReadyRoomSquareCenter(0, 6);
    const [, whiteBackZ] = quickMatchReadyRoomSquareCenter(0, 7);

    expect(blackBackZ).toBeCloseTo(-3.99, 8);
    expect(blackPawnZ).toBeCloseTo(-3.23, 8);
    expect(whitePawnZ).toBeCloseTo(.57, 8);
    expect(whiteBackZ).toBeCloseTo(1.33, 8);
  });
});
