export const BOARD3D_HIGHLIGHT_Y = 0.122;
export const BOARD3D_HIGHLIGHT_SIZE = 0.86;

/* The War Room is brass, wood, stone and fire. Interaction feedback should
 * belong to that room instead of looking like a blue debug overlay. */
export const BOARD3D_HIGHLIGHT_COLORS = Object.freeze({
  focus: 0x76674f,
  hover: 0xb5873f,
  lastMove: 0x987127,
  hint: 0x81765c,
  legal: 0x9c8244,
  capture: 0x96462e,
  selected: 0xc99a43,
  check: 0xb33d29,
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
  let kind = null;
  let color = null;
  let opacity = 0.74;
  let scale = 1;

  if (focusedSquare === square) { kind = 'focus'; color = BOARD3D_HIGHLIGHT_COLORS.focus; opacity = 0.3; }
  if (hoveredSquare === square) { kind = 'hover'; color = BOARD3D_HIGHLIGHT_COLORS.hover; opacity = 0.48; scale = 1.012; }
  if (lastMove && (square === lastMove.from || square === lastMove.to)) {
    kind = 'lastMove';
    color = BOARD3D_HIGHLIGHT_COLORS.lastMove;
    opacity = 0.58;
  }
  if (hintMove && (square === hintMove.from || square === hintMove.to)) {
    kind = 'hint';
    color = BOARD3D_HIGHLIGHT_COLORS.hint;
    opacity = 0.7;
  }
  if (legalMap?.has?.(square)) {
    const capture = Boolean(legalMap.get(square));
    kind = capture ? 'capture' : 'legal';
    color = capture ? BOARD3D_HIGHLIGHT_COLORS.capture : BOARD3D_HIGHLIGHT_COLORS.legal;
    opacity = capture ? 0.8 : 0.68;
    scale = capture ? 0.9 : 0.76;
  }
  if (selectedSquare === square) {
    kind = 'selected';
    color = BOARD3D_HIGHLIGHT_COLORS.selected;
    opacity = 0.82;
    scale = 1.03;
  }
  if (checkSquare === square) {
    kind = 'check';
    color = BOARD3D_HIGHLIGHT_COLORS.check;
    opacity = 0.9;
    scale = 1.035;
  }

  return color == null ? null : { kind, color, opacity, scale };
}
