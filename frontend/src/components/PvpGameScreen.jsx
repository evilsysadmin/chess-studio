import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PromotionModal from './PromotionModal.jsx';
import { pvpApi } from '../pvpApi.js';
import { checkedKingSquare } from '../boardState.js';
import { getBoardCoordinates, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';
import {
  chooseMoveTo,
  lastMoveFromHistory,
  mergeNewerMatch,
  opponentForMatch,
  playerResult,
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

export default function PvpGameScreen({ initialMatch, onExit }) {
  const [match, setMatch] = useState(initialMatch);
  const [selected, setSelected] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showCoordinates, setShowCoordinates] = useState(() => getBoardCoordinates());
  const [pendingAnim, setPendingAnim] = useState(null);
  const animSeqRef = useRef(0);
  const historyLengthRef = useRef(initialMatch?.history?.length || 0);
  useWarRoomSpatialAmbience({ enabled: true });

  const opponent = useMemo(() => opponentForMatch(match), [match]);
  const result = useMemo(() => playerResult(match), [match]);
  const resultText = resultCopy(result);
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
                </aside>

                {resultText && (
                  <aside className="pvp-war-room__result" role="status">
                    <small>DUELO CERRADO</small><strong>{resultText.title}</strong><span>{resultText.detail}</span>
                    <button type="button" className="primary-btn" onClick={onExit}>Volver al lobby</button>
                  </aside>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="pvp-war-room__error" role="alert">{error}</p>}
      {pendingPromotion && <PromotionModal onChoose={choosePromotion} />}
    </section>
  );
}
