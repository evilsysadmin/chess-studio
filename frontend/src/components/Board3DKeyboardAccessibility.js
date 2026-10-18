import { adjacentSquare } from './Board3DBoardMath.js';

const PIECE_NAMES = {
  p: 'peón', n: 'caballo', b: 'alfil',
  r: 'torre', q: 'dama', k: 'rey',
};
const SQUARE_PATTERN = /^[a-h][1-8]$/;

export function board3DKeyboardFocusAnnouncement({
  focusedSquare, pieces = [], selectedSquare = null, legalTargets = [],
} = {}) {
  if (!SQUARE_PATTERN.test(String(focusedSquare || ''))) return '';
  const occupant = pieces.find((piece) => piece.square === focusedSquare);
  const content = occupant && PIECE_NAMES[occupant.type]
    ? `${PIECE_NAMES[occupant.type]} ${occupant.color === 'w' ? 'blanco' : 'negro'}`
    : 'vacía';
  const selected = focusedSquare === selectedSquare;
  const legal = !selected && selectedSquare
    && legalTargets.some((move) => move?.to === focusedSquare);
  const suffix = selected ? ' Seleccionada.' : legal ? ' Destino legal.' : '';
  return `Casilla ${focusedSquare}: ${content}.${suffix}`;
}

export function handleBoard3DKeyboardEvent(event, {
  focusedSquare, orientation, onSquareClick, setFocusedSquare,
}) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onSquareClick?.(focusedSquare);
    return;
  }
  const next = adjacentSquare(focusedSquare, event.key, orientation);
  if (!next) return;
  event.preventDefault();
  setFocusedSquare(next);
}
