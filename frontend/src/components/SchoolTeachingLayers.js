const SQUARE_RE = /^[a-h][1-8]$/;

function cleanSquare(value) {
  const square = String(value || '').trim().toLowerCase();
  return SQUARE_RE.test(square) ? square : null;
}

function cleanSquares(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(cleanSquare).filter(Boolean))];
}

export function buildSchoolTeachingLayers({ guideMove = null, dangerSquares = [] } = {}) {
  const from = cleanSquare(guideMove?.from);
  const to = cleanSquare(guideMove?.to);
  const focusSquares = from ? [from] : [];
  const moveCue = from && to ? { from, to } : null;
  return Object.freeze({
    focusSquares: Object.freeze(focusSquares),
    dangerSquares: Object.freeze(cleanSquares(dangerSquares)),
    moveCue,
  });
}

export function schoolTeachingSquareClass(layers, square) {
  const target = cleanSquare(square);
  if (!target) return '';
  const classes = [];
  if (layers?.focusSquares?.includes?.(target)) classes.push('classroom-focus');
  if (layers?.dangerSquares?.includes?.(target)) classes.push('classroom-danger');
  return classes.join(' ');
}

export function schoolTeachingHintMove(layers) {
  if (layers?.moveCue?.from && layers?.moveCue?.to) return layers.moveCue;
  const from = layers?.focusSquares?.[0];
  return from ? { from } : null;
}
