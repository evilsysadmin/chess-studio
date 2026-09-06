import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HANS_GREETING_HANS_MS,
  HANS_GREETING_LINE,
  HANS_GREETING_TOTAL_MS,
  MATTHIAS_HANS_REPLY_LINE,
  projectHansGreetingAnchor,
} from './WarRoomHansGreetingContract.js';
import './WarRoomHansGreeting.css';

function sameAnchor(current, next) {
  if (current === next) return true;
  if (!current || !next) return false;
  return Math.abs(current.left - next.left) < 0.025
    && Math.abs(current.top - next.top) < 0.025
    && current.bubbleShiftPercent === next.bubbleShiftPercent
    && current.tailPercent === next.tailPercent;
}

export default function WarRoomHansGreeting({
  gameId,
  isThreeD = false,
  enabled = false,
  matthiasAnchorStyle = null,
  matthiasTrackedSquare = null,
}) {
  const [portalHost, setPortalHost] = useState(null);
  const [phase, setPhase] = useState('');
  const [hansAnchor, setHansAnchor] = useState(null);
  const claimedRef = useRef(false);
  const activeRef = useRef(false);

  useEffect(() => {
    claimedRef.current = false;
    activeRef.current = false;
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
    if (!portalHost || !enabled || !isThreeD || !gameId || typeof MutationObserver === 'undefined') return undefined;

    let replyTimer = 0;
    let clearTimer = 0;

    const readHansProbe = () => {
      if (claimedRef.current && !activeRef.current) return;
      const canvas = portalHost.querySelector('.board3d-main-canvas');
      if (!canvas || canvas.dataset.warRoomHansScreen !== 'onscreen') return;

      const anchor = projectHansGreetingAnchor({
        ndcX: canvas.dataset.warRoomHansNdcX,
        ndcY: canvas.dataset.warRoomHansNdcY,
        coarsePointer: Boolean(window.matchMedia?.('(pointer: coarse)')?.matches),
      });
      if (!anchor) return;

      if (!claimedRef.current) {
        claimedRef.current = true;
        activeRef.current = true;
        setPhase('hans');
        replyTimer = window.setTimeout(() => {
          if (activeRef.current) setPhase('matthias');
        }, HANS_GREETING_HANS_MS);
        clearTimer = window.setTimeout(() => {
          activeRef.current = false;
          setPhase('');
        }, HANS_GREETING_TOTAL_MS);
      }

      if (activeRef.current) {
        setHansAnchor((current) => sameAnchor(current, anchor) ? current : anchor);
      }
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

    return () => {
      observer.disconnect();
      if (replyTimer) window.clearTimeout(replyTimer);
      if (clearTimer) window.clearTimeout(clearTimer);
      activeRef.current = false;
    };
  }, [enabled, gameId, isThreeD, portalHost]);

  const hansStyle = useMemo(() => hansAnchor ? {
    left: `${hansAnchor.left.toFixed(3)}%`,
    top: `${hansAnchor.top.toFixed(3)}%`,
    right: 'auto',
    '--warroom-greeting-translate-x': `${hansAnchor.bubbleShiftPercent}%`,
    '--warroom-greeting-tail-x': `${hansAnchor.tailPercent}%`,
  } : null, [hansAnchor]);

  const matthiasStyle = useMemo(() => matthiasAnchorStyle ? {
    ...matthiasAnchorStyle,
    '--warroom-greeting-translate-x': '-50%',
    '--warroom-greeting-tail-x': '50%',
  } : null, [matthiasAnchorStyle]);

  if (!isThreeD || !portalHost || !enabled) return null;

  return createPortal(
    <div className="warroom-hans-greeting-overlay" data-testid="warroom-hans-greeting-overlay">
      {phase === 'hans' && hansStyle && (
        <aside
          className="warroom-character-greeting warroom-character-greeting-hans"
          style={hansStyle}
          role="status"
          aria-live="polite"
          aria-label="Saludo de Hans al entrar en la Sala de guerra"
        >
          <span>HANS</span>
          <p>{HANS_GREETING_LINE}</p>
        </aside>
      )}
      {phase === 'matthias' && matthiasStyle && (
        <aside
          className="warroom-character-greeting warroom-character-greeting-matthias"
          style={matthiasStyle}
          data-matthias-square={matthiasTrackedSquare || ''}
          role="status"
          aria-live="polite"
          aria-label="Respuesta de Matthias a Hans"
        >
          <span>MATTHIAS</span>
          <p>{MATTHIAS_HANS_REPLY_LINE}</p>
        </aside>
      )}
    </div>,
    portalHost,
  );
}
