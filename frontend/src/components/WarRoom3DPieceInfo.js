const PIECE_NAMES = Object.freeze({
  p: 'Peón',
  n: 'Caballo',
  b: 'Alfil',
  r: 'Torre',
  q: 'Dama',
  k: 'Rey',
});

export function pieceTooltipText(piece) {
  if (!piece?.type || !piece?.square) return null;
  const color = piece.color === 'b' ? 'negro' : 'blanco';
  if (piece.matthiasKing) return `Matthias · Rey ${color} · ${piece.square.toUpperCase()}`;
  const name = PIECE_NAMES[piece.type] || 'Pieza';
  return `${name} ${color} · ${piece.square.toUpperCase()}`;
}

export function pieceName(type) {
  return PIECE_NAMES[type] || 'Pieza';
}
