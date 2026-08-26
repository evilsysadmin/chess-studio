import { Chess } from 'chess.js';

// Estado puramente visual: no decide si una jugada es legal ni cambia el
// resultado. Sólo expone dónde debe aparecer el aviso para que un jaque se
// vea directamente sobre el rey afectado.
export function checkedKingSquare(fen) {
  if (!fen) return null;
  try {
    const board = new Chess(fen);
    if (!board.isCheck()) return null;
    const colorInCheck = board.turn();
    return board.board().flat().find((piece) => piece?.type === 'k' && piece.color === colorInCheck)?.square || null;
  } catch {
    return null;
  }
}
