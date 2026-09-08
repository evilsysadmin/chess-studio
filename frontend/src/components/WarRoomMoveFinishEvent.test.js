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
});
