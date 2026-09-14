import { useLayoutEffect, useRef } from 'react';
import { BoardRendererContext } from './Board.jsx';
import Board3DCore from './Board3DCore.jsx';
import { serializeBoard3DRankLevels } from './Board3DRankInsignia.js';
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
import { warRoomHansDiagnosticsRequested } from './WarRoomHansDiagnosticsPolicy.js';

// Safe public entrypoint. GameBoardView also imports Board3D directly, so the
// provider must live here rather than only in the preferred Board wrapper.
// If WebGL dies, Board3DCore falls back through Board; the context tells that
// nested Board to render the concrete 2D implementation instead of recursing.
export default function Board3D(props) {
  const requestsHansQuickIteration = props.hansFireplaceIteration === true;
  const requestsHansDiagnostics = warRoomHansDiagnosticsRequested({
    quickIteration: requestsHansQuickIteration,
    webdriver: typeof navigator !== 'undefined' && navigator.webdriver === true,
    ambientAudit: typeof globalThis !== 'undefined'
      && globalThis.__CHESS_STUDIO_HANS_AMBIENT_AUDIT__ === true,
  });
  const hansGameId = props.gameId;
  const rankLevelsPayload = serializeBoard3DRankLevels(props.pieceRankLevels);
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

  // The scene lease is the one shared infrastructure switch that guarantees
  // Hans exists even in the lite War Room. Real fireplace iteration owns it in
  // production; the guarded WebDriver audit may borrow it only to render the
  // ambient routines under SwiftShader. The audit does not arm the fire call.
  useLayoutEffect(() => {
    if (!requestsHansDiagnostics) return undefined;
    if (requestsHansQuickIteration && hasWarRoomHansCompletedForGame(hansGameId)) return undefined;

    acquireWarRoomHansQuickIteration();
    return () => releaseWarRoomHansQuickIteration();
  }, [requestsHansDiagnostics, requestsHansQuickIteration, hansGameId]);

  return (
    <BoardRendererContext.Provider value="3d">
      <div style={{ display: 'contents' }} data-board3d-rank-levels={rankLevelsPayload}>
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
          hansDiagnosticsRequested={requestsHansDiagnostics}
        />
      </div>
    </BoardRendererContext.Provider>
  );
}
