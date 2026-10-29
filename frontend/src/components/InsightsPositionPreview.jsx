// Read-only FEN teaser. All legal moves still belong to PuzzleScreen / War Room.
const PIECES = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟', K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };

export function positionPreviewSquares(fen, fixedOrientation = null) {
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
  return (fixedOrientation === 'w' || fixedOrientation === 'b' ? fixedOrientation : side) === 'b' ? squares.reverse() : squares;
}

export function autopsyArrowCoordinates(square, orientation = 'w') {
  if (!/^[a-h][1-8]$/.test(square || '')) return null;
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  return orientation === 'b'
    ? { x: (7.5 - file) * 100, y: (rank - .5) * 100 }
    : { x: (file + .5) * 100, y: (8.5 - rank) * 100 };
}

export default function InsightsPositionPreview({ fen, orientation = null, move = null }) {
  const squares = positionPreviewSquares(fen, orientation);
  if (!squares) return null;
  const viewpoint = orientation || fen.trim().split(/\s+/)[1];
  const from = autopsyArrowCoordinates(move?.from, viewpoint);
  const to = autopsyArrowCoordinates(move?.to, viewpoint);
  return (
    <div className="insights-position-preview" role="img" aria-label={from && to ? 'Tablero tras ' + move.san + ': flecha de ' + move.from + ' a ' + move.to : 'Vista previa de una posición real de ajedrez, sin revelar su solución'}>
      {squares.map(({ piece, white, dark }, index) => (
        <span key={index} className={`insights-position-square ${dark ? 'dark' : 'light'}`} aria-hidden="true">
          {piece ? <span className={white ? 'is-white' : 'is-black'}>{piece}</span> : null}
        </span>
      ))}
      {from && to ? (
        <svg className="insights-position-arrow" viewBox="0 0 800 800" aria-hidden="true" preserveAspectRatio="none">
          <defs>
            <marker id="insights-autopsy-arrow-tip" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0 0 L6 3 L0 6 Z" fill="#e5b04d" />
            </marker>
          </defs>
          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#523510" strokeWidth="16" strokeLinecap="round" opacity=".62" />
          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#e5b04d" strokeWidth="10" strokeLinecap="round" markerEnd="url(#insights-autopsy-arrow-tip)" />
        </svg>
      ) : null}
    </div>
  );
}
