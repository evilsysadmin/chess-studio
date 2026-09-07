import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HANS_FIRE_REPLY_LINE,
  HANS_FIRE_REPLY_MS,
  MATTHIAS_FIRE_CALL_LINE,
  MATTHIAS_FIRE_CALL_MS,
  projectHansFireReplyAnchor,
} from './WarRoomHansFireCallContract.js';
import './WarRoomHansFireCall.css';

function sameAnchor(current, next) {
  if (current === next) return true;
  if (!current || !next) return false;
  return Math.abs(current.left - next.left) < 0.025
    && Math.abs(current.top - next.top) < 0.025
    && current.bubbleShiftPercent === next.bubbleShiftPercent
    && current.tailPercent === next.tailPercent;
}

export default function WarRoomHansFireCall({
  gameId,
  isThreeD = false,
  enabled = false,
  matthiasAnchorStyle = null,
  matthiasTrackedSquare = null,
}) {
  const [portalHost, setPortalHost] = useState(null);
  const [phase, setPhase] = useState('');
  const [hansAnchor, setHansAnchor] = useState(null);
  const anchorReady = Boolean(matthiasAnchorStyle && matthiasTrackedSquare);

  useEffect(() => {
    setPhase('');
    setHansAnchor(null);
  }, [gameId]);

  useEffect(() => {
    setPortalHost(null);
    if (!isThreeD) return undefined;

    const findHost = () => document.querySelector('.game-board-stack-3d .board3d-main-shell');
    const existing = findHost();
    if (existing) {
      setPortalHost(existing);
      return undefined;
    }

    if (typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(() => {
      const host = findHost();
      if (!host) return;
      setPortalHost(host);
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [gameId, isThreeD]);

  useEffect(() => {
    setPhase('');
    setHansAnchor(null);
    if (!portalHost || !enabled || !isThreeD || !gameId || !anchorReady) {
      return undefined;
    }

    const existingCanvas = portalHost.querySelector('.board3d-main-canvas');
    if (existingCanvas?.dataset.warRoomHansCallReleased === 'true') return undefined;

    let live = true;
    let currentPhase = 'loading';
    let frameId = 0;
    let previousTime = null;
    let elapsed = 0;
    let readyPaints = 0;

    const tick = (now) => {
      if (!live) return;
      const delta = previousTime == null ? 0 : Math.min(100, Math.max(0, now - previousTime));
      previousTime = now;
      const canvas = portalHost.querySelector('.board3d-main-canvas');
      const visible = document.visibilityState !== 'hidden' && portalHost.getBoundingClientRect().width > 0;
      if (visible && canvas?.dataset.warRoomHansSceneReady === 'true') {
        if (currentPhase === 'loading') {
          // Allow the completed WebGL frame to be painted before the call.
          readyPaints += 1;
          if (readyPaints >= 2) {
            currentPhase = 'matthias';
            setPhase('matthias');
            elapsed = 0;
          }
        } else if (currentPhase === 'matthias') {
          elapsed += delta;
          if (elapsed >= MATTHIAS_FIRE_CALL_MS) {
            canvas.dataset.warRoomHansCallReleased = 'true';
            currentPhase = 'await-hans';
            setPhase('await-hans');
          }
        } else if (currentPhase === 'hans') {
          elapsed += delta;
          if (elapsed >= HANS_FIRE_REPLY_MS) {
            currentPhase = '';
            setPhase('');
          }
        }
        if ((currentPhase === 'await-hans' || currentPhase === 'hans')
          && canvas.dataset.warRoomHansScreen === 'onscreen') {
          const anchor = projectHansFireReplyAnchor({
            ndcX: canvas.dataset.warRoomHansNdcX,
            ndcY: canvas.dataset.warRoomHansNdcY,
            coarsePointer: Boolean(window.matchMedia?.('(pointer: coarse)')?.matches),
          });
          if (anchor) {
            setHansAnchor((current) => sameAnchor(current, anchor) ? current : anchor);
            if (currentPhase === 'await-hans') {
              currentPhase = 'hans';
              elapsed = 0;
              setPhase('hans');
            }
          }
        }
      }
      if (currentPhase !== '') frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => {
      live = false;
      window.cancelAnimationFrame(frameId);
    };
  }, [anchorReady, enabled, gameId, isThreeD, portalHost]);

  const hansStyle = useMemo(() => hansAnchor ? {
    left: `${hansAnchor.left.toFixed(3)}%`,
    top: `${hansAnchor.top.toFixed(3)}%`,
    right: 'auto',
    '--warroom-fire-call-translate-x': `${hansAnchor.bubbleShiftPercent}%`,
    '--warroom-fire-call-tail-x': `${hansAnchor.tailPercent}%`,
  } : null, [hansAnchor]);

  const matthiasStyle = useMemo(() => matthiasAnchorStyle ? {
    ...matthiasAnchorStyle,
    '--warroom-fire-call-translate-x': '-50%',
    '--warroom-fire-call-tail-x': '50%',
  } : null, [matthiasAnchorStyle]);

  if (!isThreeD || !portalHost || !enabled) return null;

  return createPortal(
    <div
      className="warroom-hans-fire-call-overlay"
      data-testid="warroom-hans-fire-call-overlay"
      data-fire-call-phase={phase || 'done'}
    >
      {phase === 'matthias' && matthiasStyle && (
        <aside
          className="warroom-fire-call-bubble warroom-fire-call-bubble-matthias"
          style={matthiasStyle}
          data-matthias-square={matthiasTrackedSquare || ''}
          role="status"
          aria-live="polite"
          aria-label="Matthias llama a Hans por el fuego"
        >
          <span>MATTHIAS</span>
          <p>{MATTHIAS_FIRE_CALL_LINE}</p>
        </aside>
      )}
      {phase === 'hans' && hansStyle && (
        <aside
          className="warroom-fire-call-bubble warroom-fire-call-bubble-hans"
          style={hansStyle}
          role="status"
          aria-live="polite"
          aria-label="Hans responde a Matthias"
        >
          <span>HANS</span>
          <p>{HANS_FIRE_REPLY_LINE}</p>
        </aside>
      )}
    </div>,
    portalHost,
  );
}
