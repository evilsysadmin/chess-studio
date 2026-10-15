// Read-only FEN teaser. All legal moves still belong to PuzzleScreen / War Room.
const PIECES = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟', K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };

export function positionPreviewSquares(fen) {
  if (typeof fen !== 'string') return null;
  const [placement, side] = fen.trim().split(/\s+/);
  if (!placement || !['w', 'b'].includes(side)) return null;
  const ranks = placement.split('/');
  if (ranks.length !== 8) return null;
  const squares = [];
  for (const [rankIndex, rank] of ranks.entries()) {
    let file = 0;
    for (const char of rank) {
      if (/^[1-8]$/.test(char)) {
        for (let i = 0; i < Number(char); i += 1) {
          squares.push({ piece: null, white: false, dark: (file + rankIndex) % 2 === 1 });
          file += 1;
        }
      } else if (Object.hasOwn(PIECES, char)) {
        squares.push({ piece: PIECES[char], white: char === char.toUpperCase(), dark: (file + rankIndex) % 2 === 1 });
        file += 1;
      } else {
        return null;
      }
    }
    if (file !== 8) return null;
  }
  return side === 'b' ? squares.reverse() : squares;
}

export default function InsightsPositionPreview({ fen }) {
  const squares = positionPreviewSquares(fen);
  if (!squares) return null;
  return (
    <div className="insights-position-preview" role="img" aria-label="Vista previa de una posición real de ajedrez, sin revelar su solución">
      {squares.map(({ piece, white, dark }, index) => (
        <span key={index} className={`insights-position-square ${dark ? 'dark' : 'light'}`} aria-hidden="true">
          {piece ? <span className={white ? 'is-white' : 'is-black'}>{piece}</span> : null}
        </span>
      ))}
    </div>
  );
}
