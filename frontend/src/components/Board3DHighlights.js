export const BOARD3D_HIGHLIGHT_Y = 0.116;
export const BOARD3D_HIGHLIGHT_SIZE = 0.84;

/* The War Room stays warm (brass, wood, stone and fire), but legal destinations
 * need a deliberately cool contrast so they remain readable on both light and
 * dark board tiles. Highlights intentionally stay inset and translucent: they
 * should read as light caught by the stone surface, not coloured UI cards laid
 * over the board. Active interaction still wins over ambient annotations:
 * parity < legal/technique < selection < check. */
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
  schoolFocus: 0x4a8498,
  schoolDanger: 0xb84a3a,
  technique: 0x755fc4,
  legal: 0x245f9f,
  capture: 0x96462e,
  selected: 0xc99a43,
  check: 0xb33d29,
});

const PARITY_STYLE = Object.freeze({
  mistake: Object.freeze({ color: BOARD3D_HIGHLIGHT_COLORS.mistake, opacity: 0.62, scale: 0.92 }),
  terrain: Object.freeze({ color: BOARD3D_HIGHLIGHT_COLORS.terrain, opacity: 0.64, scale: 0.9 }),
  deployment: Object.freeze({ color: BOARD3D_HIGHLIGHT_COLORS.deployment, opacity: 0.52, scale: 0.88 }),
  mercenary: Object.freeze({ color: BOARD3D_HIGHLIGHT_COLORS.mercenary, opacity: 0.48, scale: 0.88 }),
  veteran: Object.freeze({ color: BOARD3D_HIGHLIGHT_COLORS.veteran, opacity: 0.42, scale: 0.86 }),
  xp: Object.freeze({ color: BOARD3D_HIGHLIGHT_COLORS.xp, opacity: 0.44, scale: 0.84 }),
  special: Object.freeze({ color: BOARD3D_HIGHLIGHT_COLORS.special, opacity: 0.5, scale: 0.88 }),
  schoolFocus: Object.freeze({ color: BOARD3D_HIGHLIGHT_COLORS.schoolFocus, opacity: 0.5, scale: 0.86 }),
  schoolDanger: Object.freeze({ color: BOARD3D_HIGHLIGHT_COLORS.schoolDanger, opacity: 0.66, scale: 0.9 }),
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
  let opacity = 0.62;
  let scale = 1;

  if (focusedSquare === square) { kind = 'focus'; color = BOARD3D_HIGHLIGHT_COLORS.focus; opacity = 0.24; scale = 0.94; }
  if (hoveredSquare === square) { kind = 'hover'; color = BOARD3D_HIGHLIGHT_COLORS.hover; opacity = 0.34; scale = 0.96; }
  if (lastMove && (square === lastMove.from || square === lastMove.to)) {
    kind = 'lastMove';
    color = BOARD3D_HIGHLIGHT_COLORS.lastMove;
    opacity = 0.42;
    scale = 0.94;
  }
  if (hintMove && (square === hintMove.from || square === hintMove.to)) {
    kind = 'hint';
    color = BOARD3D_HIGHLIGHT_COLORS.hint;
    opacity = 0.5;
    scale = 0.92;
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
      opacity = 0.68;
      scale = 0.88;
    } else {
      kind = meta.capture ? 'capture' : 'legal';
      color = meta.capture ? BOARD3D_HIGHLIGHT_COLORS.capture : BOARD3D_HIGHLIGHT_COLORS.legal;
      opacity = meta.capture ? 0.66 : 0.62;
      scale = meta.capture ? 0.86 : 0.8;
    }
  }
  if (selectedSquare === square) {
    kind = 'selected';
    color = BOARD3D_HIGHLIGHT_COLORS.selected;
    opacity = 0.7;
    scale = 0.96;
  }
  if (checkSquare === square) {
    kind = 'check';
    color = BOARD3D_HIGHLIGHT_COLORS.check;
    opacity = 0.78;
    scale = 0.98;
  }

  return color == null ? null : { kind, color, opacity, scale };
}
