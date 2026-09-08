import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { HANS_ESPRESSO_LINE, MATTHIAS_ESPRESSO_LINE } from './WarRoomHansServiceContract.js';
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

export default function WarRoomHansServiceDialogue({
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
    if (!isThreeD || !enabled) return undefined;
    const findHost = () => document.querySelector('.game-board-stack-3d .board3d-main-shell');
    const existing = findHost();
    if (existing) { setPortalHost(existing); return undefined; }
    if (typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(() => {
      const host = findHost();
      if (!host) return;
      setPortalHost(host);
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [enabled, isThreeD]);

  useEffect(() => {
    if (!portalHost || !enabled || !isThreeD) return undefined;
    let frameId = 0;
    let live = true;
    const tick = () => {
      if (!live) return;
      const canvas = portalHost.querySelector('.board3d-main-canvas');
      const nextPhase = canvas?.dataset?.warRoomHansServiceDialogue || '';
      setPhase((current) => current === nextPhase ? current : nextPhase);
      if (nextPhase === 'hans-espresso' && canvas?.dataset?.warRoomHansScreen === 'onscreen') {
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
  }, [enabled, isThreeD, portalHost]);

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

  if (!isThreeD || !enabled || !portalHost || !phase) return null;

  return createPortal(
    <div className="warroom-hans-fire-call-overlay" data-testid="warroom-hans-service-dialogue" data-service-dialogue-phase={phase}>
      {phase === 'hans-espresso' && hansStyle && (
        <aside className="warroom-fire-call-bubble warroom-fire-call-bubble-hans" style={hansStyle} role="status" aria-live="polite" aria-label="Hans trae un espresso">
          <span>HANS</span><p>{HANS_ESPRESSO_LINE}</p>
        </aside>
      )}
      {phase === 'matthias-espresso' && matthiasStyle && (
        <aside className="warroom-fire-call-bubble warroom-fire-call-bubble-matthias" style={matthiasStyle} data-matthias-square={matthiasTrackedSquare || ''} role="status" aria-live="polite" aria-label="Matthias agradece el espresso">
          <span>MATTHIAS</span><p>{MATTHIAS_ESPRESSO_LINE}</p>
        </aside>
      )}
    </div>,
    portalHost,
  );
}
