import { useMemo, useRef } from 'react';
import Board3D from './Board3D.jsx';
import { parseFen } from './Board3DBoardMath.js';
import { buildBoard3DParityHintMove } from './Board3DParity.js';

function safePieces(fen) {
  try {
    return parseFen(fen);
  } catch {
    return [];
  }
}

function activeSquare(root, preferFocused = false) {
  const shell = root?.querySelector?.('.board3d-main-shell');
  const canvas = root?.querySelector?.('.board3d-main-canvas');
  const focused = shell?.dataset?.board3dFocused || '';
  const pointed = canvas?.dataset?.warRoomLastSquare || '';
  return preferFocused ? (focused || pointed) : (pointed || focused);
}

export default function CombatWarRoomBoard(props) {
  const rootRef = useRef(null);
  const pieces = useMemo(() => safePieces(props.fen), [props.fen]);
  const occupiedSquares = useMemo(() => new Set(pieces.map((piece) => piece.square)), [pieces]);
  const hintMove = useMemo(() => buildBoard3DParityHintMove({
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

  function openPieceInfo(event, preferFocused = false) {
    if (event?.target?.closest?.('button, summary, a, input, select, textarea')) return;
    const shell = rootRef.current?.querySelector?.('.board3d-main-shell');
    if (!shell || (event?.target && !shell.contains(event.target))) return;
    const square = activeSquare(rootRef.current, preferFocused);
    if (!square || !occupiedSquares.has(square)) return;
    props.onSquareDoubleClick?.(square);
  }

  return (
    <div
      ref={rootRef}
      className="preferred-board-3d combat-warroom-board"
      data-board3d-theme-override={props.themeOverride || ''}
      onDoubleClickCapture={(event) => openPieceInfo(event, false)}
      onKeyDownCapture={(event) => {
        if (event.key !== 'i' && event.key !== 'I') return;
        event.preventDefault();
        openPieceInfo(event, true);
      }}
    >
      <Board3D
        {...props}
        hintMove={hintMove}
      />
    </div>
  );
}
