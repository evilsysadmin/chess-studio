import { useCallback, useEffect, useRef, useState } from 'react';
import Board from './Board.jsx';
import Board3DFromFen from './Board3DFromFen.jsx';
import { loadBoardRenderer, saveBoardRenderer, subscribeBoardRenderer } from '../boardRendererPreference.js';

function needsDomBoard(props) {
  return Boolean(
    props.pieceDraggable
    || props.onSquareDrop
    || props.onSquareDragOver
    || props.onSquareDragLeave
    || props.onPieceDragStart
    || props.onPieceDragEnd,
  );
}

export default function PlayableBoard(props) {
  const [rendererMode, setRendererMode] = useState(() => loadBoardRenderer());
  const [threeUnavailable, setThreeUnavailable] = useState(false);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => subscribeBoardRenderer((mode) => {
    setRendererMode(mode);
    if (mode === '3d') setThreeUnavailable(false);
  }), []);

  const onSquareClick = useCallback((square) => propsRef.current.onSquareClick?.(square), []);
  const onSquareDoubleClick = useCallback((square) => propsRef.current.onSquareDoubleClick?.(square), []);
  const onPieceClick = useCallback((square, event) => propsRef.current.onPieceClick?.(square, event), []);
  const onPieceDoubleClick = useCallback((square, event) => propsRef.current.onPieceDoubleClick?.(square, event), []);
  const use2D = useCallback(() => {
    setThreeUnavailable(false);
    setRendererMode(saveBoardRenderer('2d'));
  }, []);
  const use3D = useCallback(() => {
    setThreeUnavailable(false);
    setRendererMode(saveBoardRenderer('3d'));
  }, []);
  const markThreeUnavailable = useCallback(() => setThreeUnavailable(true), []);

  const forceDomBoard = needsDomBoard(props);
  const show3D = rendererMode === '3d' && !threeUnavailable && !forceDomBoard;

  if (show3D) {
    return (
      <Board3DFromFen
        {...props}
        onSquareClick={onSquareClick}
        onSquareDoubleClick={props.onSquareDoubleClick ? onSquareDoubleClick : undefined}
        onPieceClick={props.onPieceClick ? onPieceClick : undefined}
        onPieceDoubleClick={props.onPieceDoubleClick ? onPieceDoubleClick : undefined}
        onUse2D={use2D}
        onUnavailable={markThreeUnavailable}
      />
    );
  }

  return (
    <div className="playable-board-2d" style={{ position: 'relative' }} data-board-renderer="2d">
      <Board {...props} />
      {!forceDomBoard && (
        <div className="board-renderer-toggle-2d" aria-label="Vista del tablero">
          <button type="button" className="is-active" aria-pressed="true">2D</button>
          <button type="button" onClick={use3D} title={threeUnavailable ? 'Reintentar tablero 3D' : 'Usar tablero 3D'}>3D</button>
        </div>
      )}
    </div>
  );
}
