import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PromotionModal from './PromotionModal.jsx';
import { WarRoomUtilityMenu } from './GameWarRoomCommandColumn.jsx';
import { formatClock } from '../clock.js';
import { pvpApi } from '../pvpApi.js';
import { checkedKingSquare } from '../boardState.js';
import { getBoardCoordinates, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';
import { CPU_IDENTITY } from '../cpuIdentity.js';
import {
  chooseMoveTo,
  lastMoveFromHistory,
  mergeNewerMatch,
  opponentForMatch,
  playerResult,
  projectPvpClock,
  selectableMoves,
  uniqueLegalTargets,
} from '../pvpGameModel.js';
import useWarRoomSpatialAmbience from './useWarRoomSpatialAmbience.js';
import './WarRoomCompositionPolish.css';
import './WarRoomMobileLandscape.css';
import './PvpGameScreen.css';

const Board3D = lazy(() => import('./Board3D.jsx'));

function resultCopy(result) {
  if (result === 'win') return { title: 'Victoria', detail: 'La sala reconoce al superviviente.' };
  if (result === 'loss') return { title: 'Derrota', detail: 'El rival se lleva esta. La mesa sigue en pie.' };
  if (result === 'draw') return { title: 'Tablas', detail: 'Nadie sale con la espada completamente limpia.' };
  return null;
}

function pvpEndReasonLabel(endReason) {
  if (endReason === 'timeout') return 'Tiempo';
  if (endReason === 'resignation') return 'Rendición';
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
  if (result === 'win') return 'Victoria en tablero. Bien. El resultado está registrado; las pullas tácticas vendrán cuando haya pruebas para sostenerlas.';
  if (result === 'loss') return 'Derrota en tablero. Nada de inventar culpables: el resultado está claro; las causas requieren análisis.';
  return 'Tablas. Nadie se lleva el cadáver. El resultado está claro y no hace falta disfrazarlo con estadísticas de feria.';
}

export default function PvpGameScreen({ initialMatch, onExit }) {
  const [match, setMatch] = useState(initialMatch);
  const [selected, setSelected] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showCoordinates, setShowCoordinates] = useState(() => getBoardCoordinates());
  const [pendingAnim, setPendingAnim] = useState(null);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [resigning, setResigning] = useState(false);
  const [clockElapsedMs, setClockElapsedMs] = useState(0);
  const clockAnchorRef = useRef(Date.now());
  const animSeqRef = useRef(0);
  const historyLengthRef = useRef(initialMatch?.history?.length || 0);
  useWarRoomSpatialAmbience({ enabled: true });

  const opponent = useMemo(() => opponentForMatch(match), [match]);
  const result = useMemo(() => playerResult(match), [match]);
  const resultText = resultCopy(result);
  const endReasonLabel = resultText ? pvpEndReasonLabel(match?.endReason) : '';
  const matthiasVerdict = resultText ? pvpMatthiasVerdict(result, match?.endReason) : '';
  const moves = useMemo(
    () => match?.yourTurn && !busy ? selectableMoves(match.fen, selected, match.youAre) : [],
    [busy, match?.fen, match?.youAre, match?.yourTurn, selected],
  );
  const legalTargets = useMemo(() => uniqueLegalTargets(moves), [moves]);
  const lastMove = useMemo(() => lastMoveFromHistory(match?.history), [match?.history]);
  const checkSquare = useMemo(() => checkedKingSquare(match?.fen), [match?.fen]);
  const orientation = match?.youAre === 'b' ? 'black' : 'white';
  const tone = busy ? 'amber' : match?.status !== 'active' ? 'amber' : match?.yourTurn ? 'green' : 'red';
  const turnLabel = busy ? 'Transmitiendo jugada…' : match?.status !== 'active' ? resultText?.title || 'Partida terminada' : match?.yourTurn ? 'Tu turno' : `${opponent?.username || 'Rival'} juega`;
  const liveClock = useMemo(() => projectPvpClock(match?.clock, clockElapsedMs), [clockElapsedMs, match?.clock]);
  const yourClockMs = match?.youAre === 'b' ? liveClock.blackMs : liveClock.whiteMs;
  const rivalClockMs = opponent?.color === 'w' ? liveClock.whiteMs : liveClock.blackMs;

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
    if (!match?.id || match.status !== 'active') return undefined;
    let active = true;
    let timer = null;
    let controller = new AbortController();
    const poll = async () => {
      if (!active) return;
      if (document.visibilityState === 'hidden') {
        timer = window.setTimeout(poll, 1500);
        return;
      }
      controller.abort();
      controller = new AbortController();
      try {
        const response = await pvpApi.getMatch(match.id, { signal: controller.signal });
        if (!active) return;
        setMatch((current) => mergeNewerMatch(current, response?.match));
        setError('');
        timer = window.setTimeout(poll, Math.max(900, Number(response?.pollAfterMs || 1250)));
      } catch (err) {
        if (!active || err?.name === 'AbortError') return;
        setError(err?.message || 'No se pudo sincronizar la partida.');
        timer = window.setTimeout(poll, 2500);
      }
    };
    timer = window.setTimeout(poll, 450);
    return () => {
      active = false;
      controller.abort();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [match?.id, match?.status]);

  const submitMove = useCallback(async (from, to, promotion = null) => {
    if (!match?.id || !match.yourTurn || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await pvpApi.playMove(match.id, from, to, promotion);
      if (response?.match) setMatch((current) => mergeNewerMatch(current, response.match));
    } catch (err) {
      setError(err?.message || 'La jugada no llegó al árbitro.');
      try {
        const response = await pvpApi.getMatch(match.id);
        if (response?.match) setMatch((current) => mergeNewerMatch(current, response.match));
      } catch {
        // El siguiente polling vuelve a reconciliar sin pisar una revisión nueva.
      }
    } finally {
      setBusy(false);
    }
  }, [busy, match?.id, match?.yourTurn]);

  const onSquareClick = useCallback((square) => {
    if (!match?.yourTurn || match.status !== 'active' || busy) return;
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
  }, [busy, match?.fen, match?.status, match?.youAre, match?.yourTurn, moves, selected, submitMove]);

  function choosePromotion(piece) {
    const pending = pendingPromotion;
    setPendingPromotion(null);
    if (pending) void submitMove(pending.from, pending.to, piece);
  }

  async function confirmResign() {
    if (!match?.id || match.status !== 'active' || resigning) return;
    setResigning(true);
    setError('');
    try {
      const response = await pvpApi.resignMatch(match.id);
      if (response?.match) setMatch((current) => mergeNewerMatch(current, response.match));
      setShowResignConfirm(false);
    } catch (err) {
      setError(err?.message || 'No se pudo registrar la rendición.');
    } finally {
      setResigning(false);
    }
  }

  if (!match || !opponent) return null;

  return (
    <section className="game-screen pvp-war-room" aria-label="War Room 1 contra 1">
      <div className="pvp-war-room__topbar">
        <button type="button" className="secondary-btn" onClick={onExit}>← Lobby</button>
        <span>WAR ROOM · 1 VS 1</span>
        <small>{match.youAre === 'w' ? 'Blancas' : 'Negras'} · {match.youAre === 'w' ? match.whiteRating : match.blackRating} rating</small>
      </div>

      <div className="game-layout game-layout-3d pvp-war-room__layout">
        <div className="board-column">
          <div className="board-live-row is-3d-warroom">
            <div className="game-board-stack game-board-stack-3d">
              <div className="game-board-3d-stage pvp-war-room__stage">
                <Suspense fallback={<div className="pvp-war-room__loading">Abriendo la sala…</div>}>
                  <Board3D
                    gameId={`pvp-${match.id}`}
                    fen={match.fen}
                    onSquareClick={onSquareClick}
                    selectedSquare={selected}
                    legalTargets={legalTargets}
                    lastMove={lastMove}
                    animate={pendingAnim}
                    hintMove={null}
                    checkSquare={checkSquare}
                    gameOver={match.status !== 'active'}
                    turnState={busy ? 'thinking' : match.yourTurn ? 'human' : 'cpu'}
                    orientation={orientation}
                    showCoordinates={showCoordinates}
                    matthiasKingColor={null}
                    hansFireplaceIteration={false}
                    hansFireCallEnabled={false}
                  />
                </Suspense>

                <aside className={`pvp-war-room__duel-pill is-${tone}`} aria-label="Estado del duelo">
                  <span className="pvp-war-room__opponent-mark" aria-hidden="true">♟</span>
                  <span className="pvp-war-room__identity"><strong>{opponent.username}</strong><small>{opponent.rating} rating</small></span>
                  <span className="pvp-war-room__divider" aria-hidden="true" />
                  <span className="pvp-war-room__light" aria-hidden="true" />
                  <strong role="status" aria-live="polite">{turnLabel}</strong>
                  {match.clock && (
                    <span className="pvp-war-room__clocks" aria-label="Reloj 1 contra 1">
                      <span className={`pvp-war-room__clock${liveClock.runningColor === match.youAre ? ' is-active' : ''}${yourClockMs <= 10000 ? ' is-low' : ''}`}>
                        <small>TÚ</small><b>{formatClock(yourClockMs / 1000)}</b>
                      </span>
                      <span className={`pvp-war-room__clock${liveClock.runningColor === opponent.color ? ' is-active' : ''}${rivalClockMs <= 10000 ? ' is-low' : ''}`}>
                        <small>{opponent.username}</small><b>{formatClock(rivalClockMs / 1000)}</b>
                      </span>
                    </span>
                  )}
                  <WarRoomUtilityMenu
                    game={match}
                    board={null}
                    controls={{ onAbandon: match.status === 'active' ? () => setShowResignConfirm(true) : undefined }}
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
                    <p className="pvp-war-room__result-facts">
                      Contra <b>{opponent.username}</b> · {opponent.rating} rating · {endReasonLabel} · {(match.history || []).length} jugadas registradas
                    </p>
                    <button type="button" className="primary-btn" onClick={onExit}>Volver al lobby</button>
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
            <span className="eyebrow">1 VS 1 · War Room</span>
            <h3 id="pvp-resign-title">¿Abandonar la partida?</h3>
            <p>En un duelo humano esto cuenta como rendición y victoria del rival. El rating se liquidará en el servidor.</p>
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
