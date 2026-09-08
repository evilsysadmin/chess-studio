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
import {
  hasWarRoomHansAppearedForGame,
  markWarRoomHansAppearedForGame,
} from './WarRoomHansPerGame.js';

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

  // Eligibility and consumption are deliberately separate. A transient 3D
  // mount may arm Hans, but it must not burn the one-shot cameo until the real
  // scene proves that Hans was both rendered and inside the player's viewport.
  useLayoutEffect(() => {
    if (!requestsHansQuickIteration) return undefined;
    if (hasWarRoomHansAppearedForGame(hansGameId)) return undefined;

    acquireWarRoomHansQuickIteration();
    const marker = hansMarkerRef.current;
    let observer = null;

    const consumeWhenActuallySeen = () => {
      if (!marker) return false;
      const runtime = marker.getAttribute?.('data-war-room-hans-runtime');
      const screen = marker.getAttribute?.('data-war-room-hans-screen');
      if (runtime !== 'visible' || screen !== 'onscreen') return false;
      markWarRoomHansAppearedForGame(hansGameId);
      return true;
    };

    if (!consumeWhenActuallySeen() && marker && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => {
        if (!consumeWhenActuallySeen()) return;
        observer?.disconnect();
        observer = null;
      });
      observer.observe(marker, {
        attributes: true,
        attributeFilter: ['data-war-room-hans-runtime', 'data-war-room-hans-screen'],
      });
    }

    return () => {
      observer?.disconnect();
      releaseWarRoomHansQuickIteration();
    };
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
        {...props}
        hansDiagnosticsMarkerRef={hansMarkerRef}
        hansDiagnosticsRequested={requestsHansQuickIteration}
      />
    </BoardRendererContext.Provider>
  );
}
