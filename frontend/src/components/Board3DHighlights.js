export const BOARD3D_HIGHLIGHT_Y = 0.122;
export const BOARD3D_HIGHLIGHT_SIZE = 0.86;

export const BOARD3D_HIGHLIGHT_COLORS = Object.freeze({
  focus: 0x6f6650,
  hover: 0x1d6f9d,
  lastMove: 0x9a7722,
  hint: 0x175f86,
  legal: 0x145f8a,
  capture: 0x8f3028,
  selected: 0x0b3f66,
  check: 0xc52d28,
});

export function board3DHighlightStyle({
  square,
  focusedSquare,
  hoveredSquare,
  lastMove,
  hintMove,
  legalMap,
  selectedSquare,
  checkSquare,
} = {}) {
  let color = null;
  let opacity = 0.82;
  let scale = 1;

  if (focusedSquare === square) { color = BOARD3D_HIGHLIGHT_COLORS.focus; opacity = 0.38; }
  if (hoveredSquare === square) { color = BOARD3D_HIGHLIGHT_COLORS.hover; opacity = 0.62; }
  if (lastMove && (square === lastMove.from || square === lastMove.to)) {
    color = BOARD3D_HIGHLIGHT_COLORS.lastMove;
    opacity = 0.72;
  }
  if (hintMove && (square === hintMove.from || square === hintMove.to)) {
    color = BOARD3D_HIGHLIGHT_COLORS.hint;
    opacity = 0.82;
  }
  if (legalMap?.has?.(square)) {
    color = legalMap.get(square) ? BOARD3D_HIGHLIGHT_COLORS.capture : BOARD3D_HIGHLIGHT_COLORS.legal;
    opacity = legalMap.get(square) ? 0.9 : 0.86;
  }
  if (selectedSquare === square) {
    color = BOARD3D_HIGHLIGHT_COLORS.selected;
    opacity = 0.96;
    scale = 1.045;
  }
  if (checkSquare === square) {
    color = BOARD3D_HIGHLIGHT_COLORS.check;
    opacity = 0.98;
    scale = 1.045;
  }

  return color == null ? null : { color, opacity, scale };
}
