import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { claimMatthias3DOpeningBanter } from '../matthias3DOpeningBanter.js';
import { loadMechanicTutorialProgress, markMechanicTutorialSeen } from '../mechanicTutorials.js';
import {
  WAR_ROOM_TUTORIAL_ID,
  WAR_ROOM_TUTORIAL_PHASE,
  resolveWarRoomTutorialPhase,
  warRoomTutorialCopy,
} from '../warRoomFirstRunTutorial.js';
import './Matthias3DOpeningBanter.css';

const BANTER_VISIBLE_MS = 4700;
const TUTORIAL_COMPLETE_VISIBLE_MS = 3200;

function readBoardSignal(host) {
  return {
    selectedSquare: String(host?.dataset?.board3dSelected || ''),
    legalTargetCount: Number(host?.dataset?.board3dLegalTargetCount || 0),
    turn: String(host?.dataset?.board3dTurn || ''),
  };
}

function sameBoardSignal(a, b) {
  return a.selectedSquare === b.selectedSquare
    && a.legalTargetCount === b.legalTargetCount
    && a.turn === b.turn;
}

export default function Matthias3DOpeningBanter({
  gameId,
  isThreeD = false,
  historyLength = 0,
  enabled = true,
  anchorStyle = null,
  trackedSquare = null,
  leadIn = '',
}) {
  const [line, setLine] = useState('');
  const [portalHost, setPortalHost] = useState(null);
  const [tutorialSession, setTutorialSession] = useState(null);
  const [boardSignal, setBoardSignal] = useState({ selectedSquare: '', legalTargetCount: 0, turn: '' });
  const tutorialSeenRef = useRef(false);
  const tutorialWasShownRef = useRef('');
  const anchorReady = Boolean(anchorStyle && trackedSquare);

  useEffect(() => {
    tutorialSeenRef.current = Boolean(loadMechanicTutorialProgress()?.[WAR_ROOM_TUTORIAL_ID]?.seen);
    tutorialWasShownRef.current = '';
    setTutorialSession(null);
    setBoardSignal({ selectedSquare: '', legalTargetCount: 0, turn: '' });
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
    if (!portalHost || !isThreeD) return undefined;

    const syncBoardSignal = () => {
      const next = readBoardSignal(portalHost);
      setBoardSignal((current) => (sameBoardSignal(current, next) ? current : next));

      if (
        !tutorialSession
        && !tutorialSeenRef.current
        && enabled
        && anchorReady
        && gameId
        && next.turn === 'human'
      ) {
        tutorialWasShownRef.current = gameId;
        setLine('');
        setTutorialSession({
          gameId,
          baselineHistoryLength: Number(historyLength) || 0,
        });
      }
    };

    syncBoardSignal();
    if (typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(syncBoardSignal);
    observer.observe(portalHost, {
      attributes: true,
      attributeFilter: [
        'data-board3d-selected',
        'data-board3d-legal-target-count',
        'data-board3d-turn',
      ],
    });
    return () => observer.disconnect();
  }, [portalHost, isThreeD, tutorialSession, enabled, anchorReady, gameId, historyLength]);

  const tutorialPhase = tutorialSession
    ? resolveWarRoomTutorialPhase({
      selectedSquare: boardSignal.selectedSquare,
      legalTargetCount: boardSignal.legalTargetCount,
      historyLength,
      baselineHistoryLength: tutorialSession.baselineHistoryLength,
    })
    : null;

  useEffect(() => {
    if (!tutorialSession || tutorialPhase !== WAR_ROOM_TUTORIAL_PHASE.COMPLETE) return undefined;
    tutorialSeenRef.current = true;
    markMechanicTutorialSeen(WAR_ROOM_TUTORIAL_ID);
    const timer = window.setTimeout(() => setTutorialSession(null), TUTORIAL_COMPLETE_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [tutorialSession, tutorialPhase]);

  function dismissTutorial() {
    tutorialSeenRef.current = true;
    markMechanicTutorialSeen(WAR_ROOM_TUTORIAL_ID);
    setTutorialSession(null);
  }

  useEffect(() => {
    setLine('');
    if (
      !tutorialSeenRef.current
      || tutorialSession
      || tutorialWasShownRef.current === gameId
      || !portalHost
      || !enabled
      || !isThreeD
      || !anchorReady
      || Number(historyLength) !== 0
      || !gameId
    ) return undefined;

    const picked = claimMatthias3DOpeningBanter({ gameId, isThreeD: true, historyLength: 0 });
    if (!picked) return undefined;

    setLine(leadIn ? `${leadIn} ${picked}` : picked);
    const timer = window.setTimeout(() => setLine(''), BANTER_VISIBLE_MS);
    return () => window.clearTimeout(timer);
    // La tirada pertenece al arranque/remount de esta partida. Esperamos a que
    // exista la Sala de guerra y el ancla proyectada del rey real para que el
    // bocadillo nazca ya desde Matthias. Una vez visible, anchorStyle y
    // trackedSquare pueden seguir cambiando con FEN/cámara sin volver a reclamar
    // la frase: si el rey se mueve durante esos 4.7 s, el bocadillo lo sigue.
    // El tutorial de primera entrada tiene prioridad y silencia esta bravuconada
    // durante esa partida para que Matthias mantenga un único hilo conductor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, isThreeD, enabled, portalHost, anchorReady, tutorialSession]);

  if (!isThreeD || !portalHost) return null;

  const tutorialLabel = tutorialPhase === WAR_ROOM_TUTORIAL_PHASE.COMPLETE
    ? 'LISTO'
    : tutorialPhase === WAR_ROOM_TUTORIAL_PHASE.MOVE
      ? '2 / 2'
      : '1 / 2';

  return createPortal(
    <div
      className="matthias-3d-opening-overlay"
      data-testid="matthias-3d-opening-overlay"
      data-speech-anchor="matthias-king"
    >
      {tutorialSession && anchorReady && (
        <aside
          className="matthias-3d-opening-banter matthias-3d-opening-tutorial"
          style={anchorStyle}
          data-matthias-square={trackedSquare || ''}
          data-war-room-first-run-tutorial="true"
          data-tutorial-phase={tutorialPhase || ''}
          role="region"
          aria-label="Tutorial de War Room con Matthias"
        >
          <span className="matthias-3d-opening-banter-name">MATTHIAS · INSTRUCCIÓN</span>
          <p aria-live="polite">{warRoomTutorialCopy(tutorialPhase)}</p>
          <div className="matthias-3d-tutorial-actions">
            <span className="matthias-3d-tutorial-progress" aria-label={`Paso ${tutorialLabel}`}>{tutorialLabel}</span>
            <button type="button" onClick={dismissTutorial}>
              {tutorialPhase === WAR_ROOM_TUTORIAL_PHASE.COMPLETE ? 'Continuar' : 'Saltar'}
            </button>
          </div>
        </aside>
      )}

      {!tutorialSession && line && anchorReady && (
        <aside
          className="matthias-3d-opening-banter"
          style={anchorStyle}
          data-matthias-square={trackedSquare || ''}
          role="status"
          aria-live="polite"
          aria-label="Bravuconada de Matthias al iniciar la partida"
        >
          <span className="matthias-3d-opening-banter-name">MATTHIAS</span>
          <p>{line}</p>
        </aside>
      )}
    </div>,
    portalHost,
  );
}
