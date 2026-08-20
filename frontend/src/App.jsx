import React, { useEffect, useMemo, useState } from 'react';
import Menu from './components/Menu.jsx';
import GameScreen from './components/GameScreen.jsx';
import Tutorial from './components/Tutorial.jsx';
import OpeningsScreen from './components/OpeningsScreen.jsx';
import TournamentScreen from './components/TournamentScreen.jsx';
import HistoryScreen from './components/HistoryScreen.jsx';
import ReplayScreen from './components/ReplayScreen.jsx';
import CombatReplayScreen from './components/CombatReplayScreen.jsx';
import SpectatorScreen from './components/SpectatorScreen.jsx';
const Board3DExperiment = React.lazy(() => import('./components/Board3DExperiment.jsx'));
import { loadCombatHistory, clearCombatHistory } from './combatHistory.js';
import PuzzleScreen from './components/PuzzleScreen.jsx';
import CombatScreen from './components/CombatScreen.jsx';
import RoguelikeScreen from './components/RoguelikeScreen.jsx';
import PlayerStatusBar from './components/PlayerStatusBar.jsx';
import RatingDetailModal from './components/RatingDetailModal.jsx';
import MusicPlayer from './components/MusicPlayer.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { startAmbientMusic, stopAmbientMusic } from './sound.js';
import { api, STORAGE_KEY } from './api.js';
import { loadTournament, saveTournament, resetTournament, applyResult, difficultyForLevel, levelForPoints } from './tournament.js';
import { loadGameHistory, saveGameRecord, clearGameHistory, updateGameRecordChat } from './gameHistory.js';
import { loadRoster as loadCombatRoster } from './combatRoster.js';
import { loadRating, saveRating, updateRating, recordRatingHistory, loadRatingHistory } from './playerRating.js';
import { handicapForGap } from './handicap.js';
import { computeInsights } from './insights.js';
import InsightsScreen from './components/InsightsScreen.jsx';
import { timeControlById } from './clock.js';
import { checkAchievements } from './achievements.js';
import { pullProfileFromServer, pushProfileToServer, scheduleProfileSync, cancelScheduledProfileSync } from './profileBackup.js';
import { isLoggedIn, fetchMe, logout, touchActivity, watchSessionIdentity } from './auth.js';
import { PROFILE_CHANGED_EVENT } from './profileKeys.js';
import AdminScreen from './components/AdminScreen.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import { loadRivalry, recordRivalryResult, reconcileRivalryHistory } from './rivalry.js';
import { identifyOpening } from './openings.js';
import { createSeries, loadActiveSeries, saveActiveSeries, clearActiveSeries, recordSeriesGame } from './series.js';
import ShareResultModal from './components/ShareResultModal.jsx';
import SharedResultScreen from './components/SharedResultScreen.jsx';
import { shareRecordFromHash } from './shareResult.js';
import CareerScreen from './components/CareerScreen.jsx';
import LabScreen from './components/LabScreen.jsx';
import { chooseContract, clearActiveContract, clearSpecialRun, loadActiveContract, loadSpecialRun, recordCareerGame, recordSpecialRunResult, reconcileCareerHistory, saveActiveContract, saveSpecialRun, startSpecialRun } from './career.js';
import { loadActiveGameChat } from './gameChat.js';

// Guarda si la partida activa es "Partida de práctica" (pistas gratis) por separado del propio
// objeto de partida: ese objeto se reemplaza por completo con cada respuesta
// del servidor (que no sabe nada de esta marca, es solo del cliente), así
// que si viviera ahí se perdería en la primera jugada.
const LEARNING_STORAGE_KEY = 'chess-study-active-game-learning';

// 'menu' | 'game' | 'tutorial' | 'openings' | 'tournament' | 'tournamentGame' | 'puzzle' | 'combat' | 'history' | 'replay'
function AppInner({ isAdminUser }) {
  const [view, setView] = useState('menu');
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSavedGame, setHasSavedGame] = useState(!!localStorage.getItem(STORAGE_KEY));
  const [learningMode, setLearningMode] = useState(() => localStorage.getItem(LEARNING_STORAGE_KEY) === '1');

  const [tournament, setTournament] = useState(() => loadTournament());
  const [tournamentGame, setTournamentGame] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [historyList, setHistoryList] = useState(() => loadGameHistory());
  const [combatHistoryList, setCombatHistoryList] = useState(() => loadCombatHistory());
  const [replayRecord, setReplayRecord] = useState(null);
  const [combatReplayRecord, setCombatReplayRecord] = useState(null);
  const [replayInitialStep, setReplayInitialStep] = useState(undefined);
  const [pinnedReport, setPinnedReport] = useState(null);
  const [replayCrimeMode, setReplayCrimeMode] = useState(false);

  // Desde "Así juegas" → "Ver esta jugada": abre el replay que corresponda
  // (normal o de combate, según de dónde vino) parado justo en esa jugada,
  // no en el final de la partida como el resto de los accesos al historial.
  function jumpToMove(record, kind, moveReport) {
    setReplayCrimeMode(false);
    setReplayInitialStep(moveReport.index + 1);
    setPinnedReport(moveReport);
    if (kind === 'combat') {
      setCombatReplayRecord(record);
      setView('combatReplay');
    } else {
      setReplayRecord(record);
      setView('replay');
    }
  }


  // Historial unificado: partidas normales/torneo/práctica (moves) y
  // batallas de combate (log) mezcladas y ordenadas por fecha — una sola
  // sección de "todas mis partidas", en vez de dos listas separadas.
  const allHistory = useMemo(
    () => [...historyList, ...combatHistoryList].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [historyList, combatHistoryList]
  );

  // "Así juegas": estadísticas agregadas, calculadas al instante con lo que
  // ya está guardado (sin volver a llamar al backend) — solo se recalcula
  // si cambia alguno de los historiales de origen.
  const insights = useMemo(
    () => computeInsights(historyList, combatHistoryList, loadRatingHistory()),
    [historyList, combatHistoryList]
  );

  // Cada registro sabe reproducirse solo en la pantalla correcta según su
  // propia forma: `log` = batalla de combate (FENs guardados directo),
  // `moves` = partida normal/torneo/práctica (SAN reproducible). El
  // historial no necesita saber esta distinción, solo abrir lo que le toque.
  function openHistoryRecord(record) {
    setReplayMovieMode(false);
    setReplayCrimeMode(false);
    setReplayInitialStep(undefined);
    setPinnedReport(null);
    if (record.log) {
      setCombatReplayRecord(record);
      setView('combatReplay');
    } else {
      setReplayRecord(record);
      setView('replay');
    }
  }

  function clearAllHistory() {
    setHistoryList(clearGameHistory());
    setCombatHistoryList(clearCombatHistory());
  }


  function openGameCrimeScene(finishedGame, moveReport, mode, outcomeOverride) {
    if (!finishedGame || !moveReport) return;
    const outcome = outcomeOverride || (
      finishedGame.status === 'checkmate'
        ? (finishedGame.turn === finishedGame.humanColor ? 'loss' : 'win')
        : 'draw'
    );
    const record = {
      id: `crime-${finishedGame.id}`,
      date: new Date().toISOString(),
      difficulty: finishedGame.difficulty,
      humanColor: finishedGame.humanColor,
      outcome,
      moves: finishedGame.history,
      finalFen: finishedGame.fen,
      initialFen: finishedGame.initialFen || null,
      mode,
      gameChat: loadActiveGameChat(finishedGame.id),
    };
    if (mode === 'casual' || mode === 'practice') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEARNING_STORAGE_KEY);
      setHasSavedGame(false);
      setGame(null);
      setLearningMode(false);
    } else if (mode === 'tournament') {
      setTournamentGame(null);
    }
    setReplayRecord(record);
    setPinnedReport(moveReport);
    // Antes del impacto: el botón de Cámara del crimen reproduce la jugada.
    setReplayInitialStep(Math.max(0, moveReport.index));
    setReplayCrimeMode(true);
    setView('replay');
  }

  // Estos dos viven en localStorage manejados por otras pantallas (el
  // Modo Combate tiene su propio roster, independiente) — los releemos acá
  // cada vez que cambia la vista, así la cabecera se mantiene al día sin
  // tener que levantar ese estado hasta acá arriba.
  const [rating, setRating] = useState(() => loadRating());
  const [combatXp, setCombatXp] = useState(() => loadCombatRoster().combatXp);
  const [activeTimeControl, setActiveTimeControl] = useState(null);
  const [activeSeries, setActiveSeries] = useState(() => loadActiveSeries());
  const [shareRecord, setShareRecord] = useState(null);
  const [puzzleLaunch, setPuzzleLaunch] = useState({ source: 'curated', rush: false });
  const [activeContract, setActiveContract] = useState(() => loadActiveContract());
  const [specialRun, setSpecialRun] = useState(() => loadSpecialRun());
  const [gameContext, setGameContext] = useState({});
  const [replayMovieMode, setReplayMovieMode] = useState(false);
  const [showRatingDetail, setShowRatingDetail] = useState(false);

  // Cualquier helper de progreso emite este evento al cambiar la caché.
  // Persistimos con debounce para no hacer un PUT por cada punto de XP, y
  // hacemos un flush adicional al ocultar la pestaña para reducir la ventana
  // de pérdida si el usuario cierra el navegador justo después de jugar.
  useEffect(() => {
    const handleProfileChanged = () => scheduleProfileSync();
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        pushProfileToServer({ keepalive: true });
      }
    };
    window.addEventListener(PROFILE_CHANGED_EVENT, handleProfileChanged);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener(PROFILE_CHANGED_EVENT, handleProfileChanged);
      document.removeEventListener('visibilitychange', handleVisibility);
      cancelScheduledProfileSync();
    };
  }, []);


  // V15.1: usuarios veteranos pueden tener decenas de partidas anteriores a
  // Centro de Operaciones. Reconciliamos los contadores demostrables desde
  // Historial una sola vez cuando éste cambia; las funciones sólo escriben si
  // detectan que el historial contiene más datos que el expediente nuevo.
  useEffect(() => {
    reconcileCareerHistory(historyList);
    reconcileRivalryHistory(historyList);
  }, [historyList]);

  useEffect(() => {
    if (game) localStorage.setItem(STORAGE_KEY, game.id);
  }, [game]);

  useEffect(() => {
    localStorage.setItem(LEARNING_STORAGE_KEY, learningMode ? '1' : '0');
  }, [learningMode]);

  useEffect(() => {
    setRating(loadRating());
    setCombatXp(loadCombatRoster().combatXp);
    setCombatHistoryList(loadCombatHistory());
    checkAchievements();
    // Subimos el perfil actual al backend en cada cambio de pantalla — de
    // fondo, sin bloquear ni avisar nada. Es la forma de que el progreso
    // sobreviva aunque limpies el navegador o pises la carpeta del proyecto
    // con una versión nueva: la copia de Mongo queda siempre razonablemente
    // al día.
    pushProfileToServer();
  }, [view]);

  async function handleNewGame(difficulty, color, opts) {
    setLoading(true);
    setError(null);
    try {
      const handicap = handicapForGap(rating.rating, difficulty);
      const created = await api.createGame(difficulty, color, handicap?.id ?? null);
      const isLearning = !!opts?.learning;
      setLearningMode(isLearning);
      setActiveTimeControl(timeControlById(opts?.timeControlId));
      setGameContext({ rematch: !!opts?.rematch, runMode: opts?.runMode || null, lab: !!opts?.lab, rescue: !!opts?.rescue, suddenDeath: !!opts?.suddenDeath, threatCheck: !!opts?.threatCheck });
      const shouldOfferContract = !isLearning && !opts?.runMode && !opts?.lab && !opts?.rescue && Number(opts?.seriesBestOf || 1) <= 1;
      const contract = shouldOfferContract ? chooseContract({ gameCount: historyList.length, incidents: loadRivalry().incidents }) : null;
      if (contract) saveActiveContract(contract); else clearActiveContract();
      setActiveContract(contract);

      if (!isLearning && Number(opts?.seriesBestOf) > 1) {
        const series = createSeries({
          bestOf: Number(opts.seriesBestOf),
          difficulty,
          firstColor: created.humanColor,
          timeControlId: opts?.timeControlId || 'none',
        });
        const withGame = { ...series, currentGameId: created.id };
        saveActiveSeries(withGame);
        setActiveSeries(withGame);
      } else {
        clearActiveSeries();
        setActiveSeries(null);
      }

      setGame(created);
      setHasSavedGame(true);
      setView('game');
    } catch (e) {
      setError(e?.requestId ? e.message : 'No se pudo conectar con el servidor. ¿Está corriendo el backend?');
    } finally {
      setLoading(false);
    }
  }

  async function handleContinue() {
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (!savedId) return;
    setLoading(true);
    setError(null);
    try {
      const found = await api.getGame(savedId);
      setGame(found);
      setLearningMode(localStorage.getItem(LEARNING_STORAGE_KEY) === '1');
      setActiveContract(loadActiveContract());
      const storedRun = loadSpecialRun();
      setSpecialRun(storedRun);
      setGameContext(storedRun?.active && storedRun.currentGameId === found.id ? { runMode: storedRun.mode } : {});
      const storedSeries = loadActiveSeries();
      if (storedSeries?.currentGameId === found.id && !storedSeries.winner) {
        setActiveSeries(storedSeries);
        setActiveTimeControl(timeControlById(storedSeries.timeControlId));
      } else {
        clearActiveSeries();
        setActiveSeries(null);
        // Una partida suelta continuada no conserva con rigor los segundos
        // restantes: preferimos quitar el reloj a inventarnos tiempo.
        setActiveTimeControl(null);
      }
      setView('game');
    } catch (e) {
      setError('No se encontró esa partida en el servidor (puede haberse reiniciado).');
      localStorage.removeItem(STORAGE_KEY);
      setHasSavedGame(false);
    } finally {
      setLoading(false);
    }
  }

  function handleExitGame() {
    if (gameContext.runMode && specialRun?.active) {
      const endedRun = recordSpecialRunResult(specialRun, 'loss');
      setSpecialRun(endedRun);
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEARNING_STORAGE_KEY);
    setHasSavedGame(false);
    setGame(null);
    setLearningMode(false);
    clearActiveContract();
    setActiveContract(null);
    setGameContext({});
    clearActiveSeries();
    setActiveSeries(null);
    setView('menu');
  }

  // Las partidas normales (menú "Nueva partida") también cuentan para el
  // rating tipo ELO — cualquier partida contra una CPU de dificultad
  // conocida, no hace falta que sea de torneo. "Partida de práctica" queda
  // afuera a propósito: ahí las pistas son gratis e ilimitadas, así que
  // ganar no dice mucho de tu nivel jugando sin ayuda.
  //
  // También se guardan en el historial (igual que las de torneo), para que
  // la "pista inversa" del Historial funcione acá también, no solo en
  // Torneo — con una etiqueta de modo para distinguirlas al navegar la lista.
  function handleCasualGameEnd(outcome, finishedGame, endMeta = {}) {
    if (!finishedGame) return;
    const moveSans = (finishedGame.history || []).map((m) => m.san).filter(Boolean);
    const opening = identifyOpening(moveSans);
    let seriesSnapshot = activeSeries;
    const trainingPosition = !!(gameContext.lab || gameContext.rescue || gameContext.suddenDeath);

    if (!learningMode && !trainingPosition) {
      if (activeSeries && !activeSeries.winner) {
        seriesSnapshot = recordSeriesGame(activeSeries, outcome, {
          gameId: finishedGame.id,
          humanColor: finishedGame.humanColor,
          moves: finishedGame.history?.length || 0,
          opening,
        });
        setActiveSeries(seriesSnapshot);
      }
      recordRivalryResult(outcome, {
        difficulty: finishedGame.difficulty,
        humanColor: finishedGame.humanColor,
        opening,
        moves: finishedGame.history?.length || 0,
        timeControlId: activeTimeControl?.id || 'none',
        seriesId: seriesSnapshot?.id || null,
        rematch: !!gameContext.rematch,
        runMode: gameContext.runMode || null,
      suddenDeath: !!gameContext.suddenDeath,
      pressureMoves: Number(endMeta.pressureMoves || 0),
      pressureIncidents: Number(endMeta.pressureIncidents || 0),
      });
      const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
      setRating((prev) => {
        const next = updateRating(prev, finishedGame.difficulty, score);
        saveRating(next);
        recordRatingHistory(next.rating);
        return next;
      });
    }

    const record = {
      id: `${finishedGame.id}-${Date.now()}`,
      sourceGameId: finishedGame.id,
      date: new Date().toISOString(),
      difficulty: finishedGame.difficulty,
      humanColor: finishedGame.humanColor,
      outcome,
      moves: finishedGame.history,
      finalFen: finishedGame.fen,
      initialFen: finishedGame.initialFen || null,
      mode: gameContext.suddenDeath ? 'sudden' : gameContext.rescue ? 'rescue' : gameContext.lab ? 'lab' : gameContext.runMode === 'cup' ? 'cup' : gameContext.runMode === 'boss' ? 'boss' : gameContext.runMode === 'streak' ? 'streak' : learningMode ? 'practice' : 'casual',
      opening,
      timeControl: activeTimeControl ? { id: activeTimeControl.id, label: activeTimeControl.label } : null,
      rematch: !!gameContext.rematch,
      runMode: gameContext.runMode || null,
      suddenDeath: !!gameContext.suddenDeath,
      pressureMoves: Number(endMeta.pressureMoves || 0),
      pressureIncidents: Number(endMeta.pressureIncidents || 0),
      gameChat: Array.isArray(endMeta.gameChat) ? endMeta.gameChat : loadActiveGameChat(finishedGame.id),
      series: seriesSnapshot ? {
        id: seriesSnapshot.id,
        bestOf: seriesSnapshot.bestOf,
        humanWins: seriesSnapshot.humanWins,
        cpuWins: seriesSnapshot.cpuWins,
        draws: seriesSnapshot.draws,
        winner: seriesSnapshot.winner,
      } : null,
    };
    setHistoryList(saveGameRecord(record));
    recordCareerGame(record, { ...endMeta, contract: activeContract });
    clearActiveContract();
    setActiveContract(null);
    if (specialRun?.active && gameContext.runMode) {
      const nextRun = recordSpecialRunResult(specialRun, outcome);
      setSpecialRun(nextRun);
    }
  }

  async function handleNextSeriesGame() {
    if (!activeSeries || activeSeries.winner) return;
    setLoading(true);
    setError(null);
    try {
      if (game?.id) await api.deleteGame(game.id).catch(() => {});
      const handicap = handicapForGap(rating.rating, activeSeries.difficulty);
      const created = await api.createGame(activeSeries.difficulty, activeSeries.nextColor, handicap?.id ?? null);
      const updatedSeries = { ...activeSeries, currentGameId: created.id };
      saveActiveSeries(updatedSeries);
      setActiveSeries(updatedSeries);
      setLearningMode(false);
      setActiveTimeControl(timeControlById(updatedSeries.timeControlId));
      setGame(created);
      setHasSavedGame(true);
      setView('game');
    } catch (e) {
      setError(e?.requestId ? e.message : 'No se pudo crear la siguiente partida de la serie.');
    } finally {
      setLoading(false);
    }
  }

  function buildLiveShareRecord(finishedGame, outcome, mode, series = null) {
    const moves = finishedGame?.history || [];
    return {
      id: `share-${finishedGame?.id || Date.now()}`,
      date: new Date().toISOString(),
      difficulty: finishedGame?.difficulty || 0,
      humanColor: finishedGame?.humanColor || 'w',
      outcome,
      moves,
      finalFen: finishedGame?.fen || null,
      mode,
      opening: identifyOpening(moves.map((m) => m.san).filter(Boolean)),
      timeControl: activeTimeControl ? { id: activeTimeControl.id, label: activeTimeControl.label } : null,
      series: series ? {
        id: series.id,
        bestOf: series.bestOf,
        humanWins: series.humanWins,
        cpuWins: series.cpuWins,
        draws: series.draws,
        winner: series.winner,
      } : null,
    };
  }

  async function handleRematch({ difficulty, humanColor, timeControl }) {
    setLoading(true);
    setError(null);
    try {
      if (game?.id) await api.deleteGame(game.id).catch(() => {});
      const nextColor = humanColor === 'w' ? 'b' : 'w';
      const created = await api.createGame(difficulty, nextColor, null);
      const contract = chooseContract({ gameCount: historyList.length, incidents: loadRivalry().incidents });
      saveActiveContract(contract);
      setActiveContract(contract);
      setGameContext({ rematch: true });
      setActiveTimeControl(timeControl || null);
      setLearningMode(false);
      clearActiveSeries();
      setActiveSeries(null);
      setGame(created);
      setHasSavedGame(true);
      setView('game');
    } catch (e) {
      setError(e?.requestId ? e.message : 'No se pudo preparar la revancha.');
    } finally { setLoading(false); }
  }

  async function handlePlayFromHere(fen, humanColor, difficulty, meta = {}) {
    setLoading(true);
    setError(null);
    try {
      const created = await api.createGame(difficulty || 50, humanColor || 'w', null, fen);
      clearActiveSeries();
      setActiveSeries(null);
      clearActiveContract();
      setActiveContract(null);
      setSpecialRun(loadSpecialRun());
      setGameContext({ lab: true, rescue: !!meta.rescue, sourceRecordId: meta.sourceRecord?.id || null });
      setLearningMode(true);
      setActiveTimeControl(null);
      setGame(created);
      setHasSavedGame(true);
      setView('game');
    } catch (e) {
      setError(e?.requestId ? e.message : 'No se pudo arrancar la posición del laboratorio.');
    } finally { setLoading(false); }
  }

  function openMovie(record) {
    setReplayCrimeMode(false);
    setReplayInitialStep(0);
    setPinnedReport(null);
    setReplayRecord(record);
    setReplayMovieMode(true);
    setView('replay');
  }

  function openPuzzleMode(source = 'curated', rush = false) {
    setPuzzleLaunch({ source, rush });
    setView('puzzle');
  }

  async function launchRun(run) {
    setLoading(true);
    setError(null);
    try {
      if (game?.id) await api.deleteGame(game.id).catch(() => {});
      const created = await api.createGame(run.difficulty, 'random', null);
      clearActiveSeries();
      setActiveSeries(null);
      clearActiveContract();
      setActiveContract(null);
      const withGame = saveSpecialRun({ ...run, currentGameId: created.id });
      setSpecialRun(withGame);
      setGameContext({ runMode: run.mode });
      setLearningMode(false);
      setActiveTimeControl(timeControlById('5+0'));
      setGame(created);
      setHasSavedGame(true);
      setView('game');
    } catch (e) {
      setError(e?.requestId ? e.message : 'No se pudo iniciar el desafío.');
    } finally { setLoading(false); }
  }

  function handleStartRun(mode) {
    const run = startSpecialRun(mode);
    launchRun(run);
  }

  function handleContinueRun(run = specialRun) {
    if (run?.active) launchRun(run);
  }

  // --- Modo torneo ---

  async function handlePlayTournament(color) {
    setLoading(true);
    setError(null);
    try {
      const level = levelForPoints(tournament.points);
      const cpuDifficulty = difficultyForLevel(level);
      const created = await api.createGame(cpuDifficulty, color);
      setTournamentGame(created);
      setView('tournamentGame');
    } catch (e) {
      setError(e?.requestId ? e.message : 'No se pudo conectar con el servidor. ¿Está corriendo el backend?');
    } finally {
      setLoading(false);
    }
  }

  function handleTournamentGameEnd(outcome, finishedGame, endMeta = {}) {
    if (finishedGame) {
      const moveSans = (finishedGame.history || []).map((m) => m.san).filter(Boolean);
      recordRivalryResult(outcome, {
        difficulty: finishedGame.difficulty,
        humanColor: finishedGame.humanColor,
        opening: identifyOpening(moveSans),
        moves: finishedGame.history?.length || 0,
        timeControlId: null,
      });
    }
    setTournament((prev) => {
      const { state, gained, leveledUp, newLevel } = applyResult(prev, outcome);
      saveTournament(state);
      setLastResult({ outcome, gained, leveledUp, newLevel });
      return state;
    });

    if (finishedGame) {
      // Actualizamos también el rating tipo ELO: cuenta como una partida
      // más contra una CPU de dificultad conocida.
      const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
      setRating((prev) => {
        const next = updateRating(prev, finishedGame.difficulty, score);
        saveRating(next);
        recordRatingHistory(next.rating);
        return next;
      });

      const record = {
        id: `${finishedGame.id}-${Date.now()}`,
      sourceGameId: finishedGame.id,
        date: new Date().toISOString(),
        difficulty: finishedGame.difficulty,
        humanColor: finishedGame.humanColor,
        outcome,
        moves: finishedGame.history,
        finalFen: finishedGame.fen,
        mode: 'tournament',
        opening: identifyOpening((finishedGame.history || []).map((m) => m.san).filter(Boolean)),
        timeControl: null,
        gameChat: Array.isArray(endMeta.gameChat) ? endMeta.gameChat : loadActiveGameChat(finishedGame.id),
        series: null,
        };
      setHistoryList(saveGameRecord(record));
      recordCareerGame(record, {});
    }
  }

  function handleGameChatUpdate(gameId, transcript) {
    const updated = updateGameRecordChat(gameId, transcript);
    // Evita renders extra mientras la partida sigue viva: solo hay que
    // refrescar History si ya existe un registro archivado para este gameId.
    if (updated.some((record) => record?.sourceGameId === gameId || record?.id === gameId)) {
      setHistoryList(updated);
    }
  }

  function handleSpendPoints(cost) {
    setTournament((prev) => {
      const next = { ...prev, points: Math.max(0, prev.points - cost) };
      saveTournament(next);
      return next;
    });
  }

  function handleCapturePoints(gained) {
    setTournament((prev) => {
      const next = { ...prev, points: prev.points + gained };
      saveTournament(next);
      return next;
    });
  }

  function handleExitTournamentGame() {
    setTournamentGame(null);
    setView('tournament');
  }

  function handleResetTournament() {
    setTournament(resetTournament());
    setLastResult(null);
  }

  const isBoardGameView = view === 'game' || view === 'tournamentGame';

  return (
    <>
      {!isBoardGameView && <GlobalMusicDock />}
      <ErrorBoundary onReset={() => setView('menu')}>
      <div className="app-shell">
        <div className="masthead">
          <div className="masthead-top-row">
            <div className="masthead-text">
              <h1>Escuela de Ajedrez</h1>
            </div>
          </div>
          <PlayerStatusBar
            tournament={tournament}
            combatXp={combatXp}
            rating={rating}
            onTournamentClick={() => setView('tournament')}
            onRatingClick={() => setShowRatingDetail(true)}
          />
        </div>

        {showRatingDetail && (
          <RatingDetailModal rating={rating} onClose={() => setShowRatingDetail(false)} />
        )}

        {view === 'menu' && (
          <Menu
            onNewGame={handleNewGame}
            onContinue={handleContinue}
            onTournament={() => setView('tournament')}
            onTutorial={() => setView('tutorial')}
            onOpenings={() => setView('openings')}
            onPuzzle={() => openPuzzleMode('curated', false)}
            onSpectator={() => setView('spectator')}
            onCombat={() => setView('combat')}
            onCombatRoguelike={() => setView('roguelike')}
            isAdminUser={isAdminUser}
            onAdmin={() => setView('admin')}
            onHistory={() => setView('history')}
            onInsights={() => setView('insights')}
            onCareer={() => setView('career')}
            onLab={() => setView('lab')}
            onBoard3D={() => setView('board3d')}
            hasSavedGame={hasSavedGame}
            loading={loading}
            error={error}
            tournament={tournament}
            rating={rating}
          />
        )}

        {view === 'game' && game && (
          <GameScreen
            game={game}
            setGame={setGame}
            onExit={handleExitGame}
            onError={setError}
            onGameEnd={handleCasualGameEnd}
            onChatUpdate={handleGameChatUpdate}
            hintMode={learningMode ? 'free' : 'off'}
            timeControl={activeTimeControl}
            seriesState={activeSeries}
            onNextSeriesGame={handleNextSeriesGame}
            onShareResult={(outcome) => setShareRecord(buildLiveShareRecord(game, outcome, learningMode ? 'practice' : 'casual', activeSeries))}
            onShareIncident={(moveReport, _report, outcome) => setShareRecord({ ...buildLiveShareRecord(game, outcome, learningMode ? 'practice' : 'casual', activeSeries), incident: { moveNumber: moveReport.moveNumber, played: moveReport.played, suggested: moveReport.suggested, loss: moveReport.loss } })}
            onOpenCrimeScene={(moveReport, _report, meta) => openGameCrimeScene(game, moveReport, gameContext.rescue ? 'rescue' : gameContext.lab ? 'lab' : learningMode ? 'practice' : 'casual', meta?.outcome)}
            activeContract={activeContract}
            runState={specialRun && gameContext.runMode ? specialRun : null}
            onNextRunGame={() => handleContinueRun(specialRun)}
            onRematch={handleRematch}
            memoryContext={gameContext}
            onTrainPersonal={() => openPuzzleMode('personal', false)}
          />
        )}

        {view === 'tutorial' && <Tutorial onExit={() => setView('menu')} />}
        {view === 'openings' && <OpeningsScreen onExit={() => setView('menu')} />}

        {view === 'puzzle' && (
          <PuzzleScreen key={`${puzzleLaunch.source}-${puzzleLaunch.rush}`} initialSource={puzzleLaunch.source} rushMode={puzzleLaunch.rush} onExit={() => setView('menu')} points={tournament.points} onSpendPoints={handleSpendPoints} />
        )}

        {view === 'spectator' && <SpectatorScreen onExit={() => setView('menu')} />}

        {view === 'lab' && (
          <LabScreen onExit={() => setView('menu')} onStart={(fen, color, difficulty, meta) => handlePlayFromHere(fen, color, difficulty, meta)} />
        )}

        {view === 'board3d' && (
          <React.Suspense fallback={<p className="hint-text" style={{ textAlign: 'center' }}>Cargando el visor 3D…</p>}>
            <Board3DExperiment onExit={() => setView('menu')} />
          </React.Suspense>
        )}

        {view === 'combat' && (
          <CombatScreen
            onExit={() => setView('menu')}
            onError={setError}
            onHistory={() => setView('history')}
            onViewBattle={openHistoryRecord}
          />
        )}

        {view === 'roguelike' && (
          <RoguelikeScreen
            onExit={() => setView('menu')}
            onError={setError}
            onHistory={() => setView('history')}
            onViewBattle={openHistoryRecord}
          />
        )}

        {view === 'admin' && <AdminScreen onExit={() => setView('menu')} />}

        {view === 'tournament' && (
          <TournamentScreen
            tournament={tournament}
            onPlay={handlePlayTournament}
            onExit={() => setView('menu')}
            onReset={handleResetTournament}
            onHistory={() => setView('history')}
            loading={loading}
            lastResult={lastResult}
          />
        )}

        {view === 'insights' && (
          <InsightsScreen
            insights={insights}
            gameHistory={historyList}
            combatHistory={combatHistoryList}
            ratingHistory={loadRatingHistory()}
            onExit={() => setView('menu')}
            onJumpToMove={jumpToMove}
          />
        )}

        {view === 'career' && (
          <CareerScreen
            history={historyList}
            ratingHistory={loadRatingHistory()}
            onExit={() => setView('menu')}
            onOpenRecord={openHistoryRecord}
            onMovie={openMovie}
            onPlayFromHere={handlePlayFromHere}
            onOpenPuzzles={openPuzzleMode}
            onStartRun={handleStartRun}
            onContinueRun={handleContinueRun}
          />
        )}

        {view === 'history' && (
          <HistoryScreen
            records={allHistory}
            onOpen={openHistoryRecord}
            onExit={() => setView('menu')}
            onClear={clearAllHistory}
            onShare={(record) => setShareRecord(record)}
            onMovie={openMovie}
            title="Historial de partidas"
            emptyText='Todavía no jugaste ninguna partida. Normal, Torneo, Práctica y Combate quedan todas acá juntas, con "pista inversa" para revisar dónde te equivocaste.'
          />
        )}

        {view === 'replay' && replayRecord && (
          <ReplayScreen record={replayRecord} initialStep={replayInitialStep} pinnedReport={pinnedReport} crimeMode={replayCrimeMode} movieMode={replayMovieMode} onPlayFromHere={handlePlayFromHere} onExit={() => setView('history')} />
        )}

        {view === 'combatReplay' && combatReplayRecord && (
          <CombatReplayScreen record={combatReplayRecord} initialStep={replayInitialStep} pinnedReport={pinnedReport} onExit={() => setView('history')} />
        )}

        {view === 'tournamentGame' && tournamentGame && (
          <GameScreen
            game={tournamentGame}
            setGame={setTournamentGame}
            onExit={handleExitTournamentGame}
            onError={setError}
            onGameEnd={handleTournamentGameEnd}
            onChatUpdate={handleGameChatUpdate}
            hintMode="paid"
            tournamentLevel={levelForPoints(tournament.points)}
            points={tournament.points}
            onSpendPoints={handleSpendPoints}
            onCapturePoints={handleCapturePoints}
            onShareResult={(outcome) => setShareRecord(buildLiveShareRecord(tournamentGame, outcome, 'tournament', null))}
            onShareIncident={(moveReport, _report, outcome) => setShareRecord({ ...buildLiveShareRecord(tournamentGame, outcome, 'tournament', null), incident: { moveNumber: moveReport.moveNumber, played: moveReport.played, suggested: moveReport.suggested, loss: moveReport.loss } })}
            onOpenCrimeScene={(moveReport, _report, meta) => openGameCrimeScene(tournamentGame, moveReport, 'tournament', meta?.outcome)}
          />
        )}

        {shareRecord && <ShareResultModal record={shareRecord} onClose={() => setShareRecord(null)} />}
      </div>
      </ErrorBoundary>
    </>
  );
}

function GlobalMusicDock() {
  return (
    <div className="global-music-dock" aria-label="Reproductor global">
      <MusicPlayer />
    </div>
  );
}

// Envuelve AppInner con la sincronización inicial. Mongo se lee ANTES de
// montar AppInner, porque sus useState(() => loadX()) solo leen localStorage
// una vez. Si la API/Mongo no está disponible no montamos la aplicación con
// una caché potencialmente perteneciente a otra identidad.
function App() {
  const sharedRecord = shareRecordFromHash();
  const [loggedIn, setLoggedIn] = useState(() => isLoggedIn());
  const [ready, setReady] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [syncError, setSyncError] = useState(null);

  useEffect(() => {
    // Una sesión puede cambiar desde otra pestaña porque localStorage es
    // compartido. Recargar desmonta inmediatamente cualquier estado React
    // perteneciente a la identidad anterior antes de que pueda sincronizarse.
    return watchSessionIdentity(() => window.location.reload());
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return undefined;
    touchActivity();
    const timer = window.setInterval(touchActivity, 60000);
    return () => window.clearInterval(timer);
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    setReady(false);
    setSyncError(null);
    setIsAdminUser(false);

    Promise.all([pullProfileFromServer(), fetchMe()]).then(([profile, me]) => {
      if (cancelled) return;

      if (profile.status === 'unauthorized') {
        // Token caducado/corrupto: evitar un bucle infinito de recargas.
        logout();
        setLoggedIn(false);
        return;
      }

      if (profile.status === 'offline') {
        setSyncError('No se pudo leer tu perfil desde MongoDB. No se ha abierto la caché local para evitar mezclar o sobrescribir cuentas.');
        return;
      }

      setIsAdminUser(!!me?.isAdmin);
      // La pantalla de login y la sincronización permanecen en silencio.
      // El tema ya fue sorteado al autenticarse y arrancará cuando el perfil
      // esté listo, en el efecto [loggedIn, ready] de abajo.
      setReady(true);
    });

    return () => { cancelled = true; };
  }, [loggedIn]);

  useEffect(() => {
    // Nada de música para login, enlaces públicos ni bots que solo despiertan
    // el frontend. La banda entra cuando existe un usuario autenticado y su
    // perfil ya terminó de sincronizarse.
    if (!loggedIn || !ready) {
      stopAmbientMusic();
      return undefined;
    }
    startAmbientMusic();
    return () => stopAmbientMusic();
  }, [loggedIn, ready]);

  if (sharedRecord) {
    return (
      <>
        <SharedResultScreen record={sharedRecord} onOpenApp={() => {
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
          window.location.reload();
        }} />
      </>
    );
  }

  if (!loggedIn) {
    return <LoginScreen onLoggedIn={() => setLoggedIn(true)} />;
  }

  if (!ready) {
    return (
      <>
        <div className="app-shell">
          <div className="menu" style={{ maxWidth: 560, margin: '3rem auto' }}>
            <div className="menu-section">
              <span className="eyebrow">Escuela de Ajedrez</span>
              <h2>{syncError ? 'No se pudo sincronizar' : 'Sincronizando tu perfil…'}</h2>
              {syncError ? (
                <>
                  <p className="error-text">{syncError}</p>
                  <button type="button" className="primary-btn" onClick={() => window.location.reload()}>
                    Reintentar
                  </button>
                </>
              ) : (
                <p className="hint-text">Cargando tu progreso antes de abrir la aplicación.</p>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  return <AppInner isAdminUser={isAdminUser} />;
}

export default App;
