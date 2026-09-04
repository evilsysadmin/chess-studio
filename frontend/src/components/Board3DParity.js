import { FILES } from './Board3DConfig.js';

const RANKS = Object.freeze(['1', '2', '3', '4', '5', '6', '7', '8']);
const BOARD_SQUARES = Object.freeze(RANKS.flatMap((rank) => FILES.map((file) => `${file}${rank}`)));

function finitePositive(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function safeSquareClass(squareClassName, square) {
  if (typeof squareClassName !== 'function') return '';
  try {
    return String(squareClassName(square) || '');
  } catch {
    return '';
  }
}

function classHighlightKind(className) {
  if (!className) return null;
  if (/arena-terrain-blocked|terrain-blocked|\bblocked\b/i.test(className)) return 'terrain';
  if (/mercenary/i.test(className)) return 'mercenary';
  if (/deployment-square-drop-hover|deployment-square-valid/i.test(className)) return 'deployment';
  if (/danger|hazard|forensic/i.test(className)) return 'special';
  return null;
}

export function buildBoard3DParityHighlights({
  mistakeMove,
  squareClassName,
  pieceLevels,
  pieceRankLevels,
  pieceXp,
  pieceVeteranMarks,
} = {}) {
  const highlights = {};

  for (const square of BOARD_SQUARES) {
    const classKind = classHighlightKind(safeSquareClass(squareClassName, square));
    if (classKind) highlights[square] = classKind;

    if (!highlights[square]) {
      const rankOrLevel = finitePositive(pieceRankLevels?.[square] ?? pieceLevels?.[square]);
      const xp = finitePositive(pieceXp?.[square]);
      const veteranMarks = Array.isArray(pieceVeteranMarks?.[square]) ? pieceVeteranMarks[square] : [];
      if (rankOrLevel > 1 || veteranMarks.length > 0) highlights[square] = 'veteran';
      else if (xp > 0) highlights[square] = 'xp';
    }
  }

  if (mistakeMove?.from) highlights[mistakeMove.from] = 'mistake';
  if (mistakeMove?.to) highlights[mistakeMove.to] = 'mistake';
  return highlights;
}

export function buildBoard3DParityHintMove(props = {}) {
  const parityHighlights = buildBoard3DParityHighlights(props);
  const hasParityHighlights = Object.keys(parityHighlights).length > 0;
  const hintMove = props.hintMove && typeof props.hintMove === 'object' ? props.hintMove : null;
  if (!hintMove && !hasParityHighlights) return null;
  return {
    ...(hintMove || {}),
    parityHighlights,
  };
}

function markText(mark) {
  if (!mark) return null;
  if (typeof mark === 'string') return mark;
  const glyph = String(mark.glyph || '✦').trim();
  const label = String(mark.label || mark.short || mark.id || '').trim();
  return label ? `${glyph} ${label}` : glyph;
}

export function buildBoard3DParityRows({
  pieces = [],
  pieceLevels,
  pieceRankLevels,
  pieceXp,
  pieceVeteranMarks,
  pieceLabels,
} = {}) {
  return (Array.isArray(pieces) ? pieces : []).map((piece) => {
    const square = piece?.square;
    if (!square) return null;
    const tokens = [];
    const label = String(pieceLabels?.[square] || '').trim();
    const rank = finitePositive(pieceRankLevels?.[square]);
    const level = finitePositive(pieceLevels?.[square]);
    const xp = finitePositive(pieceXp?.[square]);
    const marks = Array.isArray(pieceVeteranMarks?.[square]) ? pieceVeteranMarks[square] : [];

    if (label) tokens.push(label);
    if (rank > 1) tokens.push(`rango ${rank}`);
    else if (level > 1) tokens.push(`nv.${level}`);
    if (xp > 0) tokens.push(`${xp} XP`);
    marks.slice(0, 2).map(markText).filter(Boolean).forEach((text) => tokens.push(text));

    return tokens.length ? { square, text: tokens.join(' · ') } : null;
  }).filter(Boolean);
}
