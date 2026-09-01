export const COARSE_PIECE_HIT_TARGET = Object.freeze({
  radius: 0.46,
  height: 1.45,
  centerY: 0.62,
});

export function resolveBoardTap(start, end, { coarsePointer = false } = {}) {
  if (!start || !end || start.id !== end.id) return null;
  const tolerance = coarsePointer ? 18 : 8;
  const distance = Math.hypot(Number(end.x) - Number(start.x), Number(end.y) - Number(start.y));
  if (!Number.isFinite(distance) || distance > tolerance) return null;

  // En táctil usamos el punto inicial: al levantar el dedo suele haber unos
  // píxeles de deriva que, con la perspectiva del tablero 3D, pueden mandar
  // el rayo a la casilla vecina. Ratón/trackpad mantienen el punto final.
  return coarsePointer
    ? { x: Number(start.x), y: Number(start.y) }
    : { x: Number(end.x), y: Number(end.y) };
}
