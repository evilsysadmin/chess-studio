// notation.js — Formatea una jugada como notación larga (origen y destino
// explícitos, tipo "d2-d4" o "Ng1-f3"), más fácil de leer para quien recién
// empieza que la notación algebraica corta ("d4", "Nf3"), que omite la
// casilla de origen salvo que haga falta para desambiguar.

const PIECE_LETTERS = { n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' }; // el peón no lleva letra

export function formatLongMove(move) {
  if (!move || !move.from || !move.to) return '';
  const letter = PIECE_LETTERS[move.piece] || '';
  const sep = move.captured ? 'x' : '-';
  return `${letter}${move.from}${sep}${move.to}`;
}

// Si `piece`/`from`/`to` corresponden a un enroque, devuelve el from/to de
// la TORRE que se mueve junto con el rey — o null si no es un enroque.
// No depende de las `flags` de chess.js a propósito: así sirve igual para
// la jugada del humano (que sí trae flags) y la de la CPU (que llega del
// backend solo con from/to/piece, sin flags).
const CASTLING_ROOK_MOVES = {
  e1g1: { from: 'h1', to: 'f1' },
  e1c1: { from: 'a1', to: 'd1' },
  e8g8: { from: 'h8', to: 'f8' },
  e8c8: { from: 'a8', to: 'd8' },
};

export function castlingRookMove(piece, from, to) {
  if (piece !== 'k') return null;
  return CASTLING_ROOK_MOVES[`${from}${to}`] || null;
}
