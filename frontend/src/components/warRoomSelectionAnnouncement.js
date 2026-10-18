const CHESS_SQUARE = /^[a-h][1-8]$/;

export function warRoomSelectionAnnouncement({ selectedSquare, legalTargets = [], disabled = false } = {}) {
  if (disabled || !CHESS_SQUARE.test(String(selectedSquare || ''))) return '';

  // Promotions may contribute four legal moves to the same destination:
  // announce distinct squares, never duplicate destinations or engine SAN.
  const destinations = [...new Set(
    (Array.isArray(legalTargets) ? legalTargets : [])
      .map((move) => move?.to)
      .filter((square) => typeof square === 'string' && CHESS_SQUARE.test(square)),
  )];

  if (!destinations.length) {
    return `Casilla ${selectedSquare} seleccionada. Sin destinos legales.`;
  }

  const spoken = destinations.slice(0, 8);
  const remaining = destinations.length - spoken.length;
  const count = destinations.length;
  const other = remaining > 0 ? `, y ${remaining} más` : '';
  return `Casilla ${selectedSquare} seleccionada. ${count} ${count === 1 ? 'destino legal' : 'destinos legales'}: ${spoken.join(', ')}${other}.`;
}
