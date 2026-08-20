import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board from './Board.jsx';
import NotationPanel from './NotationPanel.jsx';
import PromotionModal from './PromotionModal.jsx';
import GameReportModal from './GameReportModal.jsx';
import VoiceToggle from './VoiceToggle.jsx';
import CpuPresence from './CpuPresence.jsx';
import { api } from '../api.js';
import { hintCost, capturePoints, streakBonus } from '../tournament.js';
import { playMoveSound, playCaptureSound, playSuccessSound, playNoteworthySound, playTimePressureSound } from '../sound.js';
import { announceCpuCapture, announceHumanCapture, announceCheck, announceCheckmate } from '../voiceCommentary.js';
import { formatLongMove } from '../notation.js';
import { toPGN, pgnResult, downloadPGN } from '../pgn.js';
import { formatClock } from '../clock.js';
import { noteworthyComment } from '../cpuCommentary.js';
import { recordNoteworthyAchievement } from '../achievements.js';
import { loadRivalry, recordRivalryIncident, recurrenceSuffix } from '../rivalry.js';
import { startMemoryComment, openingMemoryComment, resultMemoryComment } from '../cpuMemory.js';
import { seriesStatusText } from '../series.js';
import { preGamePrediction } from '../advancedCareer.js';

const STATUS_LABELS = {
  playing: '',
  check: 'Jaque',
  checkmate: 'Jaque mate',
  stalemate: 'Tablas por ahogado',
  draw: 'Tablas',
  repetition: 'Tablas por repetición',
};

const PIECE_NAMES_ES = { p: 'un peón', n: 'un caballo', b: 'un alfil', r: 'una torre', q: 'la dama' };

// Tiempo mínimo (ms) que se muestra "La CPU está pensando…" antes de aplicar
// su jugada, aunque el servidor responda antes. Sin esto, en dificultad baja
// la respuesta puede llegar tan rápido que la animación del jugador ni
// alcanza a verse antes de que se dispare la de la CPU encima.
const MIN_CPU_THINK_MS = 350;

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
  onRematch,
  memoryContext = {},
  onTrainPersonal,
}) {
  const humanColor = game.humanColor || 'w';
  const [selected, setSelected] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null); // { from, to }
  const [busy, setBusy] = useState(false);

  // Reloj: enteramente del lado del cliente (no vive en el backend — esta
  // app no necesita anti-trampas). null en cualquiera de los dos significa
  // "sin reloj para esta partida". `flagFallen` guarda el color a quien se
  // le acabó el tiempo, si pasó.
  const hasClock = !!timeControl?.initial;
  const [whiteTime, setWhiteTime] = useState(timeControl?.initial ?? null);
  const [blackTime, setBlackTime] = useState(timeControl?.initial ?? null);
  const [flagFallen, setFlagFallen] = useState(null); // 'w' | 'b' | null
  const tickRef = useRef(null);
  const [showReport, setShowReport] = useState(false);
  const [achievementToast, setAchievementToast] = useState(null);
  const [suddenLives, setSuddenLives] = useState(3);
  const [forcedOutcome, setForcedOutcome] = useState(null);
  const [controlPrompt, setControlPrompt] = useState(null);
  const controlResolveRef = useRef(null);
  const pressureMovesRef = useRef(0);
  const pressureIncidentsRef = useRef(0);
  const pressureAlertRef = useRef(false);

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
  const [cpuComment, setCpuComment] = useState(null);
  const [cpuCommentSeq, setCpuCommentSeq] = useState(0);
  const cpuCommentTimeout = useRef(null);
  const achievementToastTimeout = useRef(null);
  const reportedResultRef = useRef(false);
  const openingMemoryShownRef = useRef(false);
  const resultMemoryTimeout = useRef(null);
  const startMemoryTimeout = useRef(null);

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
    setBoardFen(game.fen);
    setLastMoveSquares(game.lastMove);
    setSelected(null);
    setPendingAnim(null);
    setTurnBanner(null);
    setCpuComment(null);
    setHint(null);
    setHintsUsedThisGame(0);
    setCaptureFeedback(null);
    captureStreakRef.current = 0;
    reportedResultRef.current = false;
    openingMemoryShownRef.current = false;
    if (resultMemoryTimeout.current) clearTimeout(resultMemoryTimeout.current);
    if (startMemoryTimeout.current) clearTimeout(startMemoryTimeout.current);
    setWhiteTime(timeControl?.initial ?? null);
    setBlackTime(timeControl?.initial ?? null);
    setFlagFallen(null);
    setSuddenLives(3);
    setForcedOutcome(null);
    setControlPrompt(null);
    pressureMovesRef.current = 0;
    pressureIncidentsRef.current = 0;
    pressureAlertRef.current = false;
  }, [game.id]);

  useEffect(() => {
    const text = startMemoryComment(loadRivalry(), { difficulty: game.difficulty, humanColor, ...memoryContext });
    if (!text) return undefined;
    startMemoryTimeout.current = setTimeout(() => showCpuComment({ text }), 700);
    return () => {
      if (startMemoryTimeout.current) clearTimeout(startMemoryTimeout.current);
    };
  }, [game.id]);

  // Reloj — tick: cada 200ms, le resta el tiempo transcurrido de verdad
  // (no un valor fijo, para no perder precisión por el propio intervalo) al
  // lado que le toca mover ahora mismo. Mientras `busy` es true (esperando
  // la respuesta de la CPU tras la jugada propia), el turno visual todavía
  // no cambió en `game.turn` — por eso se calcula "a quién le toca de
  // verdad" en vez de confiar directo en ese campo.
  useEffect(() => {
    if (!hasClock || game.isGameOver || flagFallen || forcedOutcome) return;
    tickRef.current = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      const elapsed = (now - tickRef.current) / 1000;
      tickRef.current = now;
      const tickingColor = busy ? (humanColor === 'w' ? 'b' : 'w') : game.turn;
      if (tickingColor === 'w') setWhiteTime((t) => Math.max(0, (t ?? 0) - elapsed));
      else setBlackTime((t) => Math.max(0, (t ?? 0) - elapsed));
    }, 200);
    return () => clearInterval(interval);
  }, [hasClock, game.id, game.isGameOver, flagFallen, forcedOutcome, busy, game.turn, humanColor]);

  // Reloj — bandera: en cuanto un lado llega a 0, se declara perdedor por
  // tiempo (simplificación consciente: no contempla la excepción de "el
  // rival no tiene material suficiente para dar mate" — un caso raro que,
  // por ahora, se resuelve igual como derrota por tiempo).
  useEffect(() => {
    if (!hasClock || flagFallen || game.isGameOver) return;
    if (whiteTime !== null && whiteTime <= 0) setFlagFallen('w');
    else if (blackTime !== null && blackTime <= 0) setFlagFallen('b');
  }, [whiteTime, blackTime, hasClock, flagFallen, game.isGameOver]);

  useEffect(() => {
    if (!hasClock || pressureAlertRef.current || game.isGameOver || flagFallen || forcedOutcome) return;
    const mine = humanColor === 'w' ? whiteTime : blackTime;
    if (mine !== null && mine <= 30) {
      pressureAlertRef.current = true;
      playTimePressureSound();
      setTurnBanner('30 segundos. Ahora cada clic viene con auditoría.');
    }
  }, [whiteTime, blackTime, hasClock, humanColor, game.isGameOver, flagFallen, forcedOutcome]);

  // Avisa el resultado por bandera caída, igual que el efecto de jaque mate
  // de más abajo — comparten `reportedResultRef` para no informar dos veces.
  useEffect(() => {
    if (!flagFallen || reportedResultRef.current) return;
    reportedResultRef.current = true;
    const outcome = flagFallen === humanColor ? 'loss' : 'win';
    if (outcome === 'win') playSuccessSound();
    onGameEnd?.(outcome, game, { hintsUsed: hintsUsedThisGame, endReason: 'flag', pressureMoves: pressureMovesRef.current, pressureIncidents: pressureIncidentsRef.current, suddenDeath: !!memoryContext.suddenDeath });
    if (!seriesState) {
      resultMemoryTimeout.current = setTimeout(() => {
        const text = resultMemoryComment(outcome, loadRivalry(), { moves: game.history?.length || 0 });
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
    onGameEnd?.(outcome, game, { hintsUsed: hintsUsedThisGame, endReason: game.status, pressureMoves: pressureMovesRef.current, pressureIncidents: pressureIncidentsRef.current, suddenDeath: !!memoryContext.suddenDeath });
    if (!seriesState) {
      resultMemoryTimeout.current = setTimeout(() => {
        const text = resultMemoryComment(outcome, loadRivalry(), { moves: game.history?.length || 0 });
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

  function showCpuComment(comment) {
    if (!comment?.text) return;
    setCpuComment(comment.text);
    setCpuCommentSeq((n) => n + 1);
    if (cpuCommentTimeout.current) clearTimeout(cpuCommentTimeout.current);
    cpuCommentTimeout.current = setTimeout(() => setCpuComment(null), 6500);
  }


  function showNoteworthy(comment, actor) {
    if (!comment) return;
    playNoteworthySound(comment.event, actor);
    const recurrenceCount = recordRivalryIncident(comment.event, actor);
    showCpuComment({ ...comment, text: `${comment.text}${recurrenceSuffix(comment.event, actor, recurrenceCount)}` });
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
    if (cpuCommentTimeout.current) clearTimeout(cpuCommentTimeout.current);
    if (achievementToastTimeout.current) clearTimeout(achievementToastTimeout.current);
    if (resultMemoryTimeout.current) clearTimeout(resultMemoryTimeout.current);
    if (startMemoryTimeout.current) clearTimeout(startMemoryTimeout.current);
    // Si el usuario abandona/cambia de vista mientras está abierto el control
    // táctico, no dejamos colgada la promesa que estaba pausando el flujo.
    if (controlResolveRef.current) {
      controlResolveRef.current();
      controlResolveRef.current = null;
    }
  }, []);

  // Instancia local de chess.js sólo para calcular jugadas legales y resaltarlas,
  // basada en lo que se ve ahora mismo en el tablero (no en el estado del servidor).
  const localChess = useMemo(() => {
    const c = new Chess();
    c.load(boardFen);
    return c;
  }, [boardFen]);

  const prediction = useMemo(() => preGamePrediction(loadRivalry(), { difficulty: game.difficulty, timeControlId: timeControl?.id || 'none' }), [game.id, game.difficulty, timeControl?.id]);

  const legalTargets = selected
    ? localChess.moves({ square: selected, verbose: true }).map((m) => ({ to: m.to, san: m.san }))
    : [];

  async function sendMove(from, to, promotion) {
    setHint(null);

    // 1) Aplicamos y animamos la jugada propia de inmediato, sin esperar al servidor.
    const beforeHumanFen = boardFen;
    const optimistic = new Chess();
    optimistic.load(beforeHumanFen);
    let humanMove;
    try {
      humanMove = optimistic.move({ from, to, promotion: promotion || 'q' });
    } catch (e) {
      humanMove = null;
    }
    if (!humanMove) {
      onError?.('Movimiento ilegal.');
      setSelected(null);
      return;
    }

    setBoardFen(optimistic.fen());
    setLastMoveSquares({ from, to });
    triggerAnim(from, to, !!humanMove.captured);
    setSelected(null);
    setTurnBanner(null);
    setBusy(true);

    const humanComment = noteworthyComment(beforeHumanFen, { from, to, promotion: promotion || 'q' }, 'human');
    let cpuNoteworthy = null;
    showNoteworthy(humanComment, 'human');

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
        if (!reportedResultRef.current) {
          reportedResultRef.current = true;
          onGameEnd?.('loss', forcedGame, { hintsUsed: hintsUsedThisGame, endReason: 'sudden-death', pressureMoves: pressureMovesRef.current, pressureIncidents: pressureIncidentsRef.current, suddenDeath: true });
        }
        showCpuComment({ text: 'Tres incidentes graves. Sudden Death terminado. El tablero aún tenía piezas; tu licencia competitiva, temporalmente no.' });
        return;
      }
    }

    if (memoryContext.threatCheck && isSeriousHumanIncident(humanComment)) {
      await new Promise((resolve) => {
        controlResolveRef.current = resolve;
        setControlPrompt('¿Qué amenaza tiene ahora el rival? No deshagas la jugada: mira el tablero y nombra mentalmente jaques, capturas y amenazas antes de continuar.');
      });
      controlResolveRef.current = null;
      setControlPrompt(null);
    }

    // Incremento tipo Fischer: se suma al terminar la jugada, antes de que
    // arranque a correr el reloj del rival.
    if (hasClock && timeControl.increment) {
      if (humanColor === 'w') setWhiteTime((t) => (t ?? 0) + timeControl.increment);
      else setBlackTime((t) => (t ?? 0) + timeControl.increment);
    }

    // Si capturamos algo y estamos en el torneo, sumamos puntos ya mismo
    // (no hace falta esperar al servidor: el valor sale del propio
    // movimiento que acabamos de calcular en local).
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
      announceHumanCapture(PIECE_NAMES_ES[humanMove.captured] || 'una pieza');
    }

    const minThink = new Promise((resolve) => setTimeout(resolve, MIN_CPU_THINK_MS));

    try {
      const [updated] = await Promise.all([api.playMove(game.id, from, to, promotion), minThink]);
      setGame(updated);

      if (updated.lastMove && updated.lastMove.by === 'cpu') {
        cpuNoteworthy = noteworthyComment(optimistic.fen(), updated.lastMove, 'cpu');
        showNoteworthy(cpuNoteworthy, 'cpu');
        // 2) Llegó la respuesta de la CPU: animamos su jugada por separado.
        setBoardFen(updated.fen);
        setLastMoveSquares({ from: updated.lastMove.from, to: updated.lastMove.to });
        triggerAnim(updated.lastMove.from, updated.lastMove.to, !!updated.lastMove.captured);
        if (hasClock && timeControl.increment) {
          const cpuColor = humanColor === 'w' ? 'b' : 'w';
          if (cpuColor === 'w') setWhiteTime((t) => (t ?? 0) + timeControl.increment);
          else setBlackTime((t) => (t ?? 0) + timeControl.increment);
        }
        if (onCapturePoints && updated.lastMove.captured) {
          // La CPU nos comió algo: se corta la racha.
          captureStreakRef.current = 0;
        }
        if (updated.lastMove.captured) {
          announceCpuCapture(PIECE_NAMES_ES[updated.lastMove.captured] || 'una pieza');
        }
        if (updated.status === 'checkmate') {
          announceCheckmate(updated.turn === humanColor); // el turno que quedó "atascado" es quien recibió el mate
        } else if (updated.status === 'check') {
          announceCheck();
        }
        const cpuMoveEntry = updated.history[updated.history.length - 1];
        announceCpuMove(cpuMoveEntry);
      } else {
        // La partida terminó con la jugada propia (jaque mate/ahogado): no hay respuesta de la CPU.
        setBoardFen(updated.fen);
        if (updated.status === 'checkmate') announceCheckmate(true); // el humano dio el mate
      }

      if (!openingMemoryShownRef.current && !humanComment && !cpuNoteworthy && !updated.isGameOver) {
        const memory = openingMemoryComment(updated.history, loadRivalry());
        if (memory) {
          openingMemoryShownRef.current = true;
          setTimeout(() => showCpuComment({ text: memory }), 550);
        }
      }
    } catch (e) {
      onError?.(e.message);
      // Revertimos al último estado confirmado por el servidor.
      setBoardFen(game.fen);
      setLastMoveSquares(game.lastMove);
    } finally {
      setBusy(false);
    }
  }

  function handleSquareClick(square) {
    if (busy || game.isGameOver || flagFallen || forcedOutcome || game.turn !== humanColor) return;

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
      if (piece && piece.color === humanColor) setSelected(square);
      else setSelected(null);
      return;
    }

    if (move.promotion) {
      setPendingPromotion({ from: selected, to: square });
      return;
    }

    sendMove(selected, square);
  }

  function choosePromotion(code) {
    const { from, to } = pendingPromotion;
    setPendingPromotion(null);
    sendMove(from, to, code);
  }

  const currentHintCost = hintMode === 'paid' ? hintCost(tournamentLevel, hintsUsedThisGame) : 0;
  const canAffordHint = hintMode === 'free' || (hintMode === 'paid' && points >= currentHintCost);
  const canHint = hintMode !== 'off' && !busy && !game.isGameOver && !flagFallen && game.turn === humanColor
    && !hintLoading && canAffordHint;

  async function handleHint() {
    if (!canHint) return;
    setHintLoading(true);
    try {
      const suggestion = await api.getHint(game.id);
      setHint(suggestion);
      setSelected(suggestion.from);
      if (hintMode === 'paid') {
        onSpendPoints?.(currentHintCost);
        setHintsUsedThisGame((n) => n + 1);
      }
    } catch (e) {
      onError?.(e.message);
    } finally {
      setHintLoading(false);
    }
  }

  async function handleUndo() {
    if (busy || flagFallen || game.history.length === 0) return;
    setBusy(true);
    setHint(null);
    setTurnBanner(null);
    setCpuComment(null);
    try {
      const updated = await api.undoMove(game.id);
      setGame(updated);
      setBoardFen(updated.fen);
      setLastMoveSquares(updated.lastMove);
      setSelected(null);
      setPendingAnim(null); // el deshacer salta directo, no se anima
    } catch (e) {
      onError?.(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAbandon() {
    await api.deleteGame(game.id).catch(() => {});
    onExit();
  }

  function handleDownloadPGN() {
    const result = flagFallen
      ? (flagFallen === 'w' ? '0-1' : '1-0')
      : pgnResult(game.status, game.turn, humanColor);
    const white = humanColor === 'w' ? 'Jugador' : `CPU (nivel ${game.difficulty})`;
    const black = humanColor === 'b' ? 'Jugador' : `CPU (nivel ${game.difficulty})`;
    const pgn = toPGN(game.history, { white, black, result });
    downloadPGN(pgn, `partida-${game.id.slice(0, 8)}.pgn`);
  }

  const statusLabel = STATUS_LABELS[game.status];
  const statusClass = game.status === 'checkmate' || game.status === 'stalemate' || game.status === 'draw' || game.status === 'repetition'
    ? 'danger'
    : game.status === 'check'
    ? 'success'
    : '';

  const finalOutcome = forcedOutcome || (flagFallen
    ? (flagFallen === humanColor ? 'loss' : 'win')
    : game.status === 'checkmate'
      ? (game.turn === humanColor ? 'loss' : 'win')
      : 'draw');

  let statusText;
  if (forcedOutcome) statusText = 'Sudden Death · tres vidas agotadas';
  else if (flagFallen) statusText = `Se acabó el tiempo (${flagFallen === 'w' ? 'blancas' : 'negras'})`;
  else if (busy) statusText = 'La CPU está pensando…';
  else if (turnBanner) statusText = turnBanner;
  else statusText = statusLabel || (game.turn === humanColor ? 'Tu turno' : 'Turno de la CPU');

  let hintButtonLabel = 'Pista';
  if (hintLoading) hintButtonLabel = 'Pensando…';
  else if (hintMode === 'paid') hintButtonLabel = `Pista (${currentHintCost} pts)`;

  const topColor = humanColor === 'w' ? 'b' : 'w'; // el rival siempre arriba
  const bottomColor = humanColor;
  const topTime = topColor === 'w' ? whiteTime : blackTime;
  const bottomTime = bottomColor === 'w' ? whiteTime : blackTime;
  const tickingColor = flagFallen || game.isGameOver || forcedOutcome ? null : busy ? (humanColor === 'w' ? 'b' : 'w') : game.turn;

  // Función normal, NO un componente: si fuera un componente definido acá
  // adentro (con mayúscula), React lo trataría como un tipo nuevo en cada
  // render y remontaría el DOM entero cada 200ms (cada tick del reloj).
  function renderClock(color, seconds) {
    if (!hasClock) return null;
    const isLow = seconds !== null && seconds <= 10;
    const isTicking = tickingColor === color;
    return (
      <div className={`clock-chip ${isTicking ? 'ticking' : ''} ${isLow ? 'low' : ''}`}>
        {formatClock(seconds ?? 0)}
      </div>
    );
  }

  return (
    <div>
      <div className="game-layout">
        <div className="board-column">
          <div className={`status-line ${statusClass} ${turnBanner && !busy ? 'pulse' : ''}`}>
            {statusText}
            <VoiceToggle />
          </div>
          <CpuPresence key={cpuCommentSeq} comment={cpuComment} pulse={!!cpuComment} rivalryRecord={loadRivalry().record} />
          {prediction && <div className="prediction-strip">{prediction.text}</div>}
          {memoryContext.suddenDeath && <div className="sudden-strip">Sudden Death · vidas: {'♥'.repeat(Math.max(0,suddenLives))}{'♡'.repeat(Math.max(0,3-suddenLives))}</div>}
          {controlPrompt && <div className="control-check-strip"><b>Control táctico</b><span>{controlPrompt}</span><button className="secondary-btn" onClick={()=>controlResolveRef.current?.()}>Ya lo he mirado · que siga</button></div>}
          {seriesState && <div className={`series-strip ${seriesState.winner ? 'finished' : ''}`}>{seriesStatusText(seriesState)}</div>}
          {runState?.active && <div className="series-strip">{runState.mode === 'boss' ? `Boss Run · fase ${runState.stage + 1}/6 · CPU ${runState.difficulty}` : runState.mode === 'cup' ? `Copa · ${runState.completedStages || 0}/8 · ${runState.points || 0} pts · CPU ${runState.difficulty}` : `Racha · ${runState.wins} victorias · CPU ${runState.difficulty}`}</div>}
          {activeContract && <div className="contract-strip"><b>Contrato:</b> {activeContract.label} · {activeContract.text}</div>}
          {achievementToast && (
            <div className={`achievement-toast ${achievementToast.kind === 'shame' ? 'shame' : 'glory'}`}>
              <b>{achievementToast.kind === 'shame' ? '☠ Trofeo de vergüenza' : '🏆 Logro desbloqueado'}</b>
              <span>{achievementToast.name}</span>
            </div>
          )}
          {renderClock(topColor, topTime)}
          <Board
            fen={boardFen}
            onSquareClick={handleSquareClick}
            selectedSquare={selected}
            legalTargets={legalTargets}
            lastMove={lastMoveSquares}
            animate={pendingAnim}
            hintMove={hint}
            orientation={humanColor === 'b' ? 'black' : 'white'}
          />
          {renderClock(bottomColor, bottomTime)}
          {hint && <p className="hint-caption">Pista: {formatLongMove(hint)}</p>}
          {captureFeedback && <p className="capture-feedback">{captureFeedback}</p>}
          {hintMode === 'paid' && (
            <p className="hint-caption hint-balance">Puntos disponibles: {points}</p>
          )}
          <div className="game-controls">
            {hintMode !== 'off' && (
              <button className="secondary-btn" disabled={!canHint} onClick={handleHint}>
                {hintButtonLabel}
              </button>
            )}
            {hintMode === 'free' && (
              <button className="secondary-btn" disabled={busy || game.history.length === 0} onClick={handleUndo}>
                Deshacer jugada
              </button>
            )}
            {game.history.length > 0 && (
              <button className="secondary-btn" onClick={handleDownloadPGN}>
                Descargar PGN
              </button>
            )}
            <button className="secondary-btn" onClick={handleAbandon}>Abandonar partida</button>
          </div>
        </div>
        <NotationPanel history={game.history} difficulty={game.difficulty} />
      </div>

      {(game.isGameOver || flagFallen || forcedOutcome) && (
        <div className="endgame-banner">
          <h2>{forcedOutcome ? 'Sudden Death' : flagFallen ? 'Se acabó el tiempo' : statusLabel}</h2>
          <p>
            {forcedOutcome ? 'Tres incidentes tácticos graves. Derrota del modo Sudden Death; no afecta al ELO.' : flagFallen
              ? (flagFallen === humanColor ? 'Perdiste por tiempo.' : '¡Ganaste por tiempo!')
              : game.status === 'checkmate'
              ? game.turn === humanColor ? 'Ganó la CPU.' : '¡Ganaste la partida!'
              : 'La partida terminó en tablas.'}
          </p>
          {seriesState && !seriesState.winner && onNextSeriesGame ? (
            <button className="primary-btn" onClick={onNextSeriesGame}>Siguiente partida de la serie</button>
          ) : runState?.active && onNextRunGame ? (
            <button className="primary-btn" onClick={onNextRunGame}>Siguiente desafío</button>
          ) : (
            <button className="primary-btn" onClick={handleAbandon}>Volver al menú</button>
          )}
          {onRematch && !seriesState && !runState?.active && (
            <button className="secondary-btn" style={{ marginTop: '0.6rem' }} onClick={() => onRematch({ difficulty: game.difficulty, humanColor, timeControl })}>
              Revancha inmediata
            </button>
          )}
          {onShareResult && (
            <button className="secondary-btn" style={{ marginTop: '0.6rem' }} onClick={() => onShareResult(finalOutcome)}>
              Compartir resultado
            </button>
          )}
          {onTrainPersonal && <button className="secondary-btn" style={{ marginTop: '0.6rem' }} onClick={onTrainPersonal}>Entrenar mis errores</button>}
          {game.history.length > 0 && (
            <button className="secondary-btn" style={{ marginTop: '0.6rem' }} onClick={() => setShowReport(true)}>
              Ver autopsia de la partida
            </button>
          )}
        </div>
      )}

      {pendingPromotion && <PromotionModal onChoose={choosePromotion} />}
      {showReport && (
        <GameReportModal
          history={game.history}
          humanColor={humanColor}
          onClose={() => setShowReport(false)}
          meta={{ gameId: game.id, date: new Date().toISOString(), outcome: finalOutcome, difficulty: game.difficulty, opening: null, timeControlId: timeControl?.id || 'none', pressureMoves: pressureMovesRef.current, pressureIncidents: pressureIncidentsRef.current, mode: memoryContext.suddenDeath ? 'sudden' : hintMode === 'paid' ? 'tournament' : hintMode === 'free' ? 'practice' : 'casual' }}
          onShareIncident={(moveReport, report) => onShareIncident?.(moveReport, report, finalOutcome)}
          onOpenCrimeScene={(moveReport, report) => onOpenCrimeScene?.(moveReport, report, { outcome: finalOutcome })}
        />
      )}
    </div>
  );
}
