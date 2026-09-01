const EMPTY_RANK = () => Array(8).fill('');

export function boardGridFromFen(fen) {
  const empty = () => Array.from({ length: 8 }, EMPTY_RANK);
  if (typeof fen !== 'string') return empty();

  const placement = fen.trim().split(/\s+/)[0] || '';
  const rows = placement.split('/');
  if (rows.length !== 8) return empty();

  const grid = [];
  for (const row of rows) {
    const cells = [];
    for (const ch of row) {
      if (/^[1-8]$/.test(ch)) {
        for (let i = 0; i < Number(ch); i += 1) cells.push('');
      } else if (/^[prnbqkPRNBQK]$/.test(ch)) {
        cells.push(ch);
      } else {
        return empty();
      }
    }
    if (cells.length !== 8) return empty();
    grid.push(cells);
  }
  return grid;
}

export function legalTargetsByDestination(legalTargets = []) {
  const indexed = new Map();
  if (!Array.isArray(legalTargets)) return indexed;

  for (const move of legalTargets) {
    if (!move?.to || indexed.has(move.to)) continue;
    // Board historically used Array.find(), so duplicate destinations (most
    // notably promotion choices) must keep the first move rather than the last.
    indexed.set(move.to, move);
  }
  return indexed;
}
