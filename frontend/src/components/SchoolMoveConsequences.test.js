import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { MATTHIAS_SCHOOL_LESSONS } from '../matthiasSchool.js';
import { schoolVerifiedMoveConsequence, schoolRejectedMoveFact } from './SchoolMoveConsequences.js';

const lesson = (id) => MATTHIAS_SCHOOL_LESSONS.find((row) => row.id === id);
function consequence(id, cursor = 0) {
  const entry = lesson(id);
  const board = new Chess(entry.fen);
  let move;
  for (const step of entry.line.slice(0, cursor + 1)) {
    move = board.move({ from: step.from, to: step.to, promotion: 'q' });
  }
  return schoolVerifiedMoveConsequence(board, move);
}

describe('Matthias verified School move consequences', () => {
  it('says nothing about quiet moves without a proven event', () => {
    expect(consequence('pawn-double-step')).toBeNull();
    expect(consequence('opening-development')).toBeNull();
  });

  it('ties a capture to the actual removed piece, never a guessed advantage', () => {
    const text = consequence('pawn-capture');
    expect(text).toContain('caballo');
    expect(text).toContain('f3');
    expect(text).toContain('no demuestra');
  });

  it('detects a checked king, castling, promotion and a true mate', () => {
    expect(consequence('castle-short')).toMatch(/Enroque comprobado/);
    expect(consequence('promotion-capture')).toMatch(/promoci|convirtió en dama/i);
    expect(consequence('mate-one')).toContain('Mate comprobado');
    const board = new Chess('4k3/8/8/8/8/8/8/K2Q4 w - - 0 1');
    const move = board.move({ from: 'd1', to: 'h5' });
    expect(schoolVerifiedMoveConsequence(board, move)).toMatch(/Jaque comprobado/);
  });

  it('only describes an actually legal rejected move, and only with guidance allowed', () => {
    const input = { fen: '4k3/8/8/8/8/8/8/K2Q4 w - - 0 1', from: 'd1', to: 'h5' };
    expect(schoolRejectedMoveFact(input)).toMatch(/Qh5\+ es legal/);
    expect(schoolRejectedMoveFact(input)).toContain('no cumple el objetivo');
    expect(schoolRejectedMoveFact({ ...input, exam: true })).toBeNull();
    expect(schoolRejectedMoveFact({ ...input, noHints: true })).toBeNull();
    expect(schoolRejectedMoveFact({ ...input, to: 'd2' })).toBeNull();
    expect(schoolRejectedMoveFact({ ...input, fen: 'broken' })).toBeNull();
    expect(schoolRejectedMoveFact({ fen: lesson('pawn-double-step').fen, from: 'e2', to: 'e3' })).toBeNull();
  });
});
