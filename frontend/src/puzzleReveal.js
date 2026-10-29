import { Chess } from 'chess.js';

function parseMove(fen, san) {
  if (!fen || !san) return null;
  try {
    const board = new Chess(fen);
    const move = board.move(san);
    if (!move) return null;
    const symbol = move.color === 'w' ? move.piece.toUpperCase() : move.piece;
    return { from: move.from, to: move.to, san: move.san, piece: symbol };
  } catch {
    return null;
  }
}

function fenAfterMove(fen, san) {
  if (!fen || !san) return fen || '';
  try {
    const board = new Chess(fen);
    return board.move(san) ? board.fen() : fen;
  } catch {
    return fen;
  }
}

export function buildPuzzleReveal(puzzle) {
  const initialFen = puzzle?.fen || '';
  const played = parseMove(initialFen, puzzle?.played);
  const preferred = parseMove(initialFen, puzzle?.solution?.[0]);
  // Igual que Replay/Autopsia: enseñamos el tablero después del error.
  // Así la pieza real queda en el destino y Board puede reconstruir una
  // copia fantasma en el origen, con ambas casillas encuadradas en rojo.
  const displayFen = played ? fenAfterMove(initialFen, puzzle?.played) : initialFen;
  const line = [];

  try {
    const board = new Chess(initialFen);
    for (const san of puzzle?.solution || []) {
      const move = board.move(san);
      if (!move) break;
      line.push(move.san);
    }
  } catch {
    // Un puzzle incompleto no debe romper la pantalla de entrenamiento.
  }

  return { played, preferred, line, displayFen, explanation: puzzle?.solutionExplanation || null };
}


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
