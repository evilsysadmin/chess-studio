import { describe, expect, it } from 'vitest';
import { QUICK_MATCH_READY_ROOM_STARTING_POSITION } from './QuickMatchReadyRoomScene3D.jsx';

const BACK_RANK = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

function row(color, rank) {
  return QUICK_MATCH_READY_ROOM_STARTING_POSITION
    .filter((piece) => piece.color === color && piece.rank === rank)
    .sort((a, b) => a.file - b.file);
}

describe('QuickMatchReadyRoom canonical chess setup', () => {
  it('uses a complete standard starting position with one piece per square', () => {
    expect(QUICK_MATCH_READY_ROOM_STARTING_POSITION).toHaveLength(32);

    const occupied = new Set(
      QUICK_MATCH_READY_ROOM_STARTING_POSITION.map(({ file, rank }) => `${file}:${rank}`),
    );
    expect(occupied.size).toBe(32);
  });

  it('keeps both back ranks and pawn ranks on their standard squares', () => {
    expect(row('black', 0).map(({ type }) => type)).toEqual(BACK_RANK);
    expect(row('black', 1).map(({ type }) => type)).toEqual(Array(8).fill('pawn'));
    expect(row('white', 6).map(({ type }) => type)).toEqual(Array(8).fill('pawn'));
    expect(row('white', 7).map(({ type }) => type)).toEqual(BACK_RANK);
  });

  it('keeps queens on file d and kings on file e', () => {
    for (const color of ['white', 'black']) {
      const pieces = QUICK_MATCH_READY_ROOM_STARTING_POSITION.filter((piece) => piece.color === color);
      expect(pieces.find((piece) => piece.type === 'queen')?.file).toBe(3);
      expect(pieces.find((piece) => piece.type === 'king')?.file).toBe(4);
    }
  });
});
