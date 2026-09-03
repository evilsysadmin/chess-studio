import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import PromotionModal from './PromotionModal.jsx';
import GameBoardView from './GameBoardView.jsx';
import PostGameExperience from './PostGameExperience.jsx';
import { api } from '../api.js';
import { hintCost, capturePoints, streakBonus } from '../tournament.js';
import { playMoveSound, playCaptureSound, playSuccessSound, playNoteworthySound, playIllegalMoveSound } from '../sound.js';
import { speakCpuComment, stopCpuSpeech } from '../voiceCommentary.js';
import { formatLongMove } from '../notation.js';
import { flagOutcome } from '../clock.js';
import { noteworthyComment } from '../cpuCommentary.js';
import { recordNoteworthyAchievement } from '../achievements.js';
import { loadRivalry, recordRivalryIncident, recurrenceSuffix } from '../rivalry.js';
import { startMemoryComment, openingMemoryComment, resultMemoryComment, noteworthyMemoryFacts, noteworthyMemorySuffix } from '../cpuMemory.js';
import { loadSeriesHistory, seriesHistoryStats } from '../series.js';
import { preGamePrediction } from '../advancedCareer.js';
import { appendActiveGameChat, loadActiveGameChat } from '../gameChat.js';
import { immobilityReason, isKingSafetyIllegalAttempt } from '../moveAvailability.js';
import { loadZenMode, saveZenMode } from '../zenMode.js';
import { identifyOpening } from '../openings.js';
import { noteworthyPresentation } from '../spectatorReactions.js';
import { getToken } from '../auth.js';
import { createNarrativeCooldownGate, requestRemoteNarrativeDetached } from '../narrativeRemote.js';
import { useGameClock } from '../useGameClock.js';
import { getBoardCoordinates, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';
import { humanHasLostPiece } from '../gameOutcome.js';
import { checkedKingSquare } from '../boardState.js';
import { gameStatusView } from '../gameStatusView.js';
import { abortableDelay, isAbortError } from '../asyncControl.js';
import { chessFromFen, safeChessMove } from '../chessRules.js';
import { createGameMutationCoordinator } from '../gameMutationCoordinator.js';


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
  const rivalryRecord = useMemo(() => loadRivalry().record || {}, [game.id, game.status]);
  const [selected, setSelected] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null); // { from, to }
  const [busy, setBusy] = useState(false);
  const [showBoardCoordinates, setShowBoardCoordinates] = useState(() => getBoardCoordinates());
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
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

  const [notationOpen, setNotationOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 820);
  const [achievementToast, setAchievementToast] = useState(null);
  const [suddenLives, setSuddenLives] = useState(3);
  const [controlPrompt, setControlPrompt] = useState(null);
  const controlResolveRef = useRef(null);
  const mutationCoordinatorRef = useRef(null);
  if (!mutationCoordinatorRef.current) mutationCoordinatorRef.current = createGameMutationCoordinator();
  const mutationCoordinator = mutationCoordinatorRef.current;
  const hintSessionGenerationRef = useRef(0);
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
  const [matthiasSilentBeat, setMatthiasSilentBeat] = useState(false);
  const [gameChat, setGameChat] = useState(() => loadActiveGameChat(game.id));
  const remoteNarrativeGateRef = useRef(null);
  if (!remoteNarrativeGateRef.current) {
    remoteNarrativeGateRef.current = createNarrativeCooldownGate({ minPlyGap: 2, minIntervalMs: 2500 });
  }
  const audienceReactionTimeout = useRef(null);
  const matthiasSilentBeatTimeout = useRef(null);
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
    mutationCoordinator.invalidateSession('Game changed', { clearRetry: true });
    hintSessionGenerationRef.current += 1;
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
    mutationCoordinator.invalidateSession('Clock flag fell', { clearRetry: false });
    hintSessionGenerationRef.current += 1;
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
    if (matthiasSilentBeatTimeout.current) clearTimeout(matthiasSilentBeatTimeout.current);
    setMatthiasSilentBeat(false);
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
    // A deliberate Matthias silence is actually silent: the visual beat is the
    // reaction. Do not undermine it with the noteworthy sting.
    if (!zenModeRef.current && (presentation.cpu || presentation.audience)) playNoteworthySound(comment.event, actor);
    if (!zenModeRef.current && presentation.matthiasSilence) {
      setMatthiasSilentBeat(true);
      if (matthiasSilentBeatTimeout.current) clearTimeout(matthiasSilentBeatTimeout.current);
      matthiasSilentBeatTimeout.current = setTimeout(() => setMatthiasSilentBeat(false), 2600);
    }
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
    if (matthiasSilentBeatTimeout.current) clearTimeout(matthiasSilentBeatTimeout.current);
    if (achievementToastTimeout.current) clearTimeout(achievementToastTimeout.current);
    if (resultMemoryTimeout.current) clearTimeout(resultMemoryTimeout.current);
    if (startMemoryTimeout.current) clearTimeout(startMemoryTimeout.current);
    if (openingMemoryTimeout.current) clearTimeout(openingMemoryTimeout.current);
    stopCpuSpeech();
    mutationCoordinator.abortCurrent('Screen unmounted');
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
    // `busy` tarda un render en propagarse. El coordinador cierra la pequeña
    // ventana donde dos clics/eventos síncronos podían disparar mutaciones iguales.
    const operation = mutationCoordinator.begin('game-mutation');
    if (!operation) return;
    const { controller } = operation;

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
        mutationCoordinator.finish(operation);
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
      if (!mutationCoordinator.isCurrent(operation)) return;
    }

    const minThink = abortableDelay(MIN_CPU_THINK_MS, controller.signal);

    try {
      const operationId = mutationCoordinator.operationId('move', [game.id, from, to, promotion || 'q']);
      operation.operationId = operationId;
      const [updated] = await Promise.all([api.playMove(game.id, from, to, promotion, { signal: controller.signal, operationId }), minThink]);
      mutationCoordinator.confirm(operationId);
      if (!mutationCoordinator.isCurrent(operation)) return;

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
      const stillCurrent = mutationCoordinator.isCurrent(operation);
      if (stillCurrent && !isAbortError(e)) {
        onPersistenceState?.('error');
        onError?.(e.message);
        // Revertimos a la foto confirmada desde la que salió esta operación;
        // nunca a `game` si entretanto ya cambió de partida.
        setBoardFen(beforeHumanFen);
        setLastMoveSquares(game.lastMove);
      }
    } finally {
      if (mutationCoordinator.finish(operation)) setBusy(false);
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
    const session = hintSessionGenerationRef.current;
    const controller = new AbortController();
    const requestToken = { token: Symbol('hint'), controller, session };
    hintRequestRef.current = requestToken;
    setHintLoading(true);
    try {
      const suggestion = await api.getHint(game.id, { signal: controller.signal });
      if (hintRequestRef.current !== requestToken || hintSessionGenerationRef.current !== session) return;
      setHint(suggestion);
      setSelected(suggestion.from);
      if (hintMode === 'paid') {
        onSpendPoints?.(currentHintCost);
        setHintsUsedThisGame((n) => n + 1);
      }
    } catch (e) {
      if (hintRequestRef.current === requestToken && hintSessionGenerationRef.current === session && !isAbortError(e)) onError?.(e.message);
    } finally {
      if (hintRequestRef.current === requestToken) {
        hintRequestRef.current = null;
        setHintLoading(false);
      }
    }
  }

  async function handleUndo() {
    if (busy || flagFallen || game.history.length === 0 || mutationCoordinator.hasCurrent()) return;
    const operation = mutationCoordinator.begin('undo');
    if (!operation) return;
    const { controller } = operation;
    setBusy(true);
    onPersistenceState?.('saving');
    setHint(null);
    setTurnBanner(null);
    try {
      const operationId = mutationCoordinator.operationId('undo', [game.id, game.history.length]);
      operation.operationId = operationId;
      const updated = await api.undoMove(game.id, { signal: controller.signal, operationId });
      mutationCoordinator.confirm(operationId);
      if (!mutationCoordinator.isCurrent(operation)) return;
      setGame(updated);
      setBoardFen(updated.fen);
      setLastMoveSquares(updated.lastMove);
      setSelected(null);
      setPendingAnim(null); // el deshacer salta directo, no se anima
      onPersistenceState?.('saving');
    } catch (e) {
      if (mutationCoordinator.isCurrent(operation) && !isAbortError(e)) {
        onPersistenceState?.('error');
        onError?.(e.message);
      }
    } finally {
      if (mutationCoordinator.finish(operation)) setBusy(false);
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

  let hintButtonLabel = 'Pista';
  if (hintLoading) hintButtonLabel = 'Pensando…';
  else if (hintMode === 'paid') hintButtonLabel = `Pista (${currentHintCost} pts)`;

  const gameContextMessages = [
    !zenMode && prediction ? { id: 'game-prediction', by: 'system', event: 'PRONÓSTICO DE PARTIDA', text: prediction.text.replace(/^Pronóstico:\s*/i, '') } : null,
    activeContract ? { id: 'game-contract', by: 'system', event: 'RETO DE PARTIDA', text: `${activeContract.label} · ${activeContract.text} Es opcional: no cambia las reglas ni el rating.` } : null,
  ].filter(Boolean);

  const lastCpuComment = [...gameChat].reverse().find((message) => message?.by !== 'system' && message?.text)?.text || null;

  return (
    <div className="game-screen">
      <GameBoardView
        game={game}
        humanColor={humanColor}
        rivalryRecord={rivalryRecord}
        zenMode={zenMode}
        status={{ statusClass, statusText, turnBanner, busy, audienceReaction, matthiasSilentBeat }}
        context={{
          memoryContext,
          suddenLives,
          controlPrompt,
          onContinueControl: () => controlResolveRef.current?.(),
          seriesState,
          runState,
          achievementToast,
        }}
        clocks={{ hasClock, whiteTime, blackTime, tickingColor, flagFallen, forcedOutcome }}
        board={{
          visibleBoardFen,
          onSquareClick: handleSquareClick,
          selected,
          legalTargets,
          lastMoveSquares,
          pendingAnim,
          hint,
          kingInCheckSquare,
          boardTurnState,
          showBoardCoordinates,
          onCustomize,
          selectionNotice,
        }}
        controls={{
          hintMode,
          canHint,
          onHint: handleHint,
          hintButtonLabel,
          busy,
          onUndo: handleUndo,
          onToggleZen: () => setZenMode((current) => saveZenMode(!current)),
          onAbandon: () => setShowAbandonConfirm(true),
          captureFeedback,
          points,
        }}
        side={{
          notationOpen,
          onNotationOpenChange: setNotationOpen,
          gameChat,
          gameContextMessages,
        }}
      />

      <PostGameExperience
        game={game}
        humanColor={humanColor}
        statusLabel={statusLabel}
        finalOutcome={finalOutcome}
        flagFallen={flagFallen}
        flagFinalOutcome={flagFinalOutcome}
        forcedOutcome={forcedOutcome}
        resultSummary={resultSummary}
        lastCpuComment={lastCpuComment}
        seriesState={seriesState}
        runState={runState}
        onNextSeriesGame={onNextSeriesGame}
        onNextRunGame={onNextRunGame}
        onLeave={handleAbandon}
        onShareResult={onShareResult}
        onTrainPersonal={onTrainPersonal}
        onShareIncident={onShareIncident}
        onOpenCrimeScene={onOpenCrimeScene}
        postGameFeedbackEnabled={postGameFeedbackEnabled}
        reportMeta={{
          gameId: game.id,
          initialFen: game.initialFen || null,
          date: new Date().toISOString(),
          outcome: finalOutcome,
          difficulty: game.difficulty,
          opening: memoryContext.nemesisOpening || identifyOpening((game.history || []).map((m) => m.san).filter(Boolean)),
          timeControlId: timeControl?.id || 'none',
          pressureMoves: pressureMovesRef.current,
          pressureIncidents: pressureIncidentsRef.current,
          mode: memoryContext.suddenDeath ? 'sudden' : memoryContext.nemesis ? 'nemesis-training' : memoryContext.ghost ? 'ghost' : hintMode === 'paid' ? 'tournament' : hintMode === 'free' ? 'practice' : 'casual',
        }}
      />

      {pendingPromotion && <PromotionModal onChoose={choosePromotion} />}
      {showAbandonConfirm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAbandonConfirm(false); }}>
          <div className="army-card abandon-confirm-card" role="dialog" aria-modal="true" aria-labelledby="abandon-confirm-title">
            <span className="eyebrow">Antes de salir</span>
            <h3 id="abandon-confirm-title">¿Abandonar la partida?</h3>
            {!humanHasLostPiece(game) ? (
              <p>La partida se cancelará sin resultado porque todavía no has perdido ninguna pieza. <strong>Tu rating no cambiará.</strong></p>
            ) : abandonRatingPreview ? (
              <p>Se registrará como derrota. <strong>Rating estimado {abandonRatingPreview.delta >= 0 ? '+' : ''}{abandonRatingPreview.delta} · {abandonRatingPreview.before} → {abandonRatingPreview.after}.</strong></p>
            ) : (
              <p>Se registrará como derrota, pero esta modalidad no afecta a tu rating.</p>
            )}
            <div className="abandon-confirm-actions">
              <button type="button" className="secondary-btn" autoFocus onClick={() => setShowAbandonConfirm(false)}>Seguir jugando</button>
              <button type="button" className="danger-btn" onClick={handleAbandon}>{!humanHasLostPiece(game) ? 'Cancelar sin penalización' : 'Abandonar y asumir resultado'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
