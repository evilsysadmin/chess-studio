function samePiece(a, b) {
  return Boolean(a && b && a.type === b.type && a.color === b.color);
}

function indexBySquare(pieces) {
  return new Map((pieces || []).filter((piece) => piece?.square).map((piece) => [piece.square, piece]));
}

function castlingRookMove(previousBySquare, nextBySquare, animate) {
  if (!animate?.from || !animate?.to) return null;
  const king = previousBySquare.get(animate.from);
  if (king?.type !== 'k') return null;
  const fromFile = animate.from.charCodeAt(0) - 97;
  const toFile = animate.to.charCodeAt(0) - 97;
  if (Math.abs(toFile - fromFile) !== 2) return null;

  const rank = animate.to[1];
  const kingSide = toFile > fromFile;
  const from = `${kingSide ? 'h' : 'a'}${rank}`;
  const to = `${kingSide ? 'f' : 'd'}${rank}`;
  return samePiece(previousBySquare.get(from), nextBySquare.get(to)) ? { from, to } : null;
}

/**
 * Plans a conservative reconciliation of the physical 3D piece rigs.
 *
 * Same-square pieces are always the safest reuse. The explicit animated move
 * lets us also carry the actual moving rig to its destination, plus the rook
 * during castling. Everything else is rebuilt rather than guessed: arbitrary
 * FEN jumps therefore remain correct while ordinary chess moves avoid replacing
 * the whole army.
 */
export function planBoard3DPieceReconciliation({
  previousPieces = [],
  nextPieces = [],
  animate = null,
  allowReuse = true,
} = {}) {
  const previousBySquare = indexBySquare(previousPieces);
  const nextBySquare = indexBySquare(nextPieces);
  const claimedPrevious = new Set();
  const claimedNext = new Set();
  const reuse = [];

  const claim = (from, to) => {
    if (!from || !to || claimedPrevious.has(from) || claimedNext.has(to)) return false;
    if (!samePiece(previousBySquare.get(from), nextBySquare.get(to))) return false;
    claimedPrevious.add(from);
    claimedNext.add(to);
    reuse.push({ from, to });
    return true;
  };

  if (allowReuse) {
    for (const [square, nextPiece] of nextBySquare.entries()) {
      if (samePiece(previousBySquare.get(square), nextPiece)) claim(square, square);
    }

    claim(animate?.from, animate?.to);
    const rookMove = castlingRookMove(previousBySquare, nextBySquare, animate);
    if (rookMove) claim(rookMove.from, rookMove.to);
  }

  const remove = [...previousBySquare.keys()].filter((square) => !claimedPrevious.has(square));
  const build = [...nextBySquare.keys()].filter((square) => !claimedNext.has(square));

  return {
    reuse,
    remove,
    build,
    reusedCount: reuse.length,
    removedCount: remove.length,
    builtCount: build.length,
  };
}
