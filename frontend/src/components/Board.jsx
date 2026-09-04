import { createContext, lazy, Suspense, useContext, useMemo, useRef } from 'react';
import Board2D from './Board2D.jsx';
import useGameBoardRenderer from './useGameBoardRenderer.js';
import { parseFen } from './Board3DBoardMath.js';
import { buildBoard3DParityHintMove, buildBoard3DParityRows } from './Board3DParity.js';
import './PreferredBoard.css';

const Board3D = lazy(() => import('./Board3D.jsx'));

// Board3DCore still imports Board for its WebGL fallback. The provider lets
// that nested Board know it is already inside the 3D path, so it renders the
// real 2D implementation instead of recursively trying WebGL again.
export const BoardRendererContext = createContext(null);

function eventFacade(currentTarget) {
  return {
    detail: 1,
    currentTarget,
    target: currentTarget,
    preventDefault() {},
    stopPropagation() {},
  };
}

function safePieces(fen) {
  try {
    return parseFen(fen);
  } catch {
    return [];
  }
}

function board3DSquare(root, preferFocused = false) {
  const shell = root?.querySelector?.('.board3d-main-shell');
  const canvas = root?.querySelector?.('.board3d-main-canvas');
  const focused = shell?.dataset?.board3dFocused || '';
  const pointed = canvas?.dataset?.warRoomLastSquare || '';
  return preferFocused ? (focused || pointed) : (pointed || focused);
}

export default function Board(props) {
  const inheritedRenderer = useContext(BoardRendererContext);
  const { isThreeD } = useGameBoardRenderer();
  const rootRef = useRef(null);
  const pieces = useMemo(() => safePieces(props.fen), [props.fen]);
  const occupiedSquares = useMemo(() => new Set(pieces.map((piece) => piece.square)), [pieces]);
  const threeDHintMove = useMemo(() => buildBoard3DParityHintMove(props), [
    props.hintMove,
    props.mistakeMove,
    props.squareClassName,
    props.pieceLevels,
    props.pieceRankLevels,
    props.pieceXp,
    props.pieceVeteranMarks,
  ]);
  const parityRows = useMemo(() => buildBoard3DParityRows({
    pieces,
    pieceLevels: props.pieceLevels,
    pieceRankLevels: props.pieceRankLevels,
    pieceXp: props.pieceXp,
    pieceVeteranMarks: props.pieceVeteranMarks,
    pieceLabels: props.pieceLabels,
  }), [pieces, props.pieceLevels, props.pieceRankLevels, props.pieceXp, props.pieceVeteranMarks, props.pieceLabels]);

  if (inheritedRenderer === '3d' || !isThreeD) return <Board2D {...props} />;

  function handleThreeDSquareClick(square) {
    const canvas = rootRef.current?.querySelector?.('.board3d-main-canvas') || rootRef.current;
    if (occupiedSquares.has(square) && typeof props.onPieceClick === 'function') {
      props.onPieceClick(square, eventFacade(canvas));
      return;
    }
    props.onSquareClick?.(square);
  }

  function dispatchThreeDDoubleClick(event, preferFocused = false) {
    if (event?.target?.closest?.('button, summary, a, input, select, textarea')) return;
    const shell = rootRef.current?.querySelector?.('.board3d-main-shell');
    if (!shell || (event?.target && !shell.contains(event.target))) return;
    const square = board3DSquare(rootRef.current, preferFocused);
    if (!square) return;
    const canvas = rootRef.current?.querySelector?.('.board3d-main-canvas') || rootRef.current;
    if (occupiedSquares.has(square) && typeof props.onPieceDoubleClick === 'function') {
      props.onPieceDoubleClick(square, eventFacade(canvas));
      return;
    }
    props.onSquareDoubleClick?.(square);
  }

  function handleThreeDKeyDown(event) {
    if (event.key !== 'i' && event.key !== 'I') return;
    event.preventDefault();
    dispatchThreeDDoubleClick(event, true);
  }

  return (
    <BoardRendererContext.Provider value="3d">
      <div
        ref={rootRef}
        className="preferred-board-3d"
        data-board3d-theme-override={props.themeOverride || ''}
        onDoubleClickCapture={(event) => dispatchThreeDDoubleClick(event, false)}
        onKeyDownCapture={handleThreeDKeyDown}
      >
        <Suspense fallback={<Board2D {...props} />}>
          <Board3D
            {...props}
            hintMove={threeDHintMove}
            onSquareClick={handleThreeDSquareClick}
          />
        </Suspense>

        {props.pieceDraggable && (
          <div className="board3d-parity-note" role="note">
            3D · despliegue por clic: selecciona unidad y después el slot. El arrastre sigue disponible al elegir 2D.
          </div>
        )}

        {parityRows.length > 0 && (
          <details className="board3d-parity-details">
            <summary>Marcas tácticas de unidades · {parityRows.length}</summary>
            <div className="board3d-parity-grid">
              {parityRows.map((row) => <span key={row.square}><b>{row.square}</b> · {row.text}</span>)}
            </div>
          </details>
        )}
      </div>
    </BoardRendererContext.Provider>
  );
}
