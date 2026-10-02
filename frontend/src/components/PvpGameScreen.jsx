import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PromotionModal from './PromotionModal.jsx';
import { WarRoomUtilityMenu } from './GameWarRoomCommandColumn.jsx';
import WarRoomBoardSurface from './WarRoomBoardSurface.jsx';
import { formatClock } from '../clock.js';
import { pvpApi } from '../pvpApi.js';
import { pvpMatchPulseNeedsFullRefresh } from '../pvpMatchPolling.js';
import { checkedKingSquare } from '../boardState.js';
import { getBoardCoordinates, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';
import { CPU_IDENTITY } from '../cpuIdentity.js';
import {
  chooseMoveTo,
  disconnectGraceSeconds,
  lastMoveFromHistory,
  mergeNewerMatch,
  opponentForMatch,
  opponentPresenceLabel,
  playerResult,
  projectPvpClock,
  selectableMoves,
  uniqueLegalTargets,
} from '../pvpGameModel.js';
import useWarRoomSpatialAmbience from './useWarRoomSpatialAmbience.js';
import './WarRoomMobileLandscape.css';
import './PvpGameScreen.css';

function resultCopy(result, endReason) {
  if (endReason === 'disconnect') {
    if (result === 'win') return { title: 'Victoria', detail: 'El rival agotó los 60 s de gracia de reconexión.' };
    if (result === 'loss') return { title: 'Derrota', detail: 'Se agotaron tus 60 s de gracia de reconexión.' };
  }
  if (result === 'win') return { title: 'Victoria', detail: 'La sala reconoce al superviviente.' };
  if (result === 'loss') return { title: 'Derrota', detail: 'El rival se lleva esta. La mesa sigue en pie.' };
  if (result === 'draw') return { title: 'Tablas', detail: 'Nadie sale con la espada completamente limpia.' };
  return null;
}

function pvpEndReasonLabel(endReason) {
  if (endReason === 'timeout') return 'Tiempo';
  if (endReason === 'resignation') return 'Rendición';
  if (endReason === 'disconnect') return 'Desconexión';
  return 'Tablero';
}

function pvpMatthiasVerdict(result, endReason) {
  if (endReason === 'timeout') {
    if (result === 'win') return 'Ganaste por tiempo. El reloj hizo el trabajo sucio; cuenta igual, pero no te pongas poético.';
    if (result === 'loss') return 'Perdiste por tiempo. El tablero quizá tenía opiniones; el reloj no negocia.';
    return 'Tablas con el reloj de por medio. Una forma particularmente administrativa de sobrevivir.';
  }
  if (endReason === 'resignation') {
    if (result === 'win') return 'Tu rival se rindió. Eso es un dato; la causa exacta no la inventaremos. El duelo, en cambio, sí está cerrado.';
    if (result === 'loss') return 'Te rendiste. Puede ser criterio o desesperación; sin análisis no voy a fingir cuál de las dos.';
  }
  if (endReason === 'disconnect') {
    if (result === 'win') return 'El rival no volvió dentro del margen. Victoria administrativa, sí; regalarla desenchufando el cable habría sido peor.';
    if (result === 'loss') return 'La conexión no volvió a tiempo. El servidor esperó sesenta segundos y luego cerró la persiana, con bastante menos romanticismo que un mate.';
  }
  if (result === 'win') return 'Victoria en tablero. Bien. El resultado está registrado; las pullas tácticas vendrán cuando haya pruebas para sostenerlas.';
  if (result === 'loss') return 'Derrota en tablero. Nada de inventar culpables: el resultado está claro; las causas requieren análisis.';
  return 'Tablas. Nadie se lleva el cadáver. El resultado está claro y no hace falta disfrazarlo con estadísticas de feria.';
}

export default function PvpGameScreen({ initialMatch, onExit, onMatchUpdate }) {
  const [match, setMatch] = useState(initialMatch);
  const [selected, setSelected] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showCoordinates, setShowCoordinates] = useState(() => getBoardCoordinates());
  const [pendingAnim, setPendingAnim] = useState(null);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [resigning, setResigning] = useState(false);
  const [connectionState, setConnectionState] = useState(() => (
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'reconnecting' : 'live'
  ));
  const [clockElapsedMs, setClockElapsedMs] = useState(0);
  const clockAnchorRef = useRef(Date.now());
  const animSeqRef = useRef(0);
  const historyLengthRef = useRef(initialMatch?.history?.length || 0);
  const matchRevisionRef = useRef(Number(initialMatch?.revision || 0));
  const lastFullRefreshAtRef = useRef(Date.now());
  const matchPulseUnsupportedRef = useRef(false);
  useWarRoomSpatialAmbience({ enabled: true });

  const opponent = useMemo(() => opponentForMatch(match), [match]);
  const result = useMemo(() => playerResult(match), [match]);
  const resultText = resultCopy(result, match?.endReason);
  const endReasonLabel = resultText ? pvpEndReasonLabel(match?.endReason) : '';
  const matthiasVerdict = resultText ? pvpMatthiasVerdict(result, match?.endReason) : '';
  const eloChange = match?.ratingChange || null;
  const eloDeltaLabel = eloChange ? `${eloChange.delta >= 0 ? '+' : ''}${eloChange.delta}` : '';
  const connectionLive = connectionState === 'live';
  const canInteract = connectionLive && match?.status === 'active' && match?.yourTurn && !busy;
  const moves = useMemo(
    () => canInteract ? selectableMoves(match.fen, selected, match.youAre) : [],
    [canInteract, match?.fen, match?.youAre, selected],
  );
  const legalTargets = useMemo(() => uniqueLegalTargets(moves), [moves]);
  const lastMove = useMemo(() => lastMoveFromHistory(match?.history), [match?.history]);
  const checkSquare = useMemo(() => checkedKingSquare(match?.fen), [match?.fen]);
  const orientation = match?.youAre === 'b' ? 'black' : 'white';
  const disconnectSeconds = useMemo(
    () => disconnectGraceSeconds(match?.opponentDisconnectDeadline, Date.now()),
    [clockElapsedMs, match?.opponentDisconnectDeadline],
  );
  const opponentPresence = match?.opponentPresence === 'disconnected' && disconnectSeconds !== null
    ? `SIN CONEXIÓN · ${disconnectSeconds} s`
    : opponentPresenceLabel(match?.opponentPresence);
  const tone = busy || !connectionLive ? 'amber' : match?.status !== 'active' ? 'amber' : match?.yourTurn ? 'green' : 'red';
  const turnLabel = !connectionLive
    ? 'Reconectando con el árbitro…'
    : busy
      ? 'Transmitiendo jugada…'
      : match?.status !== 'active'
        ? resultText?.title || 'Partida terminada'
        : match?.yourTurn
          ? 'Tu turno'
          : `${opponent?.username || 'Rival'} juega`;
  const liveClock = useMemo(() => projectPvpClock(match?.clock, clockElapsedMs), [clockElapsedMs, match?.clock]);
  const yourClockMs = match?.youAre === 'b' ? liveClock.blackMs : liveClock.whiteMs;
  const rivalClockMs = opponent?.color === 'w' ? liveClock.whiteMs : liveClock.blackMs;

  const applyAuthoritativeMatch = useCallback((nextMatch) => {
    if (!nextMatch?.id) return;
    setMatch((current) => mergeNewerMatch(current, nextMatch));
    onMatchUpdate?.(nextMatch);
  }, [onMatchUpdate]);

  useEffect(() => {
    clockAnchorRef.current = Date.now();
    setClockElapsedMs(0);
    if (match?.status !== 'active' || !match?.clock?.runningColor) return undefined;
    const timer = window.setInterval(() => {
      setClockElapsedMs(Math.max(0, Date.now() - clockAnchorRef.current));
    }, 250);
    return () => window.clearInterval(timer);
  }, [match?.clock?.blackMs, match?.clock?.runningColor, match?.clock?.whiteMs, match?.revision, match?.status]);

  useEffect(() => {
    const refresh = () => setShowCoordinates(getBoardCoordinates());
    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    matchRevisionRef.current = Number(match?.revision || 0);
    setSelected(null);
    setPendingPromotion(null);
    const currentLength = match?.history?.length || 0;
    if (currentLength > historyLengthRef.current) {
      const move = lastMoveFromHistory(match.history);
      if (move) setPendingAnim({ ...move, seq: ++animSeqRef.current });
    }
    historyLengthRef.current = currentLength;
  }, [match?.revision]);

  useEffect(() => {
    if (!connectionLive) setShowResignConfirm(false);
  }, [connectionLive]);

  useEffect(() => {
    if (!match?.id || match.status !== 'active') return undefined;
    let active = true;
    let timer = null;
    let controller = null;

    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };

    const schedule = (delay) => {
      clearTimer();
      timer = window.setTimeout(() => { void poll(); }, delay);
    };

    async function poll() {
      if (!active || document.visibilityState === 'hidden') return;
      controller?.abort();
      controller = new AbortController();
      try {
        let pulse = null;
        if (!matchPulseUnsupportedRef.current) {
          try {
            pulse = await pvpApi.getMatchPulse(match.id, { signal: controller.signal });
          } catch (pulseError) {
            if (pulseError?.name === 'AbortError') return;
            if ([404, 405, 501].includes(Number(pulseError?.status))) {
              matchPulseUnsupportedRef.current = true;
            } else {
              throw pulseError;
            }
          }
        }

        const nowMs = Date.now();
        const needsFullRefresh = !pulse || pvpMatchPulseNeedsFullRefresh({
          currentRevision: matchRevisionRef.current,
          pulseRevision: pulse?.revision,
          currentOpponentPresence: match?.opponentPresence,
          pulseOpponentPresence: pulse?.opponentPresence,
          lifecycleDue: pulse?.lifecycleDue,
          lastFullAt: lastFullRefreshAtRef.current,
          nowMs,
        });

        let response = null;
        if (needsFullRefresh) {
          response = await pvpApi.getMatch(match.id, { signal: controller.signal });
          lastFullRefreshAtRef.current = Date.now();
          if (!active) return;
          applyAuthoritativeMatch(response?.match);
        }
        setConnectionState('live');
        setError('');
        schedule(Math.max(900, Number(pulse?.pollAfterMs || response?.pollAfterMs || 1250)));
      } catch (err) {
        if (!active || err?.name === 'AbortError') return;
        setConnectionState('reconnecting');
        setSelected(null);
        setPendingPromotion(null);
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
          setError(err?.message || 'No se pudo sincronizar la partida.');
          schedule(2500);
        }
      }
    }

    const requestImmediateSync = () => {
      if (!active || document.visibilityState === 'hidden') return;
      setConnectionState('reconnecting');
      setSelected(null);
      setPendingPromotion(null);
      schedule(0);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        clearTimer();
        controller?.abort();
        return;
      }
      requestImmediateSync();
    };

    const handleOffline = () => {
      clearTimer();
      controller?.abort();
      setConnectionState('reconnecting');
      setSelected(null);
      setPendingPromotion(null);
      setError('');
    };

    const handleOnline = () => requestImmediateSync();

    schedule(450);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      active = false;
      clearTimer();
      controller?.abort();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [applyAuthoritativeMatch, match?.id, match?.status]);

  const submitMove = useCallback(async (from, to, promotion = null) => {
    if (!match?.id || !canInteract) return;
    setBusy(true);
    setError('');
    try {
      const response = await pvpApi.playMove(match.id, from, to, promotion);
      if (response?.match) applyAuthoritativeMatch(response.match);
    } catch (err) {
      // A human-vs-human match can legitimately race the 1.25 s polling window:
      // the UI may still show our turn when the opponent's move has just been
      // committed. The authoritative API answers 409 and the next GET already
      // contains the new position. Do not flash a scary error for that expected
      // synchronization race; resync silently and only surface an error when
      // the recovery read itself fails.
      const transientMoveConflict = Number(err?.status) === 409;
      if (!transientMoveConflict) {
        setError(err?.message || 'La jugada no llegó al árbitro.');
      }
      try {
        const response = await pvpApi.getMatch(match.id);
        if (response?.match) {
          applyAuthoritativeMatch(response.match);
          setConnectionState('live');
          if (transientMoveConflict) setError('');
        }
      } catch {
        setConnectionState('reconnecting');
        setSelected(null);
        setPendingPromotion(null);
        setError(err?.message || 'No se pudo sincronizar la partida.');
        // El polling y los eventos online/foreground reintentan contra la autoridad.
      }
    } finally {
      setBusy(false);
    }
  }, [applyAuthoritativeMatch, canInteract, match?.id]);

  const onSquareClick = useCallback((square) => {
    if (!canInteract) return;
    if (selected) {
      const choice = chooseMoveTo(moves, square);
      if (choice.kind === 'move') {
        void submitMove(choice.move.from, choice.move.to, choice.move.promotion);
        return;
      }
      if (choice.kind === 'promotion') {
        setPendingPromotion({ from: choice.from, to: choice.to });
        return;
      }
    }
    const selectable = selectableMoves(match.fen, square, match.youAre);
    setSelected(selectable.length ? square : null);
  }, [canInteract, match?.fen, match?.youAre, moves, selected, submitMove]);

  function choosePromotion(piece) {
    const pending = pendingPromotion;
    setPendingPromotion(null);
    if (pending) void submitMove(pending.from, pending.to, piece);
  }

  async function confirmResign() {
    if (!match?.id || match.status !== 'active' || !connectionLive || resigning) return;
    setResigning(true);
    setError('');
    try {
      const response = await pvpApi.resignMatch(match.id);
      if (response?.match) applyAuthoritativeMatch(response.match);
      setShowResignConfirm(false);
    } catch (err) {
      setError(err?.message || 'No se pudo registrar la rendición.');
    } finally {
      setResigning(false);
    }
  }

  if (!match || !opponent) return null;

  return (
    <section className="game-screen pvp-war-room" aria-label="Sala de duelo 1 contra 1">
      <div className="game-layout game-layout-3d pvp-war-room__layout">
        <div className="board-column">
          <div className="board-live-row is-3d-warroom">
            <div className="game-board-stack game-board-stack-3d">
              <div className="game-board-3d-stage pvp-war-room__stage">
                {match.status === 'active' ? (
                  <button
                    type="button"
                    className="secondary-btn pvp-war-room__exit"
                    aria-label="Salir de la partida"
                    disabled={!connectionLive || resigning}
                    onClick={() => setShowResignConfirm(true)}
                  >
                    ← Salir
                  </button>
                ) : (
                  <button type="button" className="secondary-btn pvp-war-room__exit" onClick={() => onExit?.(match)}>← Lobby</button>
                )}
                <WarRoomBoardSurface
                  isThreeD
                  loadingLabel="Abriendo la sala…"
                  loadingClassName="pvp-war-room__loading"
                  boardProps={{
                    gameId: `pvp-${match.id}`,
                    fen: match.fen,
                    onSquareClick,
                    selectedSquare: selected,
                    legalTargets,
                    lastMove,
                    animate: pendingAnim,
                    hintMove: null,
                    checkSquare,
                    gameOver: match.status !== 'active',
                    turnState: busy || !connectionLive ? 'thinking' : match.yourTurn ? 'human' : 'cpu',
                    orientation,
                    showCoordinates,
                    matthiasKingColor: null,
                    cameraProfile: 'warroom',
                    hansFireplaceIteration: false,
                    hansFireCallEnabled: false,
                    immersive: true,
                    warRoomVariantOverride: 'duel',
                  }}
                />

                <aside className={`pvp-war-room__duel-pill is-${tone}`} aria-label="Estado del duelo">
                  <span className="pvp-war-room__opponent-mark" aria-hidden="true">♟</span>
                  <span className="pvp-war-room__identity">
                    <strong>{opponent.displayName}</strong>
                    <small
                      className={`pvp-war-room__opponent-meta is-${match.opponentPresence || 'unknown'}`}
                      aria-label={`Estado de ${opponent.displayName}: ${opponentPresence}`}
                    >
                      <span>{opponent.rating} Elo 1v1{opponent.actorLabel ? ` · ${opponent.actorLabel}` : ''}</span>
                      <em>{opponentPresence}</em>
                    </small>
                  </span>
                  <span className="pvp-war-room__divider" aria-hidden="true" />
                  <span className="pvp-war-room__light" aria-hidden="true" />
                  <strong role="status" aria-live="polite">{turnLabel}</strong>
                  {match.clock && (
                    <span className="pvp-war-room__clocks" aria-label="Reloj 1 contra 1">
                      <span className={`pvp-war-room__clock${liveClock.runningColor === match.youAre ? ' is-active' : ''}${yourClockMs <= 10000 ? ' is-low' : ''}`}>
                        <small>TÚ</small><b>{formatClock(yourClockMs / 1000)}</b>
                      </span>
                      <span className={`pvp-war-room__clock${liveClock.runningColor === opponent.color ? ' is-active' : ''}${rivalClockMs <= 10000 ? ' is-low' : ''}`}>
                        <small>{opponent.displayName}</small><b>{formatClock(rivalClockMs / 1000)}</b>
                      </span>
                    </span>
                  )}
                  <WarRoomUtilityMenu
                    game={match}
                    board={null}
                    controls={{ onAbandon: match.status === 'active' && connectionLive ? () => setShowResignConfirm(true) : undefined }}
                    zenMode={false}
                    showFocus={false}
                    showRendererToggle={false}
                    showAppearance={false}
                    showZen={false}
                  />
                </aside>

                {resultText && (
                  <aside className="pvp-war-room__result" role="dialog" aria-label="Resumen del duelo">
                    <small className="pvp-war-room__result-kicker">MATTHIAS // DEBRIEF 1 VS 1</small>
                    <strong className="pvp-war-room__result-title">{resultText.title}</strong>
                    <p className="pvp-war-room__result-lead">{resultText.detail}</p>
                    <blockquote className="pvp-war-room__result-verdict">
                      <span>
                        <img src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" />
                        <b>{CPU_IDENTITY.name}</b>
                      </span>
                      <p>{matthiasVerdict}</p>
                    </blockquote>
                    {eloChange && (
                      <div className="pvp-war-room__elo-change" aria-label={`Elo 1 contra 1: ${eloChange.before}, ahora ${eloChange.after}, cambio ${eloDeltaLabel}`}>
                        <small>ELO 1 VS 1</small>
                        <span><b>{eloChange.before}</b><i>→</i><strong>{eloChange.after}</strong><em className={eloChange.delta >= 0 ? 'is-up' : 'is-down'}>{eloDeltaLabel}</em></span>
                      </div>
                    )}
                    <p className="pvp-war-room__result-facts">
                      Contra <b>{opponent.username}</b> · {opponent.rating} Elo 1v1 inicial · {endReasonLabel} · {(match.history || []).length} jugadas registradas
                    </p>
                    <button type="button" className="primary-btn" onClick={() => onExit?.(match)}>Volver al lobby</button>
                  </aside>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showResignConfirm && (
        <div className="modal-backdrop pvp-resign-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !resigning) setShowResignConfirm(false); }}>
          <div className="army-card pvp-resign-card" role="dialog" aria-modal="true" aria-labelledby="pvp-resign-title">
            <span className="eyebrow">1 VS 1 · Duel Room</span>
            <h3 id="pvp-resign-title">¿Abandonar la partida?</h3>
            <p>Para volver al lobby durante un duelo debes rendirte. Cuenta como victoria del rival y el rating se liquidará en el servidor.</p>
            <div className="pvp-resign-actions">
              <button type="button" className="secondary-btn" disabled={resigning} onClick={() => setShowResignConfirm(false)}>Seguir jugando</button>
              <button type="button" className="danger-btn" disabled={resigning} onClick={() => void confirmResign()}>{resigning ? 'Registrando…' : 'Rendirse'}</button>
            </div>
          </div>
        </div>
      )}
      {error && <p className="pvp-war-room__error" role="alert">{error}</p>}
      {pendingPromotion && <PromotionModal onChoose={choosePromotion} />}
    </section>
  );
}
