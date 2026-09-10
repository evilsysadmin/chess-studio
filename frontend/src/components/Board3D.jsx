import { useLayoutEffect, useRef } from 'react';
import { BoardRendererContext } from './Board.jsx';
import Board3DCore from './Board3DCore.jsx';
import { chessFromFen } from '../chessRules.js';
import {
  armWarRoomMoveFinishEvent,
  clearWarRoomMoveFinishEvent,
  deriveWarRoomMoveFinishEvent,
} from './WarRoomMoveFinishEvent.js';
import {
  acquireWarRoomHansQuickIteration,
  releaseWarRoomHansQuickIteration,
} from './WarRoomHansIteration.js';
import { hasWarRoomHansCompletedForGame } from './WarRoomHansPerGame.js';

// Safe public entrypoint. GameBoardView also imports Board3D directly, so the
// provider must live here rather than only in the preferred Board wrapper.
// If WebGL dies, Board3DCore falls back through Board; the context tells that
// nested Board to render the concrete 2D implementation instead of recursing.
export default function Board3D(props) {
  const requestsHansQuickIteration = props.hansFireplaceIteration === true;
  const hansGameId = props.gameId;
  const hansMarkerRef = useRef(null);
  const previousFenRef = useRef(props.fen);
  const moveFinishEvent = deriveWarRoomMoveFinishEvent({
    previousFen: previousFenRef.current,
    fen: props.fen,
    gameOver: props.gameOver,
    checkSquare: props.checkSquare,
    animate: props.animate,
    chessFromFen,
  });

  useLayoutEffect(() => {
    clearWarRoomMoveFinishEvent();
    if (!moveFinishEvent) return undefined;
    armWarRoomMoveFinishEvent(moveFinishEvent);
    return () => clearWarRoomMoveFinishEvent(moveFinishEvent.seq);
  }, [
    moveFinishEvent?.seq,
    moveFinishEvent?.to,
    moveFinishEvent?.checkmate,
    moveFinishEvent?.castling?.side,
    moveFinishEvent?.promotion?.promotedType,
    moveFinishEvent?.promotion?.color,
  ]);

  // Keep the previous board only after this render has derived its event. That
  // makes promotion detection exact without threading another state object
  // through GameScreen/GameBoardView or teaching the renderer chess rules.
  useLayoutEffect(() => {
    previousFenRef.current = props.fen;
  }, [props.fen]);

  // Board3D owns only the Three.js quick-iteration lease. Persisting the cameo
  // here used to mark a game as completed as soon as Hans entered the viewport,
  // which could kill the React narrative after an F5/remount halfway through
  // the fireplace number. Completion is persisted by GameBoardView only after
  // WarRoomHansFireCall reaches its real terminal state.
  useLayoutEffect(() => {
    if (!requestsHansQuickIteration) return undefined;
    if (hasWarRoomHansCompletedForGame(hansGameId)) return undefined;

    acquireWarRoomHansQuickIteration();
    return () => releaseWarRoomHansQuickIteration();
  }, [requestsHansQuickIteration, hansGameId]);

  return (
    <BoardRendererContext.Provider value="3d">
      <span
        ref={hansMarkerRef}
        hidden
        aria-hidden="true"
        data-war-room-hans-quick-request={requestsHansQuickIteration ? 'true' : 'false'}
        data-war-room-hans-game-id={hansGameId || ''}
        data-war-room-hans-runtime={requestsHansQuickIteration ? 'pending' : 'idle'}
      />
      <Board3DCore
        key={hansGameId || 'war-room'}
        {...props}
        hansDiagnosticsMarkerRef={hansMarkerRef}
        hansDiagnosticsRequested={requestsHansQuickIteration}
      />
    </BoardRendererContext.Provider>
  );
}
