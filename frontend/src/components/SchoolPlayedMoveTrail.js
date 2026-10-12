import { Chess } from 'chess.js';
import { schoolVerifiedMoveConsequence } from './SchoolMoveConsequences.js';

/**
 * Rebuild only the moves ALREADY applied on the real School board.
 * No expected future step may enter this list, especially during exams.
 * Corrupt/illegal lines fail closed instead of displaying invented moves.
 */
export function buildSchoolPlayedMoveTrail({ fen, line = [], lineIndex = 0 } = {}) {
  if (!Array.isArray(line) || !Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex > line.length) return [];
  if (!lineIndex) return [];

  let board;
  try {
    board = new Chess(fen);
  } catch {
    return [];
  }

  const played = [];
  for (let index = 0; index < lineIndex; index += 1) {
    const step = line[index];
    if (!step?.from || !step?.to) return [];
    const moveNumber = Number(board.fen().split(' ')[5]);
    let move;
    try {
      move = board.move({ from: step.from, to: step.to, promotion: 'q' });
    } catch {
      return [];
    }
    if (!move) return [];
    played.push(Object.freeze({
      id: index,
      moveNumber,
      color: move.color,
      san: move.san,
      auto: Boolean(step.auto),
      note: step.note || null,
      insight: step.auto ? null : schoolVerifiedMoveConsequence(board, move),
    }));
  }
  return played;
}
