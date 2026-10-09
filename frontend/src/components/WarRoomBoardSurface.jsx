import { lazy, memo, Suspense, useLayoutEffect, useRef, useState } from 'react';
import { warRoomFirstFrameReady } from './WarRoomSceneReadiness.js';
import Board from './Board.jsx';
import WarRoomBoardZoom from './WarRoomBoardZoom.jsx';

const Board3D = lazy(() => import('./Board3D.jsx'));

function sameLegalTargets(a = [], b = []) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((target, index) => target?.to === b[index]?.to && target?.san === b[index]?.san);
}

export function sameBoardSurfaceProps(previous, next) {
  if (previous.isThreeD !== next.isThreeD) return false;
  if (previous.loadingLabel !== next.loadingLabel) return false;
  if (previous.loadingClassName !== next.loadingClassName) return false;
  const a = previous.boardProps;
  const b = next.boardProps;
  if (a === b) return true;
  if (!a || !b) return false;
  return a.gameId === b.gameId
    && a.fen === b.fen
    && a.onSquareClick === b.onSquareClick
    && a.selectedSquare === b.selectedSquare
    && sameLegalTargets(a.legalTargets, b.legalTargets)
    && a.lastMove === b.lastMove
    && a.animate === b.animate
    && a.hintMove === b.hintMove
    && a.checkSquare === b.checkSquare
    && a.gameOver === b.gameOver
    && a.turnState === b.turnState
    && a.orientation === b.orientation
    && a.showCoordinates === b.showCoordinates
    && a.matthiasKingColor === b.matthiasKingColor
    && a.onCustomize === b.onCustomize
    && a.cameraProfile === b.cameraProfile
    && a.immersive === b.immersive
    && a.warRoomVariantOverride === b.warRoomVariantOverride
    && a.warRoomMobilePerformance === b.warRoomMobilePerformance
    && a.themeOverride === b.themeOverride
    && a.hansFireplaceIteration === b.hansFireplaceIteration
    && a.hansFireCallEnabled === b.hansFireCallEnabled;
}

const WarRoomBoardSurface = memo(function WarRoomBoardSurface({
  isThreeD,
  boardProps,
  loadingLabel = 'Preparando sala 3D…',
  loadingClassName = 'hint-text',
}) {
  const gateRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [retry, setRetry] = useState(0);

  useLayoutEffect(() => {
    if (!isThreeD) return undefined;
    // Run before paint: a new game must never inherit the previous room's
    // ready state, even for one frame.
    setReady(false);
    setStalled(false);
    let cancelled = false;
    let pendingReveal = false;
    let firstFrame = 0;
    let secondFrame = 0;
    const cancelReveal = () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      firstFrame = 0;
      secondFrame = 0;
    };
    const inspect = () => {
      const complete = warRoomFirstFrameReady(gateRef.current);
      if (!complete) {
        cancelReveal();
        if (pendingReveal) {
          pendingReveal = false;
          setReady(false);
        }
        return;
      }
      if (pendingReveal) return;
      pendingReveal = true;
      // The renderer has painted synchronously, but let the browser composite
      // the complete frame before uncovering it. No arbitrary minimum delay.
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          if (cancelled) return;
          setReady(true);
          setStalled(false);
        });
      });
    };
    const observer = new MutationObserver(inspect);
    observer.observe(gateRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-war-room-variant-status', 'data-war-room-variant', 'data-board3d-piece-built'],
    });
    const stalledTimer = window.setTimeout(() => {
      if (!warRoomFirstFrameReady(gateRef.current)) setStalled(true);
    }, 30000);
    inspect();
    return () => {
      cancelled = true;
      observer.disconnect();
      cancelReveal();
      window.clearTimeout(stalledTimer);
    };
  }, [isThreeD, boardProps?.gameId, retry]);

  if (!isThreeD) return <Board {...boardProps} />;
  return (
    <div ref={gateRef} style={{ display: 'contents' }} data-war-room-scene-gate={ready ? 'ready' : 'loading'}>
      <WarRoomBoardZoom>
        <Suspense fallback={null}>
          <Board3D key={`${boardProps?.gameId || 'war-room'}-${retry}`} {...boardProps} />
        </Suspense>
      </WarRoomBoardZoom>
      {!ready && (
        <div className="route-loading scene-transition-cover" role="status" aria-live="polite">
          <strong className="scene-transition-title">LOADING</strong>
          <span className={loadingClassName}>{loadingLabel}</span>
          {stalled && (
            <div className="scene-transition-recovery">
              <span>La sala está tardando demasiado en prepararse.</span>
              <button type="button" className="secondary-btn" onClick={() => {
                setReady(false);
                setStalled(false);
                setRetry((value) => value + 1);
              }}>Reintentar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}, sameBoardSurfaceProps);

export default WarRoomBoardSurface;
