const PIECE_TYPES = new Set(['p', 'n', 'b', 'r', 'q', 'k']);

export function buildBoard3DLegalMap(legalTargets = []) {
  return new Map((Array.isArray(legalTargets) ? legalTargets : []).map((target) => {
    const square = target?.to || target?.square || target;
    return [square, {
      capture: Boolean(target?.captured || target?.san?.includes?.('x')),
      technique: Boolean(target?.technique),
    }];
  }).filter(([square]) => typeof square === 'string' && square.length === 2));
}

export function board3DTechniqueTargetCount(legalTargets = []) {
  return (Array.isArray(legalTargets) ? legalTargets : []).filter((target) => Boolean(target?.technique)).length;
}

export function board3DTerrainSquares(hintMove) {
  const highlights = hintMove?.parityHighlights;
  if (!highlights || typeof highlights !== 'object') return [];
  return Object.entries(highlights)
    .filter(([, kind]) => kind === 'terrain')
    .map(([square]) => square)
    .sort();
}

export function board3DForensicGhost(mistakeMove, pieces = []) {
  const square = String(mistakeMove?.from || '').trim();
  const rawPiece = String(mistakeMove?.piece || '').trim();
  const type = rawPiece.toLowerCase();
  if (!/^[a-h][1-8]$/.test(square) || !PIECE_TYPES.has(type)) return null;
  if ((Array.isArray(pieces) ? pieces : []).some((piece) => piece?.square === square)) return null;
  const color = rawPiece === rawPiece.toUpperCase() ? 'w' : 'b';
  return { square, type, color };
}
