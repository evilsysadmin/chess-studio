// Helpers puros para interpretar historiales que empiezan desde FEN.
// No dependen de chess.js a propósito: estadísticas/UX offline pueden usarlos
// incluso en los gates que corren sin instalar dependencias npm.

export function historyStart(initialFen = null) {
  if (!initialFen) return { color: 'w', fullmove: 1, valid: true };
  const parts = String(initialFen).trim().split(/\s+/);
  if (parts.length < 6) return { color: 'w', fullmove: 1, valid: false };
  const color = parts[1] === 'b' ? 'b' : parts[1] === 'w' ? 'w' : null;
  const fullmove = Number.parseInt(parts[5], 10);
  if (!color || !Number.isInteger(fullmove) || fullmove < 1) {
    return { color: 'w', fullmove: 1, valid: false };
  }
  return { color, fullmove, valid: true };
}

export function historyMoverColor(index, initialFen = null) {
  const start = historyStart(initialFen).color;
  const offset = Math.max(0, Number(index) || 0);
  return offset % 2 === 0 ? start : (start === 'w' ? 'b' : 'w');
}

export function historyMoveNumber(index, initialFen = null) {
  const start = historyStart(initialFen);
  const offset = Math.max(0, Number(index) || 0);
  const plyFromWhite = offset + (start.color === 'b' ? 1 : 0);
  return start.fullmove + Math.floor(plyFromWhite / 2);
}
