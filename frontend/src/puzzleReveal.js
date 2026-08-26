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

  return { played, preferred, line, displayFen };
}
