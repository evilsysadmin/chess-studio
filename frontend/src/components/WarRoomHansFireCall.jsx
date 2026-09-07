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
    if (!portalHost || !enabled || !isThreeD || !gameId || !anchorReady || typeof MutationObserver === 'undefined') {
      return undefined;
    }

    let live = true;
    let currentPhase = 'matthias';
    let replyTimer = 0;
    let clearTimer = 0;
    setPhase('matthias');

    const readHansProbe = () => {
      if (!live || currentPhase === '') return;
      const canvas = portalHost.querySelector('.board3d-main-canvas');
      if (!canvas || canvas.dataset.warRoomHansScreen !== 'onscreen') return;

      const anchor = projectHansFireReplyAnchor({
        ndcX: canvas.dataset.warRoomHansNdcX,
        ndcY: canvas.dataset.warRoomHansNdcY,
        coarsePointer: Boolean(window.matchMedia?.('(pointer: coarse)')?.matches),
      });
      if (!anchor) return;
      setHansAnchor((current) => sameAnchor(current, anchor) ? current : anchor);

      if (currentPhase !== 'await-hans') return;
      currentPhase = 'hans';
      setPhase('hans');
      clearTimer = window.setTimeout(() => {
        if (!live) return;
        currentPhase = '';
        setPhase('');
      }, HANS_FIRE_REPLY_MS);
    };

    const observer = new MutationObserver(readHansProbe);
    observer.observe(portalHost, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'data-war-room-hans-screen',
        'data-war-room-hans-ndc-x',
        'data-war-room-hans-ndc-y',
      ],
    });
    readHansProbe();

    replyTimer = window.setTimeout(() => {
      if (!live) return;
      currentPhase = 'await-hans';
      setPhase('await-hans');
      readHansProbe();
    }, MATTHIAS_FIRE_CALL_MS);

    return () => {
      live = false;
      observer.disconnect();
      if (replyTimer) window.clearTimeout(replyTimer);
      if (clearTimer) window.clearTimeout(clearTimer);
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
