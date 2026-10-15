import { Chess } from 'chess.js';
import { buildPuzzleReveal } from './puzzleReveal.js';

// Read-only comparison of two *legal moves from the same stored position*.
// This is not a new engine, and it must never create a training obligation.
export function buildInsightsPositionAutopsy(puzzle) {
  if (puzzle?.source !== 'autopsy'
    || typeof puzzle?.fen !== 'string'
    || typeof puzzle?.played !== 'string'
    || !Array.isArray(puzzle?.solution)
    || !puzzle.solution[0]
    || !Number.isFinite(Number(puzzle.loss))
    || Number(puzzle.loss) < 80) return null;

  const { played, preferred } = buildPuzzleReveal(puzzle);
  if (!played || !preferred
    || (played.from === preferred.from && played.to === preferred.to && played.san === preferred.san)) return null;

  try {
    const before = new Chess(puzzle.fen);
    if (before.isGameOver()) return null;
    const orientation = before.turn();
    const original = new Chess(puzzle.fen);
    const alternative = new Chess(puzzle.fen);
    if (!original.move(played.san) || !alternative.move(preferred.san)) return null;
    return {
      orientation,
      lossCp: Math.max(0, Math.round(Number(puzzle.loss))),
      views: [
        { id: 'before', label: 'Antes', fen: puzzle.fen, move: null },
        { id: 'played', label: 'Tu jugada', fen: original.fen(), move: played },
        { id: 'preferred', label: 'Alternativa', fen: alternative.fen(), move: preferred },
      ],
    };
  } catch {
    return null;
  }
}
