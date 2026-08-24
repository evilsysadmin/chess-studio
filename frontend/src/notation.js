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
