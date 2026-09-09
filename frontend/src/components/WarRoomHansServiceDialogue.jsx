import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { warRoomHansChoreDialogueSpec } from './WarRoomHansChoreContract.js';
import { warRoomHansServiceDialogueSpec } from './WarRoomHansServiceContract.js';
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

function dialogueUiSuppressed() {
  return Boolean(
    document.querySelector('.game-layout-focus')
    || document.querySelector('.board-live-row.zen-mode'),
  );
}

export default function WarRoomHansServiceDialogue({
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
  }, [enabled, gameId, isThreeD]);

  useEffect(() => {
    if (!portalHost || !enabled || !gameId || !isThreeD) return undefined;
    let frameId = 0;
    let live = true;
    const tick = () => {
      if (!live) return;
      const canvas = portalHost.querySelector('.board3d-main-canvas');
      const rawPhase = canvas?.dataset?.warRoomHansServiceDialogue || '';
      const spec = warRoomHansServiceDialogueSpec(rawPhase) || warRoomHansChoreDialogueSpec(rawPhase);
      const nextPhase = !dialogueUiSuppressed() && spec ? rawPhase : '';
      setPhase((current) => current === nextPhase ? current : nextPhase);
      if (spec?.speaker === 'HANS' && nextPhase && canvas?.dataset?.warRoomHansScreen === 'onscreen') {
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

  const spec = warRoomHansServiceDialogueSpec(phase) || warRoomHansChoreDialogueSpec(phase);
  if (!isThreeD || !enabled || !gameId || !portalHost || !phase || !spec) return null;
  const isHans = spec.speaker === 'HANS';
  const style = isHans ? hansStyle : matthiasStyle;
  if (!style) return null;

  return createPortal(
    <div className="warroom-hans-fire-call-overlay" data-testid="warroom-hans-service-dialogue" data-service-dialogue-phase={phase}>
      <aside
        className={`warroom-fire-call-bubble ${isHans ? 'warroom-fire-call-bubble-hans' : 'warroom-fire-call-bubble-matthias'}`}
        style={style}
        data-matthias-square={!isHans ? (matthiasTrackedSquare || '') : undefined}
        role="status"
        aria-live="polite"
        aria-label={spec.aria}
      >
        <span>{spec.speaker}</span><p>{spec.text}</p>
      </aside>
    </div>,
    portalHost,
  );
}
