import { createContext, Suspense, useContext, useMemo, useRef } from 'react';
import Board2D from './Board2D.jsx';
import useGameBoardRenderer from './useGameBoardRenderer.js';
import { parseFen } from './Board3DBoardMath.js';
import { buildBoard3DParityHintMove, buildBoard3DParityRows } from './Board3DParity.js';
import { getRegisteredBoard3D } from './boardRendererRegistry.js';
import './PreferredBoard.css';

// Board3DCore still imports Board for its WebGL fallback. The safe Board3D
// entrypoint wraps the core with this context, so that nested fallback renders
// the concrete 2D implementation instead of trying the registered 3D renderer.
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

function board3DCanvas(root) {
  return root?.querySelector?.('.board3d-main-canvas') || root;
}

export default function Board(props) {
  const inheritedRenderer = useContext(BoardRendererContext);
  const { isThreeD } = useGameBoardRenderer();
  const rootRef = useRef(null);
  const pieces = useMemo(() => safePieces(props.fen), [props.fen]);
  const occupiedSquares = useMemo(() => new Set(pieces.map((piece) => piece.square)), [pieces]);
  const threeDHintMove = useMemo(() => buildBoard3DParityHintMove({
    hintMove: props.hintMove,
    mistakeMove: props.mistakeMove,
    squareClassName: props.squareClassName,
    pieceLevels: props.pieceLevels,
    pieceRankLevels: props.pieceRankLevels,
    pieceXp: props.pieceXp,
    pieceVeteranMarks: props.pieceVeteranMarks,
  }), [
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

  const RegisteredBoard3D = getRegisteredBoard3D();
  if (inheritedRenderer === '3d' || !isThreeD || !RegisteredBoard3D) return <Board2D {...props} />;

  function handleThreeDSquareClick(square) {
    const canvas = board3DCanvas(rootRef.current);
    if (occupiedSquares.has(square) && typeof props.onPieceClick === 'function') {
      props.onPieceClick(square, eventFacade(canvas));
      return;
    }
    props.onSquareClick?.(square);
  }

  function handleThreeDPieceMouseEnter(square) {
    if (!occupiedSquares.has(square)) return;
    props.onPieceMouseEnter?.(square, eventFacade(board3DCanvas(rootRef.current)));
  }

  function handleThreeDPieceMouseLeave(square) {
    props.onPieceMouseLeave?.(square, eventFacade(board3DCanvas(rootRef.current)));
  }

  function dispatchThreeDDoubleClick(event, preferFocused = false) {
    if (event?.target?.closest?.('button, summary, a, input, select, textarea')) return;
    const shell = rootRef.current?.querySelector?.('.board3d-main-shell');
    if (!shell || (event?.target && !shell.contains(event.target))) return;
    const square = board3DSquare(rootRef.current, preferFocused);
    if (!square) return;
    const canvas = board3DCanvas(rootRef.current);
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
    <div
      ref={rootRef}
      className="preferred-board-3d"
      data-board3d-theme-override={props.themeOverride || ''}
      onDoubleClickCapture={(event) => dispatchThreeDDoubleClick(event, false)}
      onKeyDownCapture={handleThreeDKeyDown}
    >
      <Suspense fallback={<Board2D {...props} />}>
        <RegisteredBoard3D
          {...props}
          hintMove={threeDHintMove}
          onSquareClick={handleThreeDSquareClick}
          onPieceMouseEnter={handleThreeDPieceMouseEnter}
          onPieceMouseLeave={handleThreeDPieceMouseLeave}
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
  );
}
