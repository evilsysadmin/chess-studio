import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { pickHansLegalSuggestion } from './WarRoomHansBoardPeek.js';
import { hansQuickIterationFrame } from './WarRoomHansIteration.js';
import {
  HANS_BOARD_PEEK_MS,
  HANS_FIRE_REPLY_LINE,
  HANS_FIRE_REPLY_MS,
  HANS_LEAVING_GRUMBLE_LINE,
  HANS_LEAVING_GRUMBLE_MS,
  HANS_WORKING_REPLY_LINE,
  HANS_WORKING_REPLY_MS,
  MATTHIAS_FIRE_CALL_LINE,
  MATTHIAS_FIRE_CALL_MS,
  MATTHIAS_FIRE_EPILOGUE_LINE,
  MATTHIAS_FIRE_EPILOGUE_MS,
  MATTHIAS_HANS_WORKING_LINE,
  MATTHIAS_HANS_WORKING_MS,
  projectHansFireReplyAnchor,
  shouldStartHansBoardPeek,
  shouldStartHansFireEpilogue,
  shouldStartHansLeavingGrumble,
} from './WarRoomHansFireCallContract.js';
import './WarRoomHansFireCall.css';

const HANS_DOOR_OPENING_MS = 600;
const HANS_PRESENTATION_TIME_SCALE = 0.54;

function sameAnchor(current, next) {
  if (current === next) return true;
  if (!current || !next) return false;
  return Math.abs(current.left - next.left) < 0.025
    && Math.abs(current.top - next.top) < 0.025
    && current.bubbleShiftPercent === next.bubbleShiftPercent
    && current.tailPercent === next.tailPercent;
}

function hansPresentationPhase(presentationMs) {
  const elapsedSeconds = Math.max(0, Number(presentationMs) - HANS_DOOR_OPENING_MS)
    / 1000 * HANS_PRESENTATION_TIME_SCALE;
  return hansQuickIterationFrame(elapsedSeconds).phase;
}

export default function WarRoomHansFireCall({
  gameId,
  fen = '',
  isThreeD = false,
  enabled = false,
  matthiasAnchorStyle = null,
  matthiasTrackedSquare = null,
  onComplete = null,
}) {
  const [portalHost, setPortalHost] = useState(null);
  const [phase, setPhase] = useState('');
  const [hansAnchor, setHansAnchor] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const fenRef = useRef(fen);
  fenRef.current = fen;
  const anchorReady = Boolean(matthiasAnchorStyle && matthiasTrackedSquare);

  useEffect(() => {
    setPhase('');
    setHansAnchor(null);
    setSuggestion(null);
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
    setSuggestion(null);
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
    let hansSeenOnscreen = false;
    let completionNotified = false;
    let callReleased = false;
    let presentationMs = 0;
    let peekAttempted = false;
    let boardSuggestion = null;
    let grumblePlayed = false;

    const finishSequence = () => {
      if (completionNotified) return;
      completionNotified = true;
      currentPhase = '';
      setPhase('');
      onComplete?.();
    };

    const tick = (now) => {
      if (!live) return;
      const delta = previousTime == null ? 0 : Math.max(0, now - previousTime);
      previousTime = now;
      const canvas = portalHost.querySelector('.board3d-main-canvas');
      const visible = document.visibilityState !== 'hidden' && portalHost.getBoundingClientRect().width > 0;
      if (visible && canvas?.dataset.warRoomHansSceneReady === 'true') {
        const hansScreen = canvas.dataset.warRoomHansScreen || 'missing';

        if (callReleased) {
          // Mirrors the bounded presentation clock used by WarRoomHansIteration.
          presentationMs += Math.min(delta, presentationMs < HANS_DOOR_OPENING_MS ? 100 : 1000);
        }
        const hansPhase = callReleased ? hansPresentationPhase(presentationMs) : 'waiting';

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
            canvas.dispatchEvent(new Event('warroom-hans-call-release'));
            callReleased = true;
            presentationMs = 0;
            currentPhase = 'await-hans';
            setPhase('await-hans');
            elapsed = 0;
          }
        } else if (currentPhase === 'hans') {
          elapsed += delta;
          if (elapsed >= HANS_FIRE_REPLY_MS) {
            currentPhase = 'await-peek';
            setPhase('await-peek');
            elapsed = 0;
          }
        } else if (currentPhase === 'peek') {
          elapsed += delta;
          if (elapsed >= HANS_BOARD_PEEK_MS) {
            currentPhase = 'matthias-working';
            setPhase('matthias-working');
            elapsed = 0;
          }
        } else if (currentPhase === 'matthias-working') {
          elapsed += delta;
          if (elapsed >= MATTHIAS_HANS_WORKING_MS) {
            currentPhase = 'hans-working-reply';
            setPhase('hans-working-reply');
            elapsed = 0;
          }
        } else if (currentPhase === 'hans-working-reply') {
          elapsed += delta;
          if (elapsed >= HANS_WORKING_REPLY_MS) {
            currentPhase = 'await-exit';
            setPhase('await-exit');
            elapsed = 0;
          }
        } else if (currentPhase === 'grumble') {
          elapsed += delta;
          if (elapsed >= HANS_LEAVING_GRUMBLE_MS) {
            currentPhase = 'await-exit';
            setPhase('await-exit');
            elapsed = 0;
          }
        } else if (currentPhase === 'epilogue') {
          elapsed += delta;
          if (elapsed >= MATTHIAS_FIRE_EPILOGUE_MS) finishSequence();
        }

        const tracksHans = currentPhase === 'await-hans'
          || currentPhase === 'hans'
          || currentPhase === 'await-peek'
          || currentPhase === 'peek'
          || currentPhase === 'hans-working-reply'
          || currentPhase === 'await-exit'
          || currentPhase === 'grumble';
        if (tracksHans && hansScreen === 'onscreen') {
          hansSeenOnscreen = true;
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

        if (currentPhase === 'await-peek' && hansPhase === 'satisfied' && !peekAttempted) {
          peekAttempted = true;
          boardSuggestion = pickHansLegalSuggestion(fenRef.current);
          setSuggestion(boardSuggestion);
          if (shouldStartHansBoardPeek({
            phase: currentPhase,
            hansPhase,
            suggestion: boardSuggestion,
          })) {
            currentPhase = 'peek';
            elapsed = 0;
            setPhase('peek');
          } else {
            currentPhase = 'await-exit';
            setPhase('await-exit');
          }
        }

        if (shouldStartHansLeavingGrumble({
          phase: currentPhase,
          hansPhase,
          alreadyPlayed: grumblePlayed,
        })) {
          grumblePlayed = true;
          currentPhase = 'grumble';
          elapsed = 0;
          setPhase('grumble');
        }

        if (shouldStartHansFireEpilogue({
          phase: currentPhase,
          hansSeenOnscreen,
          hansScreen,
        })) {
          currentPhase = 'epilogue';
          elapsed = 0;
          setPhase('epilogue');
        }
      }
      if (currentPhase !== '') frameId = window.requestAnimationFrame(tick);
    };
    const resetVisibleClock = () => { previousTime = null; };
    document.addEventListener('visibilitychange', resetVisibleClock);
    frameId = window.requestAnimationFrame(tick);
    return () => {
      document.removeEventListener('visibilitychange', resetVisibleClock);
      live = false;
      window.cancelAnimationFrame(frameId);
    };
  }, [anchorReady, enabled, gameId, isThreeD, onComplete, portalHost]);

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
      {phase === 'peek' && hansStyle && suggestion && (
        <aside
          className="warroom-fire-call-bubble warroom-fire-call-bubble-hans"
          style={hansStyle}
          role="status"
          aria-live="polite"
          aria-label="Hans cotillea el tablero y propone una jugada"
        >
          <span>HANS</span>
          <p>{suggestion.line}</p>
        </aside>
      )}
      {phase === 'matthias-working' && matthiasStyle && (
        <aside
          className="warroom-fire-call-bubble warroom-fire-call-bubble-matthias"
          style={matthiasStyle}
          data-matthias-square={matthiasTrackedSquare || ''}
          role="status"
          aria-live="polite"
          aria-label="Matthias manda a Hans volver al trabajo"
        >
          <span>MATTHIAS</span>
          <p>{MATTHIAS_HANS_WORKING_LINE}</p>
        </aside>
      )}
      {phase === 'hans-working-reply' && hansStyle && (
        <aside
          className="warroom-fire-call-bubble warroom-fire-call-bubble-hans"
          style={hansStyle}
          role="status"
          aria-live="polite"
          aria-label="Hans obedece a Matthias"
        >
          <span>HANS</span>
          <p>{HANS_WORKING_REPLY_LINE}</p>
        </aside>
      )}
      {phase === 'grumble' && hansStyle && (
        <aside
          className="warroom-fire-call-bubble warroom-fire-call-bubble-hans"
          style={hansStyle}
          role="status"
          aria-live="polite"
          aria-label="Hans se marcha refunfuñando"
        >
          <span>HANS</span>
          <p>{HANS_LEAVING_GRUMBLE_LINE}</p>
        </aside>
      )}
      {phase === 'epilogue' && matthiasStyle && (
        <aside
          className="warroom-fire-call-bubble warroom-fire-call-bubble-matthias"
          style={matthiasStyle}
          data-matthias-square={matthiasTrackedSquare || ''}
          role="status"
          aria-live="polite"
          aria-label="Matthias retoma la partida tras Hans"
        >
          <span>MATTHIAS</span>
          <p>{MATTHIAS_FIRE_EPILOGUE_LINE}</p>
        </aside>
      )}
    </div>,
    portalHost,
  );
}
