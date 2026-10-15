import { Chess } from 'chess.js';

// The input tree comes solely from buildOpeningTree(history). Fail closed if
// it contains an incomplete, invalid or non-standard move; never infer a move.
export function atlasPosition(tree, trail = []) {
  if (!tree || !Array.isArray(trail) || trail.length > 3) return null;
  const board = new Chess();
  let node = tree;
  for (const san of trail) {
    if (typeof san !== 'string' || !Object.hasOwn(node.children || {}, san)) return null;
    try {
      if (!board.move(san)) return null;
    } catch {
      return null;
    }
    node = node.children[san];
  }
  const choices = [];
  for (const next of Object.values(node.children || {})) {
    if (!next?.move || typeof next.move !== 'string') continue;
    try {
      const candidate = new Chess(board.fen());
      if (candidate.move(next.move)) choices.push(next);
    } catch { /* Discard malformed historic move. */ }
  }
  choices.sort((a, b) => b.count - a.count || a.move.localeCompare(b.move));
  return {
    fen: board.fen(),
    trail: [...trail],
    count: Number(node.count) || 0,
    wins: Number(node.wins) || 0,
    choices: choices.slice(0, 5).map(item => ({
      san: item.move,
      count: Number(item.count) || 0,
      wins: Number(item.wins) || 0,
    })),
  };
}

export function atlasInitialTrail(tree) {
  return atlasPosition(tree, [])?.choices[0]?.san
    ? [atlasPosition(tree, []).choices[0].san]
    : [];
}

export function atlasExample(history, trail = []) {
  if (!Array.isArray(history) || !Array.isArray(trail) || trail.length === 0) return null;
  const candidate = history
    .filter(record => {
      if (!record || !(record.id || record.sourceGameId) || !Array.isArray(record.moves) || record.moves.length < trail.length) return false;
      return trail.every((san, index) => {
        const move = record.moves[index];
        return (typeof move === 'string' ? move : move?.san) === san;
      });
    })
    .sort((a, b) => (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0)
      || String(a.id || '').localeCompare(String(b.id || '')));
  return candidate[0] || null;
}
