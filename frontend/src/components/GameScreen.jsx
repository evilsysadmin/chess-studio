import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board from './Board.jsx';
import NotationPanel from './NotationPanel.jsx';
import PromotionModal from './PromotionModal.jsx';
import GameChat from './GameChat.jsx';
import MusicPlayer from './MusicPlayer.jsx';
import { api } from '../api.js';
import { hintCost, capturePoints, streakBonus } from '../tournament.js';
import { playMoveSound, playCaptureSound, playSuccessSound, playNoteworthySound, playIllegalMoveSound } from '../sound.js';
import { speakCpuComment, stopCpuSpeech } from '../voiceCommentary.js';
import { formatLongMove } from '../notation.js';
import { flagOutcome, formatClock } from '../clock.js';
import { noteworthyComment } from '../cpuCommentary.js';
import { recordNoteworthyAchievement } from '../achievements.js';
import { loadRivalry, recordRivalryIncident, recurrenceSuffix } from '../rivalry.js';
import { startMemoryComment, openingMemoryComment, resultMemoryComment, noteworthyMemoryFacts, noteworthyMemorySuffix } from '../cpuMemory.js';
import { loadSeriesHistory, seriesHistoryStats, seriesLiveMoment, seriesNextActionLabel, seriesStatusText } from '../series.js';
import { preGamePrediction } from '../advancedCareer.js';
import { appendActiveGameChat, loadActiveGameChat } from '../gameChat.js';
import { immobilityReason, isKingSafetyIllegalAttempt } from '../moveAvailability.js';
import { loadZenMode, saveZenMode, zenModeSummary } from '../zenMode.js';
import { identifyOpening } from '../openings.js';
import GlossaryTerm from './GlossaryTerm.jsx';
import { noteworthyPresentation } from '../spectatorReactions.js';
import { getToken, getUsername } from '../auth.js';
import { createNarrativeCooldownGate, requestRemoteNarrativeDetached } from '../narrativeRemote.js';
import { useGameClock } from '../useGameClock.js';
import { nextBestAction } from '../nextBestAction.js';
import { getBoardCoordinates, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';
import { humanMoveCount } from '../gameOutcome.js';
import { checkedKingSquare } from '../boardState.js';
import { registerCompletedGameForFeedback } from '../postGameFeedback.js';
import PostGameFeedbackPrompt from './PostGameFeedbackPrompt.jsx';
import { gameStatusView } from '../gameStatusView.js';
import { abortableDelay, isAbortError } from '../asyncControl.js';
import { chessFromFen, safeChessMove } from '../chessRules.js';
import { createOperationId, operationFingerprint } from '../operationId.js';
import { CPU_IDENTITY } from '../cpuIdentity.js';

const GameReportModal = React.lazy(() => import('./GameReportModal.jsx'));


const PIECE_NAMES_ES = { p: 'un peón', n: 'un caballo', b: 'un alfil', r: 'una torre', q: 'la dama' };

// Tiempo mínimo (ms) que se muestra "La CPU está pensando…" antes de aplicar
// su jugada, aunque el servidor responda antes. Sin esto, en dificultad baja
// la respuesta puede llegar tan rápido que la animación del jugador ni
// alcanza a verse antes de que se dispare la de la CPU encima.
const MIN_CPU_THINK_MS = 350;
// El control táctico es una pausa pedagógica, no un semáforo crítico. Si el
// usuario no pulsa el CTA (por ejemplo porque quedó fuera del viewport), la
// partida continúa sola y nunca aparenta haberse congelado.
const CONTROL_PROMPT_MAX_MS = 15000;

const HUMAN_SERIOUS_INCIDENTS = new Set(['MISSED_MATE','STALEMATE_BLUNDER','ALLOWED_MATE','QUEEN_EN_PRISE_TO_PAWN','QUEEN_SACRIFICE_OFFER','ROOK_SACRIFICE_OFFER']);
function isSeriousHumanIncident(comment) { return !!comment?.event?.type && HUMAN_SERIOUS_INCIDENTS.has(comment.event.type); }


/**
 * hintMode:
 *  - 'off'  → sin botón de pista (partida normal).
 *  - 'free' → pistas gratis e ilimitadas ("Partida de práctica" en el menú).
 *  - 'paid' → pistas pagadas con los puntos del torneo (requiere
 *             tournamentLevel, points y onSpendPoints).
 */
export default function GameScreen({
  game,
  setGame,
  onExit,
  onError,
  onGameEnd,
  resultSummary = null,
  abandonRatingPreview = null,
  hintMode = 'off',
  tournamentLevel = 1,
  points = 0,
  onSpendPoints,
  onCapturePoints,
  onOpenCrimeScene,
  onShareResult,
  onShareIncident,
  seriesState = null,
  onNextSeriesGame,
  timeControl = null, // { initial, increment } en segundos, o null/sin reloj
  activeContract = null,
  runState = null,
  onNextRunGame,
  memoryContext = {},
  onTrainPersonal,
  onChatUpdate,
  onPersistenceState,
  onCustomize,
  postGameFeedbackEnabled = true,
}) {
  const humanColor = game.humanColor || 'w';
  const [selected, setSelected] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null); // { from, to }
  const [busy, setBusy] = useState(false);
  const [showBoardCoordinates, setShowBoardCoordinates] = useState(() => getBoardCoordinates());
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [showPostGameFeedback, setShowPostGameFeedback] = useState(false);
  const feedbackRegisteredGameRef = useRef(null);
  const [zenMode, setZenMode] = useState(() => loadZenMode());
  const zenModeRef = useRef(zenMode);
  zenModeRef.current = zenMode;

  useEffect(() => {
    const refreshAccessibilityPreferences = () => setShowBoardCoordinates(getBoardCoordinates());
    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, refreshAccessibilityPreferences);
    return () => window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, refreshAccessibilityPreferences);
  }, []);

  const [forcedOutcome, setForcedOutcome] = useState(null);
  const { hasClock, whiteTime, blackTime, flagFallen, addIncrement, tickingColor } = useGameClock({
    game,
    timeControl,
    busy,
    humanColor,
    forcedOutcome,
    onPressure: () => setTurnBanner('30 segundos. Ahora cada clic viene con auditoría.'),
  });

  useEffect(() => {
    const finished = Boolean(game.isGameOver || flagFallen || forcedOutcome);
    if (!postGameFeedbackEnabled || !finished || !game.id || feedbackRegisteredGameRef.current === game.id) return;
    // No interrumpimos una serie entre partidas ni una run activa: la pregunta
    // sólo compite por atención cuando la partida ya ha terminado de verdad.
    if ((seriesState && !seriesState.winner) || runState?.active) return;
    feedbackRegisteredGameRef.current = game.id;
    if (registerCompletedGameForFeedback({ gameId: game.id })) setShowPostGameFeedback(true);
  }, [game.id, game.isGameOver, flagFallen, forcedOutcome, seriesState?.winner, runState?.active, postGameFeedbackEnabled]);

  const [showReport, setShowReport] = useState(false);
  const [notationOpen, setNotationOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 820);
  const [achievementToast, setAchievementToast] = useState(null);
  const [suddenLives, setSuddenLives] = useState(3);
  const [controlPrompt, setControlPrompt] = useState(null);
  const controlResolveRef = useRef(null);
  const sessionGenerationRef = useRef(0);
  const mutationRef = useRef(null); // { token, controller, session } · move/undo excluyentes
  const mutationRetryRef = useRef(null); // conserva Idempotency-Key tras timeout para que reintentar no duplique la mutación

  function mutationOperationId(kind, parts) {
    const fingerprint = operationFingerprint([kind, ...parts]);
    const retry = mutationRetryRef.current;
    if (retry && retry.fingerprint === fingerprint && (Date.now() - retry.failedAt) < 5 * 60_000) return retry.operationId;
    const operationId = createOperationId(kind);
    mutationRetryRef.current = { fingerprint, operationId, failedAt: Date.now() };
    return operationId;
  }

  function confirmMutation(operationId) {
    if (operationId && mutationRetryRef.current?.operationId === operationId) mutationRetryRef.current = null;
  }
  const hintRequestRef = useRef(null);
  const pressureMovesRef = useRef(0);
  const pressureIncidentsRef = useRef(0);
  const illegalKingSafetyCommentShownRef = useRef(false);
  const lastValidBoardFenRef = useRef(chessFromFen(game.fen) ? game.fen : new Chess().fen());

  // Estado visual del tablero: se actualiza en dos pasos (jugada propia,
  // después jugada de la CPU) para poder animar cada una por separado, en
  // vez de saltar directo al estado final que devuelve el servidor.
  const [boardFen, setBoardFen] = useState(game.fen);
  const [lastMoveSquares, setLastMoveSquares] = useState(game.lastMove);
  const [pendingAnim, setPendingAnim] = useState(null); // { from, to, seq }
  const animSeqRef = useRef(0);

  // Aviso de "la CPU ya jugó, te toca a ti".
  const [turnBanner, setTurnBanner] = useState(null);
  const turnBannerTimeout = useRef(null);
  const [audienceReaction, setAudienceReaction] = useState(null);
  const [gameChat, setGameChat] = useState(() => loadActiveGameChat(game.id));
  const remoteNarrativeGateRef = useRef(null);
  if (!remoteNarrativeGateRef.current) {
    remoteNarrativeGateRef.current = createNarrativeCooldownGate({ minPlyGap: 2, minIntervalMs: 2500 });
  }
  const audienceReactionTimeout = useRef(null);
  const achievementToastTimeout = useRef(null);
  const reportedResultRef = useRef(false);
  const openingMemoryShownRef = useRef(false);
  const resultMemoryTimeout = useRef(null);
  const startMemoryTimeout = useRef(null);
  const openingMemoryTimeout = useRef(null);

  // Pista: sugerencia del motor para la jugada del humano.
  const [hint, setHint] = useState(null); // { from, to, san }
  const [hintLoading, setHintLoading] = useState(false);
  const [hintsUsedThisGame, setHintsUsedThisGame] = useState(0);

  // Aviso breve de puntos ganados al capturar una pieza (solo modo torneo).
  const [captureFeedback, setCaptureFeedback] = useState(null);
  const captureFeedbackTimeout = useRef(null);
  // Racha de capturas propias sin que la CPU te haya comido nada en el medio.
  const captureStreakRef = useRef(0);

  // Si cambia la partida (nueva / continuar), resincronizamos el estado visual.
  useEffect(() => {
    // Nueva partida = nueva generación async. Cualquier respuesta, prompt o
    // request de la partida anterior deja de tener permiso para tocar estado.
    sessionGenerationRef.current += 1;
    mutationRef.current?.controller?.abort(new DOMException('Game changed', 'AbortError'));
    mutationRef.current = null;
    mutationRetryRef.current = null;
    hintRequestRef.current?.controller?.abort(new DOMException('Game changed', 'AbortError'));
    hintRequestRef.current = null;
    if (controlResolveRef.current) {
      controlResolveRef.current();
      controlResolveRef.current = null;
    }
    setBusy(false);
    setHintLoading(false);
    setBoardFen(game.fen);
    setLastMoveSquares(game.lastMove);
    setSelected(null);
    setPendingAnim(null);
    setTurnBanner(null);
    setAudienceReaction(null);
    setGameChat(loadActiveGameChat(game.id));
    setHint(null);
    setHintsUsedThisGame(0);
    setCaptureFeedback(null);
    captureStreakRef.current = 0;
    reportedResultRef.current = false;
    openingMemoryShownRef.current = false;
    if (resultMemoryTimeout.current) clearTimeout(resultMemoryTimeout.current);
    if (startMemoryTimeout.current) clearTimeout(startMemoryTimeout.current);
    if (openingMemoryTimeout.current) clearTimeout(openingMemoryTimeout.current);
    setSuddenLives(3);
    setForcedOutcome(null);
    setControlPrompt(null);
    pressureMovesRef.current = 0;
    pressureIncidentsRef.current = 0;
    illegalKingSafetyCommentShownRef.current = false;
  }, [game.id]);

  useEffect(() => {
    if (!zenMode) return;
    stopCpuSpeech();
  }, [zenMode]);

  useEffect(() => {
    const historicalSeries = seriesState ? loadSeriesHistory() : [];
    const text = startMemoryComment(loadRivalry(), {
      difficulty: game.difficulty,
      humanColor,
      series: seriesState,
      seriesHistory: historicalSeries,
      seriesHistoryStats: seriesState ? seriesHistoryStats(historicalSeries) : null,
      ...memoryContext,
    });
    if (!text) return undefined;
    startMemoryTimeout.current = setTimeout(() => showCpuComment({ text }), 700);
    return () => {
      if (startMemoryTimeout.current) clearTimeout(startMemoryTimeout.current);
    };
  }, [game.id]);

  // La bandera es terminal para la UI. Si cae mientras una jugada/hint está
  // en vuelo, esa respuesta ya no tiene permiso para conceder incrementos,
  // puntos ni sobrescribir el tablero después del resultado por tiempo.
  useEffect(() => {
    if (!flagFallen) return;
    sessionGenerationRef.current += 1;
    mutationRef.current?.controller?.abort(new DOMException('Clock flag fell', 'AbortError'));
    mutationRef.current = null;
    hintRequestRef.current?.controller?.abort(new DOMException('Clock flag fell', 'AbortError'));
    hintRequestRef.current = null;
    if (controlResolveRef.current) {
      controlResolveRef.current();
      controlResolveRef.current = null;
    }
    setBusy(false);
    setHintLoading(false);
    setControlPrompt(null);
  }, [flagFallen]);

  // Avisa el resultado por bandera caída, igual que el efecto de jaque mate
  // de más abajo — comparten `reportedResultRef` para no informar dos veces.
  useEffect(() => {
    if (!flagFallen || reportedResultRef.current) return;
    reportedResultRef.current = true;
    const outcome = flagOutcome(flagFallen, humanColor, game.insufficientMatingMaterial);
    if (outcome === 'win') playSuccessSound();
    onGameEnd?.(outcome, game, { hintsUsed: hintsUsedThisGame, endReason: outcome === 'draw' ? 'flag-insufficient-material' : 'flag', pressureMoves: pressureMovesRef.current, pressureIncidents: pressureIncidentsRef.current, suddenDeath: !!memoryContext.suddenDeath, gameChat: loadActiveGameChat(game.id) });
    if (!seriesState) {
      resultMemoryTimeout.current = setTimeout(() => {
        const text = resultMemoryComment(outcome, loadRivalry(), { moves: game.history?.length || 0, difficulty: game.difficulty, opening: identifyOpening((game.history || []).map((move) => move?.san).filter(Boolean)) });
        if (text) showCpuComment({ text });
      }, 1100);
    }
  }, [flagFallen, humanColor, onGameEnd]);

  // Avisa una sola vez, cuando la partida termina, quién ganó — lo usa el
  // torneo para sumar puntos, y también las partidas normales para
  // actualizar el rating tipo ELO ("cómo te ve la CPU").
  useEffect(() => {
    if (!game.isGameOver || reportedResultRef.current) return;
    reportedResultRef.current = true;
    let outcome;
    if (game.status === 'checkmate') outcome = game.turn === humanColor ? 'loss' : 'win';
    else outcome = 'draw';
    if (outcome === 'win') playSuccessSound();
    onGameEnd?.(outcome, game, { hintsUsed: hintsUsedThisGame, endReason: game.status, pressureMoves: pressureMovesRef.current, pressureIncidents: pressureIncidentsRef.current, suddenDeath: !!memoryContext.suddenDeath, gameChat: loadActiveGameChat(game.id) });
    if (!seriesState) {
      resultMemoryTimeout.current = setTimeout(() => {
        const text = resultMemoryComment(outcome, loadRivalry(), { moves: game.history?.length || 0, difficulty: game.difficulty, opening: identifyOpening((game.history || []).map((move) => move?.san).filter(Boolean)) });
        if (text) showCpuComment({ text });
      }, 1100);
    }
  }, [game.isGameOver, game.status, game.turn, humanColor, onGameEnd]);

  useEffect(() => {
    if (!(game.isGameOver || flagFallen) || !seriesState?.games?.length) return;
    const last = seriesState.games[seriesState.games.length - 1];
    if (last?.gameId && last.gameId !== game.id) return;
    if (resultMemoryTimeout.current) clearTimeout(resultMemoryTimeout.current);
    resultMemoryTimeout.current = setTimeout(() => {
      const text = resultMemoryComment(last?.outcome || 'draw', loadRivalry(), {
        moves: game.history?.length || 0,
        series: seriesState,
        difficulty: game.difficulty,
        opening: identifyOpening((game.history || []).map((move) => move?.san).filter(Boolean)),
      });
      if (text) showCpuComment({ text });
    }, 900);
    return () => {
      if (resultMemoryTimeout.current) clearTimeout(resultMemoryTimeout.current);
    };
  }, [seriesState?.games?.length, seriesState?.winner, game.id, game.isGameOver, flagFallen]);

  function triggerAnim(from, to, capture = false) {
    animSeqRef.current += 1;
    setPendingAnim({ from, to, capture, seq: animSeqRef.current });
    if (capture) playCaptureSound();
    else playMoveSound();
  }

  function showCpuComment(comment, meta = {}) {
    if (!comment?.text) return;
    const transcript = appendActiveGameChat(game.id, comment, {
      event: meta.event || comment.event?.type || null,
      actor: meta.actor || null,
      ply: Number.isFinite(meta.ply) ? meta.ply : game.history?.length ?? null,
    });
    setGameChat(transcript);
    onChatUpdate?.(game.id, transcript);
    // Zen no borra el expediente: conserva el comentario para el replay y la
    // memoria histórica, pero no lo enseña ni lo pronuncia durante la partida.
    if (zenModeRef.current) return;
    speakCpuComment(comment.text);
  }


  function showAudienceReaction(text) {
    if (!text || zenModeRef.current) return;
    setAudienceReaction(text);
    if (audienceReactionTimeout.current) clearTimeout(audienceReactionTimeout.current);
    audienceReactionTimeout.current = setTimeout(() => setAudienceReaction(null), 4200);
  }

  function showNoteworthy(comment, actor, { allowRemote = true, history = null } = {}) {
    if (!comment) return;
    const moveHistory = history || game.history || [];
    const ply = moveHistory.length;
    const presentation = noteworthyPresentation(comment.event, actor, ply);
    const rivalryBefore = loadRivalry();
    const recurrenceCount = recordRivalryIncident(comment.event, actor);
    const opening = identifyOpening(moveHistory.map((move) => move?.san).filter(Boolean));
    const memory = noteworthyMemoryFacts(rivalryBefore, comment.event, actor, {
      occurrenceNumber: recurrenceCount,
      opening,
      difficulty: game.difficulty,
      rematch: !!memoryContext.rematch,
    });
    if (!zenModeRef.current && (presentation.cpu || presentation.audience)) playNoteworthySound(comment.event, actor);
    if (presentation.cpu) {
      const localSuffix = `${recurrenceSuffix(comment.event, actor, recurrenceCount)}${noteworthyMemorySuffix(memory, comment.event, actor)}`;
      const meta = { actor, event: comment.event?.type, ply };
      const showLocal = () => showCpuComment({ ...comment, text: `${comment.text}${localSuffix}` }, meta);
      if (!allowRemote) {
        showLocal();
      } else {
        requestRemoteNarrativeDetached(
          {
            eventType: comment.event?.type || 'noteworthy_move',
            ply,
            facts: {
              ...comment.event,
              actor,
              ply,
              memory,
            },
          },
          {
            token: getToken(),
            cooldownGate: remoteNarrativeGateRef.current,
            // El remoto ya recibe memory dentro de HECHOS. No añadimos otra
            // coletilla local encima para evitar repetir la misma estadística.
            onText: (text) => showCpuComment({ ...comment, text }, meta),
            onUnavailable: showLocal,
          },
        );
      }
    }
    if (presentation.audience) showAudienceReaction(presentation.text);
    const [unlocked] = recordNoteworthyAchievement(comment.event, actor);
    if (!unlocked) return;
    setAchievementToast(unlocked);
    if (achievementToastTimeout.current) clearTimeout(achievementToastTimeout.current);
    achievementToastTimeout.current = setTimeout(() => setAchievementToast(null), 5200);
  }


  function announceCpuMove(move) {
    const text = formatLongMove(move);
    setTurnBanner(text ? `La CPU jugó ${text} · te toca a ti` : 'La CPU jugó · te toca a ti');
    if (turnBannerTimeout.current) clearTimeout(turnBannerTimeout.current);
    turnBannerTimeout.current = setTimeout(() => setTurnBanner(null), 2400);
  }

  useEffect(() => () => {
    if (turnBannerTimeout.current) clearTimeout(turnBannerTimeout.current);
    if (captureFeedbackTimeout.current) clearTimeout(captureFeedbackTimeout.current);
    if (audienceReactionTimeout.current) clearTimeout(audienceReactionTimeout.current);
    if (achievementToastTimeout.current) clearTimeout(achievementToastTimeout.current);
    if (resultMemoryTimeout.current) clearTimeout(resultMemoryTimeout.current);
    if (startMemoryTimeout.current) clearTimeout(startMemoryTimeout.current);
    if (openingMemoryTimeout.current) clearTimeout(openingMemoryTimeout.current);
    stopCpuSpeech();
    mutationRef.current?.controller?.abort(new DOMException('Screen unmounted', 'AbortError'));
    mutationRef.current = null;
    hintRequestRef.current?.controller?.abort(new DOMException('Screen unmounted', 'AbortError'));
    hintRequestRef.current = null;
    // Si el usuario abandona/cambia de vista mientras está abierto el control
    // táctico, no dejamos colgada la promesa que estaba pausando el flujo.
    if (controlResolveRef.current) {
      controlResolveRef.current();
      controlResolveRef.current = null;
    }
  }, []);

  // Instancia local de chess.js sólo para calcular jugadas legales y resaltarlas,
  // basada en lo que se ve ahora mismo en el tablero (no en el estado del servidor).
  const localChess = useMemo(() => chessFromFen(boardFen), [boardFen]);
  if (localChess) lastValidBoardFenRef.current = boardFen;
  const visibleBoardFen = localChess ? boardFen : lastValidBoardFenRef.current;

  useEffect(() => {
    if (localChess) return;
    onError?.('La posición recibida no es un FEN válido. Se conserva el último tablero válido y se bloquean movimientos para evitar corromper la partida.');
  }, [localChess, boardFen, onError]);

  const prediction = useMemo(() => preGamePrediction(loadRivalry(), { difficulty: game.difficulty, timeControlId: timeControl?.id || 'none' }), [game.id, game.difficulty, timeControl?.id]);

  const legalTargets = selected && localChess
    ? localChess.moves({ square: selected, verbose: true }).map((m) => ({ to: m.to, san: m.san }))
    : [];
  // La regla sigue siendo responsabilidad del motor; el tablero recibe sólo
  // la coordenada ya resuelta para representar el jaque de manera inequívoca.
  const kingInCheckSquare = useMemo(() => checkedKingSquare(boardFen), [boardFen]);
  const boardTurnState = !game.isGameOver && !flagFallen && !forcedOutcome
    ? ((busy || game.turn !== humanColor) ? 'cpu' : 'human')
    : null;
  const selectionNotice = selected && localChess && legalTargets.length === 0
    ? immobilityReason(localChess, selected, humanColor)
    : null;

  async function sendMove(from, to, promotion) {
    setHint(null);

    // 1) Aplicamos y animamos la jugada propia de inmediato, sin esperar al servidor.
    const beforeHumanFen = boardFen;
    const optimistic = chessFromFen(beforeHumanFen);
    if (!optimistic) {
      onError?.('La posición actual no se puede reconstruir. Recarga la partida antes de mover.');
      setSelected(null);
      return;
    }
    const humanMove = safeChessMove(optimistic, { from, to, promotion: promotion || 'q' });
    if (!humanMove) {
      onError?.('Movimiento ilegal.');
      setSelected(null);
      return;
    }
    // `busy` tarda un render en propagarse. Este ref cierra la pequeña ventana
    // donde dos clics/eventos síncronos podían disparar dos mutaciones iguales.
    if (mutationRef.current) return;
    const session = sessionGenerationRef.current;
    const controller = new AbortController();
    const operation = { token: Symbol('game-mutation'), controller, session };
    mutationRef.current = operation;

    setBoardFen(optimistic.fen());
    setLastMoveSquares({ from, to });
    triggerAnim(from, to, !!humanMove.captured);
    setSelected(null);
    setTurnBanner(null);
    setBusy(true);
    onPersistenceState?.('saving');

    const humanComment = noteworthyComment(beforeHumanFen, { from, to, promotion: promotion || 'q' }, 'human');
    let cpuNoteworthy = null;

    const humanClock = humanColor === 'w' ? whiteTime : blackTime;
    if (hasClock && Number(humanClock) <= 40) {
      pressureMovesRef.current += 1;
      if (isSeriousHumanIncident(humanComment)) pressureIncidentsRef.current += 1;
    }

    if (memoryContext.suddenDeath && isSeriousHumanIncident(humanComment)) {
      const nextLives = suddenLives - 1;
      setSuddenLives(nextLives);
      if (nextLives <= 0) {
        const forcedGame = { ...game, history: [...(game.history || []), humanMove], fen: optimistic.fen(), isGameOver: true, status: 'sudden-death' };
        setGame(forcedGame); setForcedOutcome('loss'); setBusy(false);
        if (mutationRef.current === operation) mutationRef.current = null;
        controller.abort(new DOMException('Game finished', 'AbortError'));
        showNoteworthy(humanComment, 'human', { allowRemote: false });
        if (!reportedResultRef.current) {
          reportedResultRef.current = true;
          onGameEnd?.('loss', forcedGame, { hintsUsed: hintsUsedThisGame, endReason: 'sudden-death', pressureMoves: pressureMovesRef.current, pressureIncidents: pressureIncidentsRef.current, suddenDeath: true, gameChat: loadActiveGameChat(game.id) });
        }
        showCpuComment({ text: 'Tres incidentes graves. Sudden Death terminado. El tablero aún tenía piezas; tu licencia competitiva, temporalmente no.' });
        return;
      }
    }

    if (memoryContext.threatCheck && isSeriousHumanIncident(humanComment)) {
      try {
        await Promise.race([
          new Promise((resolve) => {
            controlResolveRef.current = resolve;
            setControlPrompt('¿Qué amenaza tiene ahora el rival? No deshagas la jugada: mira el tablero y nombra mentalmente jaques, capturas y amenazas antes de continuar.');
          }),
          abortableDelay(CONTROL_PROMPT_MAX_MS, controller.signal),
        ]);
      } catch (error) {
        if (isAbortError(error)) return;
        throw error;
      } finally {
        controlResolveRef.current = null;
        setControlPrompt(null);
      }
      if (mutationRef.current !== operation || sessionGenerationRef.current !== session) return;
    }

    const minThink = abortableDelay(MIN_CPU_THINK_MS, controller.signal);

    try {
      const operationId = mutationOperationId('move', [game.id, from, to, promotion || 'q']);
      operation.operationId = operationId;
      const [updated] = await Promise.all([api.playMove(game.id, from, to, promotion, { signal: controller.signal, operationId }), minThink]);
      confirmMutation(operationId);
      if (mutationRef.current !== operation || sessionGenerationRef.current !== session) return;

      // Sólo una jugada confirmada por el backend puede conceder incremento o
      // puntos de torneo. Antes estos efectos se aplicaban al tablero optimista:
      // un 409/timeout podía regalar tiempo o puntuación aunque la jugada fuera
      // rechazada.
      addIncrement(humanColor);
      if (onCapturePoints && humanMove.captured) {
        captureStreakRef.current += 1;
        const streak = captureStreakRef.current;
        const base = capturePoints(humanMove.piece, humanMove.captured, tournamentLevel);
        const bonus = streakBonus(streak, tournamentLevel);
        const gained = base + bonus;
        if (gained > 0) {
          onCapturePoints(gained);
          const pieceName = PIECE_NAMES_ES[humanMove.captured] || 'una pieza';
          const streakText = streak >= 2 ? ` · racha x${streak} (+${bonus})` : '';
          setCaptureFeedback(`+${gained} puntos · capturaste ${pieceName}${streakText}`);
          if (captureFeedbackTimeout.current) clearTimeout(captureFeedbackTimeout.current);
          captureFeedbackTimeout.current = setTimeout(() => setCaptureFeedback(null), 2400);
        }
      }

      setGame(updated);
      // App marcará 'saved' cuando el snapshot local de esta respuesta también
      // quede escrito; aquí sólo sabemos que el backend ya confirmó la jugada.
      // La narrativa remota sólo recibe hechos de una jugada que el backend ya confirmó.
      // Sigue siendo fire-and-forget: no retrasa tablero, reloj ni persistencia.
      showNoteworthy(humanComment, 'human', { history: updated.history });

      if (updated.lastMove && updated.lastMove.by === 'cpu') {
        cpuNoteworthy = noteworthyComment(optimistic.fen(), updated.lastMove, 'cpu');
        showNoteworthy(cpuNoteworthy, 'cpu', { history: updated.history });
        // 2) Llegó la respuesta de la CPU: animamos su jugada por separado.
        setBoardFen(updated.fen);
        setLastMoveSquares({ from: updated.lastMove.from, to: updated.lastMove.to });
        triggerAnim(updated.lastMove.from, updated.lastMove.to, !!updated.lastMove.captured);
        addIncrement(humanColor === 'w' ? 'b' : 'w');
        if (onCapturePoints && updated.lastMove.captured) {
          // La CPU nos comió algo: se corta la racha.
          captureStreakRef.current = 0;
        }
        const cpuMoveEntry = updated.history[updated.history.length - 1];
        announceCpuMove(cpuMoveEntry);
      } else {
        // La partida terminó con la jugada propia (jaque mate/ahogado): no hay respuesta de la CPU.
        setBoardFen(updated.fen);
      }

      if (!openingMemoryShownRef.current && !humanComment && !cpuNoteworthy && !updated.isGameOver) {
        const memory = openingMemoryComment(updated.history, loadRivalry());
        if (memory) {
          openingMemoryShownRef.current = true;
          if (openingMemoryTimeout.current) clearTimeout(openingMemoryTimeout.current);
          openingMemoryTimeout.current = setTimeout(() => showCpuComment({ text: memory }), 550);
        }
      }
    } catch (e) {
      const stillCurrent = mutationRef.current === operation && sessionGenerationRef.current === session;
      if (stillCurrent && !isAbortError(e)) {
        onPersistenceState?.('error');
        onError?.(e.message);
        // Revertimos a la foto confirmada desde la que salió esta operación;
        // nunca a `game` si entretanto ya cambió de partida.
        setBoardFen(beforeHumanFen);
        setLastMoveSquares(game.lastMove);
      }
    } finally {
      if (mutationRef.current === operation) {
        mutationRef.current = null;
        setBusy(false);
      }
    }
  }

  function handleSquareClick(square) {
    if (!localChess || busy || game.isGameOver || flagFallen || forcedOutcome || game.turn !== humanColor) return;

    if (!selected) {
      const piece = localChess.get(square);
      if (piece && piece.color === humanColor) setSelected(square);
      return;
    }

    if (square === selected) {
      setSelected(null);
      return;
    }

    const move = localChess.moves({ square: selected, verbose: true }).find((m) => m.to === square);
    if (!move) {
      // Click en otra pieza propia: cambia la selección en vez de intentar mover.
      const piece = localChess.get(square);
      if (piece && piece.color === humanColor) {
        setSelected(square);
      } else {
        if (isKingSafetyIllegalAttempt(localChess, selected, square, humanColor)) {
          playIllegalMoveSound();
          if (!illegalKingSafetyCommentShownRef.current) {
            illegalKingSafetyCommentShownRef.current = true;
            showCpuComment({ text: 'A ver. Ese movimiento es ilegal: dejaría a su rey en jaque. Procure no obligarme a repetirlo.' }, { event: 'ILLEGAL_KING_SAFETY', actor: 'human' });
          }
        }
        setSelected(null);
      }
      return;
    }

    if (move.promotion) {
      setPendingPromotion({ from: selected, to: square });
      return;
    }

    sendMove(selected, square);
  }

  function choosePromotion(code) {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    setPendingPromotion(null);
    sendMove(from, to, code);
  }

  const currentHintCost = hintMode === 'paid' ? hintCost(tournamentLevel, hintsUsedThisGame) : 0;
  const canAffordHint = hintMode === 'free' || (hintMode === 'paid' && points >= currentHintCost);
  const canHint = hintMode !== 'off' && !busy && !game.isGameOver && !flagFallen && game.turn === humanColor
    && !hintLoading && canAffordHint;

  async function handleHint() {
    if (!canHint || hintRequestRef.current) return;
    const session = sessionGenerationRef.current;
    const controller = new AbortController();
    const requestToken = { token: Symbol('hint'), controller, session };
    hintRequestRef.current = requestToken;
    setHintLoading(true);
    try {
      const suggestion = await api.getHint(game.id, { signal: controller.signal });
      if (hintRequestRef.current !== requestToken || sessionGenerationRef.current !== session) return;
      setHint(suggestion);
      setSelected(suggestion.from);
      if (hintMode === 'paid') {
        onSpendPoints?.(currentHintCost);
        setHintsUsedThisGame((n) => n + 1);
      }
    } catch (e) {
      if (hintRequestRef.current === requestToken && sessionGenerationRef.current === session && !isAbortError(e)) onError?.(e.message);
    } finally {
      if (hintRequestRef.current === requestToken) {
        hintRequestRef.current = null;
        setHintLoading(false);
      }
    }
  }

  async function handleUndo() {
    if (busy || flagFallen || game.history.length === 0 || mutationRef.current) return;
    const session = sessionGenerationRef.current;
    const controller = new AbortController();
    const operation = { token: Symbol('undo'), controller, session };
    mutationRef.current = operation;
    setBusy(true);
    onPersistenceState?.('saving');
    setHint(null);
    setTurnBanner(null);
    setCpuComment(null);
    try {
      const operationId = mutationOperationId('undo', [game.id, game.history.length]);
      operation.operationId = operationId;
      const updated = await api.undoMove(game.id, { signal: controller.signal, operationId });
      confirmMutation(operationId);
      if (mutationRef.current !== operation || sessionGenerationRef.current !== session) return;
      setGame(updated);
      setBoardFen(updated.fen);
      setLastMoveSquares(updated.lastMove);
      setSelected(null);
      setPendingAnim(null); // el deshacer salta directo, no se anima
      onPersistenceState?.('saving');
    } catch (e) {
      if (mutationRef.current === operation && sessionGenerationRef.current === session && !isAbortError(e)) {
        onPersistenceState?.('error');
        onError?.(e.message);
      }
    } finally {
      if (mutationRef.current === operation) {
        mutationRef.current = null;
        setBusy(false);
      }
    }
  }

  function handleAbandon() {
    const gameId = game.id;
    // Salir de una pantalla nunca debe depender de la salud de red/backend.
    // La limpieza remota es best-effort; App ya limpia de forma síncrona el
    // snapshot local, reloj y navegación.
    onExit();
    void api.deleteGame(gameId).catch(() => {});
  }

  const flagFinalOutcome = flagFallen ? flagOutcome(flagFallen, humanColor, game.insufficientMatingMaterial) : null;
  const { statusLabel, statusClass, finalOutcome, statusText } = gameStatusView({
    status: game.status,
    turn: game.turn,
    humanColor,
    busy,
    zenMode,
    turnBanner,
    flagFallen,
    flagFinalOutcome,
    forcedOutcome,
  });
  const nextAction = nextBestAction({ outcome: finalOutcome, moveCount: game.history.length, hasReport: game.history.length > 0 });

  let hintButtonLabel = 'Pista';
  if (hintLoading) hintButtonLabel = 'Pensando…';
  else if (hintMode === 'paid') hintButtonLabel = `Pista (${currentHintCost} pts)`;

  const liveSeriesMoment = seriesState ? seriesLiveMoment(seriesState) : null;
  const gameContextMessages = [
    !zenMode && prediction ? { id: 'game-prediction', by: 'system', event: 'PRONÓSTICO DE PARTIDA', text: prediction.text.replace(/^Pronóstico:\s*/i, '') } : null,
    activeContract ? { id: 'game-contract', by: 'system', event: 'RETO DE PARTIDA', text: `${activeContract.label} · ${activeContract.text} Es opcional: no cambia las reglas ni el rating.` } : null,
  ].filter(Boolean);

  const lastCpuComment = [...gameChat].reverse().find((message) => message?.by !== 'system' && message?.text)?.text || null;

  const topColor = humanColor === 'w' ? 'b' : 'w'; // el rival siempre arriba
  const bottomColor = humanColor;
  const topTime = topColor === 'w' ? whiteTime : blackTime;
  const bottomTime = bottomColor === 'w' ? whiteTime : blackTime;

  // Función normal, NO un componente: si fuera un componente definido acá
  // adentro (con mayúscula), React lo trataría como un tipo nuevo en cada
  // render y remontaría el DOM entero cada 200ms (cada tick del reloj).
  function renderPlayerRail({ color, seconds, cpu = false }) {
    const isLow = seconds !== null && seconds <= 10;
    const isTicking = tickingColor === color;
    const active = game.turn === color && !game.isGameOver && !flagFallen && !forcedOutcome;
    return (
      <div className={`game-player-rail ${cpu ? 'is-cpu' : 'is-human'} ${active ? 'is-active' : ''}`} aria-label={`${cpu ? `${CPU_IDENTITY.name}, CPU` : 'Jugador'} ${active ? 'en turno' : 'esperando'}`}>
        <span className={`game-player-avatar${cpu ? ' has-portrait' : ''}`} aria-hidden="true">{cpu ? <img src={CPU_IDENTITY.avatar} alt="" /> : '♙'}</span>
        <span className="game-player-identity">
          <strong>{cpu ? CPU_IDENTITY.name : (getUsername() || 'Tú')}</strong>
          <small>{cpu ? `${CPU_IDENTITY.role} · nivel ${game.difficulty}` : `${color === 'w' ? 'Blancas' : 'Negras'}${active ? ' · Tu turno' : ''}`}</small>
        </span>
        {hasClock ? (
          <span className={`clock-chip ${isTicking ? 'ticking' : ''} ${isLow ? 'low' : ''}`}>{formatClock(seconds ?? 0)}</span>
        ) : (
          <span className="game-player-turn">{active ? 'EN TURNO' : 'ESPERANDO'}</span>
        )}
      </div>
    );
  }

  return (
    <div className="game-screen">
      <div className="game-layout">
        <div className="board-column">
          <div className={`status-line ${statusClass} ${!zenMode && turnBanner && !busy ? 'pulse' : ''}`} role="status" aria-label="Estado de la partida" aria-live="polite">
            {statusText}
          </div>
          {!zenMode && audienceReaction && <div className="audience-reaction"><span>Grada anónima</span><b>{audienceReaction}</b></div>}
          {memoryContext.suddenDeath && <div className="sudden-strip">Sudden Death · vidas: {'♥'.repeat(Math.max(0,suddenLives))}{'♡'.repeat(Math.max(0,3-suddenLives))}</div>}
          {controlPrompt && <div className="control-check-strip"><b>Control táctico</b><span>{controlPrompt}</span><button className="secondary-btn" onClick={()=>controlResolveRef.current?.()}>Ya lo he mirado · que siga</button></div>}
          {!zenMode && memoryContext.nemesis && <div className="series-strip nemesis-strip">Némesis · {memoryContext.nemesisLabel || 'posición de tu historial'} · entrenamiento sin afectar al rating</div>}
          {!zenMode && game.ghostStyle && <div className="series-strip ghost-strip">Modo Rival Fantasma · nivel {game.difficulty} · estilo derivado de tus partidas</div>}
          {!zenMode && seriesState && (
            <div className={`series-strip series-live-strip ${seriesState.winner ? 'finished' : ''}`}>
              <span>{seriesStatusText(seriesState)}</span>
              {liveSeriesMoment?.label && <strong>{liveSeriesMoment.label}</strong>}
            </div>
          )}
          {!zenMode && runState?.active && <div className="series-strip">{runState.mode === 'boss' ? `Boss Run · fase ${runState.stage + 1}/6 · CPU ${runState.difficulty}` : runState.mode === 'cup' ? `Copa · ${runState.completedStages || 0}/8 · ${runState.points || 0} pts · CPU ${runState.difficulty}` : `Racha · ${runState.wins} victorias · CPU ${runState.difficulty}`}</div>}
          {!zenMode && achievementToast && (
            <div className={`achievement-toast ${achievementToast.kind === 'shame' ? 'shame' : 'glory'}`}>
              <b>{achievementToast.kind === 'shame' ? '☠ Trofeo de vergüenza' : '🏆 Logro desbloqueado'}</b>
              <span>{achievementToast.name}</span>
            </div>
          )}
          <div className={`board-live-row ${zenMode ? 'zen-mode' : ''}`}>
            <div className="game-board-stack">
              {renderPlayerRail({ color: topColor, seconds: topTime, cpu: true })}
              <Board
                fen={visibleBoardFen}
                onSquareClick={handleSquareClick}
                selectedSquare={selected}
                legalTargets={zenMode ? [] : legalTargets}
                lastMove={zenMode ? null : lastMoveSquares}
                animate={pendingAnim}
                hintMove={zenMode ? null : hint}
                checkSquare={zenMode ? null : kingInCheckSquare}
                turnState={boardTurnState}
                orientation={humanColor === 'b' ? 'black' : 'white'}
                showCoordinates={!zenMode && showBoardCoordinates}
                onCustomize={onCustomize}
              />
              {!zenMode && selectionNotice && (
                <div className={`move-availability-note ${selectionNotice.kind}`} role="status" aria-live="polite">
                  <b>{selectionNotice.kind === 'pinned' ? <>Pieza <GlossaryTerm term="Clavada">clavada</GlossaryTerm></> : 'Sin jugadas legales'}</b>
                  <span>{selectionNotice.text}</span>
                </div>
              )}
              {renderPlayerRail({ color: bottomColor, seconds: bottomTime, cpu: false })}
              <div className="game-command-deck" aria-label="Mesa de controles de la partida">
                <div className="game-controls" aria-label="Controles principales de la partida">
                  <span className={`game-controls-status ${game.turn === humanColor && !game.isGameOver ? 'is-active' : ''}`}><i aria-hidden="true" />{statusText}</span>
                  <div className="game-controls-actions">
                    {!zenMode && hintMode !== 'off' && (
                      <button className="secondary-btn" disabled={!canHint} onClick={handleHint}>
                        {hintButtonLabel}
                      </button>
                    )}
                    {!zenMode && hintMode === 'free' && (
                      <button className="secondary-btn" disabled={busy || game.history.length === 0} onClick={handleUndo}>
                        Deshacer jugada
                      </button>
                    )}
                    <button
                      type="button"
                      className={`secondary-btn zen-mode-toggle ${zenMode ? 'active' : ''}`}
                      aria-pressed={zenMode}
                      title={zenModeSummary(zenMode)}
                      onClick={() => setZenMode((current) => saveZenMode(!current))}
                    >
                      {zenMode ? 'Zen · ON' : 'Zen · OFF'}
                    </button>
                    <button className="secondary-btn game-abandon-btn" onClick={() => setShowAbandonConfirm(true)}>Abandonar partida</button>
                  </div>
                </div>
              </div>
            </div>
            {!zenMode && <aside className="game-side-column" aria-label="Chat de partida">
              <div className="game-side-music" aria-label="Música de la partida">
                <MusicPlayer initiallyCollapsed />
              </div>
              <details className="game-notation-disclosure" open={notationOpen} onToggle={(event) => setNotationOpen(event.currentTarget.open)}>
                <summary>Cuaderno de jugadas · {game.history.length} movimientos</summary>
                <div className="game-notation-row">
                  <NotationPanel history={game.history} difficulty={game.difficulty} />
                </div>
              </details>
              <GameChat messages={gameChat} contextMessages={gameContextMessages} />
            </aside>}
          </div>
          {!zenMode && hint && <p className="hint-caption">Pista: {formatLongMove(hint)}</p>}
          {!zenMode && captureFeedback && <p className="capture-feedback">{captureFeedback}</p>}
          {!zenMode && hintMode === 'paid' && (
            <p className="hint-caption hint-balance">Puntos disponibles: {points}</p>
          )}
        </div>
      </div>

      {(game.isGameOver || flagFallen || forcedOutcome) && (
        <div className="modal-backdrop endgame-modal-backdrop" role="presentation">
          <section className={`endgame-banner endgame-dialog outcome-${finalOutcome}`} role="dialog" aria-modal="true" aria-labelledby="game-finished-title">
            <span className="endgame-modal-kicker">PARTIDA FINALIZADA</span>
          <span className="endgame-eyebrow">{nextAction.eyebrow}</span>
          <h2 id="game-finished-title">{forcedOutcome ? 'Sudden Death' : flagFallen ? (flagFinalOutcome === 'draw' ? 'Tablas por tiempo' : 'Se acabó el tiempo') : statusLabel}</h2>
          <p>
            {forcedOutcome ? 'Tres incidentes tácticos graves. Derrota del modo Sudden Death; no afecta al rating.' : flagFallen
              ? (flagFinalOutcome === 'draw' ? 'Cayó una bandera, pero el rival no tenía material suficiente para dar mate.' : flagFallen === humanColor ? 'Perdiste por tiempo.' : '¡Ganaste por tiempo!')
              : game.status === 'checkmate'
              ? game.turn === humanColor ? `Ganó ${CPU_IDENTITY.name}.` : '¡Ganaste la partida!'
              : 'La partida terminó en tablas.'}
          </p>
          {resultSummary && (
            <p className="endgame-rating-impact">
              <strong>{resultSummary.ratingApplied ? 'Impacto en rating' : 'Rating sin cambios'}</strong>
              <span>{resultSummary.detail}</span>
            </p>
          )}
          {lastCpuComment && (
            <blockquote className="endgame-cpu-verdict">
              <span>{CPU_IDENTITY.name}</span>
              <p>{lastCpuComment}</p>
            </blockquote>
          )}
          {seriesState && !seriesState.winner && liveSeriesMoment && (
            <div className={`series-endgame-moment ${liveSeriesMoment.kind}`}>
              <span>{liveSeriesMoment.label}</span>
              <strong>{liveSeriesMoment.headline}</strong>
              <small>{liveSeriesMoment.detail}</small>
            </div>
          )}
          {seriesState && !seriesState.winner && onNextSeriesGame ? (
            <button className="primary-btn" onClick={onNextSeriesGame}>{seriesNextActionLabel(seriesState)}</button>
          ) : runState?.active && onNextRunGame ? (
            <button className="primary-btn" onClick={onNextRunGame}>Siguiente desafío</button>
          ) : nextAction.id === 'review' ? (
            <button className="primary-btn" onClick={() => setShowReport(true)}>{nextAction.label}</button>
          ) : (
            <button className="primary-btn" onClick={handleAbandon}>{nextAction.label}</button>
          )}
          {!seriesState && !runState?.active && <p className="endgame-next-detail">{nextAction.detail}</p>}
          {(seriesState || runState?.active || nextAction.id === 'review') && <button className="secondary-btn" style={{ marginTop: '0.6rem' }} onClick={handleAbandon}>Volver al menú</button>}
          {onShareResult && (
            <button className="secondary-btn" style={{ marginTop: '0.6rem' }} onClick={() => onShareResult(finalOutcome)}>
              Compartir resultado
            </button>
          )}
          {onTrainPersonal && <button className="secondary-btn" style={{ marginTop: '0.6rem' }} onClick={onTrainPersonal}>Entrenar mis errores</button>}
          {game.history.length > 0 && nextAction.id !== 'review' && (
            <button className="secondary-btn" onClick={() => setShowReport(true)}>
              Resumen de la partida
            </button>
          )}
          {postGameFeedbackEnabled && showPostGameFeedback && (
            <PostGameFeedbackPrompt onDone={() => setShowPostGameFeedback(false)} />
          )}
          </section>
        </div>
      )}

      {pendingPromotion && <PromotionModal onChoose={choosePromotion} />}
      {showAbandonConfirm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAbandonConfirm(false); }}>
          <div className="army-card abandon-confirm-card" role="dialog" aria-modal="true" aria-labelledby="abandon-confirm-title">
            <span className="eyebrow">Antes de salir</span>
            <h3 id="abandon-confirm-title">¿Abandonar la partida?</h3>
            {humanMoveCount(game.history.length, humanColor) === 0 ? (
              <p>La partida se cancelará sin resultado. <strong>Tu rating no cambiará.</strong></p>
            ) : abandonRatingPreview ? (
              <p>Se registrará como derrota. <strong>Rating estimado {abandonRatingPreview.delta >= 0 ? '+' : ''}{abandonRatingPreview.delta} · {abandonRatingPreview.before} → {abandonRatingPreview.after}.</strong></p>
            ) : (
              <p>Se registrará como derrota, pero esta modalidad no afecta a tu rating.</p>
            )}
            <div className="abandon-confirm-actions">
              <button type="button" className="secondary-btn" autoFocus onClick={() => setShowAbandonConfirm(false)}>Seguir jugando</button>
              <button type="button" className="danger-btn" onClick={handleAbandon}>{humanMoveCount(game.history.length, humanColor) === 0 ? 'Cancelar partida' : 'Abandonar y asumir resultado'}</button>
            </div>
          </div>
        </div>
      )}
      {showReport && (
        <React.Suspense fallback={<div className="modal-backdrop"><div className="army-card game-autopsy" role="status">Preparando resumen…</div></div>}>
        <GameReportModal
          history={game.history}
          humanColor={humanColor}
          onClose={() => setShowReport(false)}
          meta={{ gameId: game.id, initialFen: game.initialFen || null, date: new Date().toISOString(), outcome: finalOutcome, difficulty: game.difficulty, opening: memoryContext.nemesisOpening || identifyOpening((game.history || []).map((m) => m.san).filter(Boolean)), timeControlId: timeControl?.id || 'none', pressureMoves: pressureMovesRef.current, pressureIncidents: pressureIncidentsRef.current, mode: memoryContext.suddenDeath ? 'sudden' : memoryContext.nemesis ? 'nemesis-training' : memoryContext.ghost ? 'ghost' : hintMode === 'paid' ? 'tournament' : hintMode === 'free' ? 'practice' : 'casual' }}
          onShareIncident={(moveReport, report) => onShareIncident?.(moveReport, report, finalOutcome)}
          onOpenCrimeScene={(moveReport, report) => onOpenCrimeScene?.(moveReport, report, { outcome: finalOutcome })}
        />
        </React.Suspense>
      )}
    </div>
  );
}
