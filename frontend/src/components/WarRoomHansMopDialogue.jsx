import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HANS_MOP_REPLY_LINE,
  MATTHIAS_MOP_LINE,
  MATTHIAS_MOP_SIGH_LINE,
} from './WarRoomHansMopContract.js';
import { projectHansFireReplyAnchor } from './WarRoomHansFireCallContract.js';
import './WarRoomHansFireCall.css';

function sameAnchor(current, next) {
  if (current === next) return true;
  if (!current || !next) return false;
  return Math.abs(current.left - next.left) < 0.025
    && Math.abs(current.top - next.top) < 0.025
    && current.bubbleShiftPercent === next.bubbleShiftPercent
    && current.tailPercent === next.tailPercent;
}

export default function WarRoomHansMopDialogue({
  gameId = '',
  isThreeD = false,
  enabled = false,
  matthiasAnchorStyle = null,
  matthiasTrackedSquare = null,
}) {
  const [portalHost, setPortalHost] = useState(null);
  const [phase, setPhase] = useState('');
  const [hansAnchor, setHansAnchor] = useState(null);

  useEffect(() => {
    setPortalHost(null);
    setPhase('');
    setHansAnchor(null);
    if (!isThreeD || !enabled || !gameId) return undefined;

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
  }, [enabled, gameId, isThreeD]);

  useEffect(() => {
    if (!portalHost || !enabled || !gameId || !isThreeD) return undefined;
    let frameId = 0;
    let live = true;
    const tick = () => {
      if (!live) return;
      const canvas = portalHost.querySelector('.board3d-main-canvas');
      const nextPhase = canvas?.dataset?.warRoomHansMopDialogue || '';
      setPhase((current) => current === nextPhase ? current : nextPhase);
      if (nextPhase === 'hans' && canvas?.dataset?.warRoomHansScreen === 'onscreen') {
        const anchor = projectHansFireReplyAnchor({
          ndcX: canvas.dataset.warRoomHansNdcX,
          ndcY: canvas.dataset.warRoomHansNdcY,
          coarsePointer: Boolean(window.matchMedia?.('(pointer: coarse)')?.matches),
        });
        if (anchor) setHansAnchor((current) => sameAnchor(current, anchor) ? current : anchor);
      }
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => {
      live = false;
      window.cancelAnimationFrame(frameId);
    };
  }, [enabled, gameId, isThreeD, portalHost]);

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

  if (!isThreeD || !enabled || !gameId || !portalHost || !phase) return null;

  return createPortal(
    <div className="warroom-hans-fire-call-overlay" data-testid="warroom-hans-mop-dialogue" data-mop-dialogue-phase={phase}>
      {phase === 'matthias' && matthiasStyle && (
        <aside className="warroom-fire-call-bubble warroom-fire-call-bubble-matthias" style={matthiasStyle} data-matthias-square={matthiasTrackedSquare || ''} role="status" aria-live="polite" aria-label="Matthias protesta porque Hans está fregando">
          <span>MATTHIAS</span><p>{MATTHIAS_MOP_LINE}</p>
        </aside>
      )}
      {phase === 'hans' && hansStyle && (
        <aside className="warroom-fire-call-bubble warroom-fire-call-bubble-hans" style={hansStyle} role="status" aria-live="polite" aria-label="Hans explica por qué está fregando">
          <span>HANS</span><p>{HANS_MOP_REPLY_LINE}</p>
        </aside>
      )}
      {phase === 'sigh' && matthiasStyle && (
        <aside className="warroom-fire-call-bubble warroom-fire-call-bubble-matthias" style={matthiasStyle} data-matthias-square={matthiasTrackedSquare || ''} role="status" aria-live="polite" aria-label="Matthias suspira">
          <span>MATTHIAS</span><p><em>{MATTHIAS_MOP_SIGH_LINE}</em></p>
        </aside>
      )}
    </div>,
    portalHost,
  );
}
