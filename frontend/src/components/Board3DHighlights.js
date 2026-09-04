export const BOARD3D_HIGHLIGHT_Y = 0.122;
export const BOARD3D_HIGHLIGHT_SIZE = 0.86;

/* The War Room stays warm (brass, wood, stone and fire), but legal destinations
 * need a deliberately cool contrast so they remain readable on both light and
 * dark board tiles. The extra parity tones let non-standard surfaces preserve
 * information that used to exist only as 2D CSS classes. Active interaction
 * still wins over ambient annotations: parity < legal/technique < selection < check. */
export const BOARD3D_HIGHLIGHT_COLORS = Object.freeze({
  focus: 0x76674f,
  hover: 0xb5873f,
  lastMove: 0x987127,
  hint: 0x81765c,
  mistake: 0xb54a3a,
  terrain: 0x5f6469,
  deployment: 0x4f7a9b,
  mercenary: 0x80549a,
  veteran: 0xb58a38,
  xp: 0x3f8d67,
  special: 0x4b8a8d,
  technique: 0x755fc4,
  legal: 0x245f9f,
  capture: 0x96462e,
  selected: 0xc99a43,
  check: 0xb33d29,
});

const PARITY_STYLE = Object.freeze({
  mistake: Object.freeze({ color: BOARD3D_HIGHLIGHT_COLORS.mistake, opacity: 0.76, scale: 0.94 }),
  terrain: Object.freeze({ color: BOARD3D_HIGHLIGHT_COLORS.terrain, opacity: 0.82, scale: 0.9 }),
  deployment: Object.freeze({ color: BOARD3D_HIGHLIGHT_COLORS.deployment, opacity: 0.64, scale: 0.88 }),
  mercenary: Object.freeze({ color: BOARD3D_HIGHLIGHT_COLORS.mercenary, opacity: 0.58, scale: 0.88 }),
  veteran: Object.freeze({ color: BOARD3D_HIGHLIGHT_COLORS.veteran, opacity: 0.48, scale: 0.86 }),
  xp: Object.freeze({ color: BOARD3D_HIGHLIGHT_COLORS.xp, opacity: 0.5, scale: 0.84 }),
  special: Object.freeze({ color: BOARD3D_HIGHLIGHT_COLORS.special, opacity: 0.58, scale: 0.88 }),
});

function legalMeta(value) {
  if (value && typeof value === 'object') {
    return { capture: Boolean(value.capture), technique: Boolean(value.technique) };
  }
  return { capture: Boolean(value), technique: false };
}

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

  const parityKind = hintMove?.parityHighlights?.[square];
  const parityStyle = PARITY_STYLE[parityKind];
  if (parityStyle) {
    kind = parityKind;
    color = parityStyle.color;
    opacity = parityStyle.opacity;
    scale = parityStyle.scale;
  }

  if (legalMap?.has?.(square)) {
    const meta = legalMeta(legalMap.get(square));
    if (meta.technique) {
      kind = 'technique';
      color = BOARD3D_HIGHLIGHT_COLORS.technique;
      opacity = 0.9;
      scale = 0.91;
    } else {
      kind = meta.capture ? 'capture' : 'legal';
      color = meta.capture ? BOARD3D_HIGHLIGHT_COLORS.capture : BOARD3D_HIGHLIGHT_COLORS.legal;
      opacity = meta.capture ? 0.8 : 0.84;
      scale = meta.capture ? 0.9 : 0.82;
    }
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
