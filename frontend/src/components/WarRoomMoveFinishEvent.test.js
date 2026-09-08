import { describe, expect, it } from 'vitest';
import { chessFromFen } from '../chessRules.js';
import {
  armWarRoomMoveFinishEvent,
  clearWarRoomMoveFinishEvent,
  consumeWarRoomMoveFinishEvent,
  deriveWarRoomMoveFinishEvent,
} from './WarRoomMoveFinishEvent.js';

const MATE_FEN = '7k/6Q1/5K2/8/8/8/8/8 b - - 0 1';
const STALEMATE_FEN = '7k/5Q2/5K2/8/8/8/8/8 b - - 0 1';
const WHITE_KINGSIDE_CASTLE_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1RK1 b kq - 1 1';
const WHITE_QUEENSIDE_CASTLE_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/2KR1BNR b kq - 1 1';

describe('War Room move finish events', () => {
  it('arms a finish only for an actual final checkmate position', () => {
    const mate = deriveWarRoomMoveFinishEvent({
      fen: MATE_FEN,
      gameOver: true,
      animate: { seq: 9, from: 'f7', to: 'g7' },
      chessFromFen,
    });
    const stalemate = deriveWarRoomMoveFinishEvent({
      fen: STALEMATE_FEN,
      gameOver: true,
      animate: { seq: 10, from: 'f7', to: 'g7' },
      chessFromFen,
    });
    const timeoutLike = deriveWarRoomMoveFinishEvent({
      fen: MATE_FEN,
      gameOver: false,
      animate: { seq: 11, from: 'f7', to: 'g7' },
      chessFromFen,
    });

    expect(mate).toEqual({ seq: 9, to: 'g7', checkmate: true });
    expect(stalemate).toBeNull();
    expect(timeoutLike).toBeNull();
  });

  it('does not let the wrong piece steal a queued mate finish', () => {
    clearWarRoomMoveFinishEvent();
    armWarRoomMoveFinishEvent({ seq: 12, to: 'g7', checkmate: true });

    expect(consumeWarRoomMoveFinishEvent('h8')).toBeNull();
    expect(consumeWarRoomMoveFinishEvent('g7')).toEqual({ seq: 12, to: 'g7', checkmate: true });
    expect(consumeWarRoomMoveFinishEvent('g7')).toBeNull();
  });

  it('derives exact king and rook targets for both castling sides', () => {
    const kingSide = deriveWarRoomMoveFinishEvent({
      fen: WHITE_KINGSIDE_CASTLE_FEN,
      animate: { seq: 21, from: 'e1', to: 'g1' },
      chessFromFen,
    });
    const queenSide = deriveWarRoomMoveFinishEvent({
      fen: WHITE_QUEENSIDE_CASTLE_FEN,
      animate: { seq: 22, from: 'e1', to: 'c1' },
      chessFromFen,
    });

    expect(kingSide).toEqual({
      seq: 21,
      to: 'g1',
      castling: { side: 'king', kingTo: 'g1', rookTo: 'f1' },
    });
    expect(queenSide).toEqual({
      seq: 22,
      to: 'c1',
      castling: { side: 'queen', kingTo: 'c1', rookTo: 'd1' },
    });
  });

  it('queues the king and rook as two consumers of the same castling event', () => {
    clearWarRoomMoveFinishEvent();
    const castle = deriveWarRoomMoveFinishEvent({
      fen: WHITE_KINGSIDE_CASTLE_FEN,
      animate: { seq: 23, from: 'e1', to: 'g1' },
      chessFromFen,
    });
    armWarRoomMoveFinishEvent(castle);

    expect(consumeWarRoomMoveFinishEvent('g1')).toEqual({
      seq: 23,
      to: 'g1',
      castlingRole: 'king',
      castlingSide: 'king',
    });
    expect(consumeWarRoomMoveFinishEvent('f1')).toEqual({
      seq: 23,
      to: 'f1',
      castlingRole: 'rook',
      castlingSide: 'king',
    });
    expect(consumeWarRoomMoveFinishEvent('f1')).toBeNull();
  });

  it('rejects two-file geometry if the final board does not prove king plus rook castling', () => {
    const fakeFen = '7k/8/8/8/8/8/8/6QK b - - 0 1';
    const fake = deriveWarRoomMoveFinishEvent({
      fen: fakeFen,
      animate: { seq: 24, from: 'e1', to: 'g1' },
      chessFromFen,
    });

    expect(fake).toBeNull();
  });
});
