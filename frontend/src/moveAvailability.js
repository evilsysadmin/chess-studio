import { Chess } from 'chess.js';

// Explica un caso que visualmente puede parecer un bug: una pieza propia se
// puede seleccionar aunque no tenga ningún destino legal. Esto es normal en
// ajedrez (pieza clavada, peón bloqueado, etc.), pero la UI debe decir por qué
// en vez de quedarse muda.
function absolutePinReason(chess, square, color) {
  if (!chess || !square) return null;
  const piece = chess.get(square);
  if (!piece || piece.color !== color || piece.type === 'k' || chess.turn() !== color) return null;
  try {
    const probe = new Chess(chess.fen());
    probe.remove(square);
    if (probe.inCheck()) {
      return {
        kind: 'pinned',
        text: 'Clavada al rey: si mueves esa pieza, dejas a tu rey en jaque.',
      };
    }
  } catch {
    return null;
  }
  return null;
}

// Se usa cuando el usuario intenta un destino que chess.js rechaza. No
// pitamos por cualquier click absurdo: sólo cuando podemos atribuirlo a
// seguridad del rey con bastante certeza (pieza absolutamente clavada, o el
// propio rey intentando entrar en una casilla adyacente atacada).
export function isKingSafetyIllegalAttempt(chess, from, to, color) {
  if (!chess || !from || !to) return false;
  const piece = chess.get(from);
  if (!piece || piece.color !== color || chess.turn() !== color) return false;
  const target = chess.get(to);
  if (target?.color === color) return false;
  if (absolutePinReason(chess, from, color)) return true;
  if (piece.type !== 'k') return false;
  const fileDelta = Math.abs(from.charCodeAt(0) - to.charCodeAt(0));
  const rankDelta = Math.abs(Number(from[1]) - Number(to[1]));
  return Math.max(fileDelta, rankDelta) === 1;
}

export function immobilityReason(chess, square, color) {
  if (!chess || !square) return null;
  const piece = chess.get(square);
  if (!piece || piece.color !== color) return null;

  const legal = chess.moves({ square, verbose: true });
  if (legal.length > 0) return null;

  const pin = absolutePinReason(chess, square, color);
  if (pin) return pin;

  return {
    kind: 'blocked',
    text: 'Esa pieza no tiene ninguna jugada legal en esta posición.',
  };
}
