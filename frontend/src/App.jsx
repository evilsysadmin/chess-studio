import React, { useEffect, useMemo, useState } from 'react';
import Menu from './components/Menu.jsx';
const GameScreen = React.lazy(() => import('./components/GameScreen.jsx'));
const Tutorial = React.lazy(() => import('./components/Tutorial.jsx'));
const OpeningsScreen = React.lazy(() => import('./components/OpeningsScreen.jsx'));
const TournamentScreen = React.lazy(() => import('./components/TournamentScreen.jsx'));
const HistoryScreen = React.lazy(() => import('./components/HistoryScreen.jsx'));
const ReplayScreen = React.lazy(() => import('./components/ReplayScreen.jsx'));
const CombatReplayScreen = React.lazy(() => import('./components/CombatReplayScreen.jsx'));
const SpectatorScreen = React.lazy(() => import('./components/SpectatorScreen.jsx'));
const Board3DExperiment = React.lazy(() => import('./components/Board3DExperiment.jsx'));
import { loadCombatHistory, clearCombatHistory } from './combatHistory.js';
const PuzzleScreen = React.lazy(() => import('./components/PuzzleScreen.jsx'));
const CombatScreen = React.lazy(() => import('./components/CombatScreen.jsx'));
const RoguelikeScreen = React.lazy(() => import('./components/RoguelikeScreen.jsx'));
import PlayerStatusBar from './components/PlayerStatusBar.jsx';
import RatingDetailModal from './components/RatingDetailModal.jsx';
const MusicPlayer = React.lazy(() => import('./components/MusicPlayer.jsx'));
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { api, STORAGE_KEY } from './api.js';
import { loadTournament, saveTournament, resetTournament, applyResult, applyCaptureReward, difficultyForLevel, levelForPoints } from './tournament.js';
import { loadGameHistory, saveGameRecord, clearGameHistory, updateGameRecordChat } from './gameHistory.js';
import { recordGameActivity } from './gameActivity.js';
import { gameModeFromContext } from './gameModes.js';
import { loadRoster as loadCombatRoster } from './combatRoster.js';
import { loadRating, saveRating, updateRating, ratingChangeDetails, ratingScoreForOutcome, recordRatingHistory, loadRatingHistory } from './playerRating.js';
import { handicapForGap } from './handicap.js';
import { computeInsights } from './insights.js';
const InsightsScreen = React.lazy(() => import('./components/InsightsScreen.jsx'));
import { timeControlById } from './clock.js';
import { clearClockSnapshot } from './clockPersistence.js';
import { checkAchievements } from './achievements.js';
import { pullProfileFromServer, pushProfileToServer, scheduleProfileSync, cancelScheduledProfileSync } from './profileBackup.js';
import { isLoggedIn, fetchMe, logout, watchSessionIdentity } from './auth.js';
import { PROFILE_CHANGED_EVENT } from './profileKeys.js';
const AdminScreen = React.lazy(() => import('./components/AdminScreen.jsx'));
import LiveServiceStatus from './components/LiveServiceStatus.jsx';
import SaveStatusBadge from './components/SaveStatusBadge.jsx';
import { SAVE_STATUS } from './saveStatus.js';
import LoginScreen from './components/LoginScreen.jsx';
import { loadRivalry, recordRivalryResult, reconcileRivalryHistory } from './rivalry.js';
import { identifyOpening } from './openings.js';
import { createSeries, loadActiveSeries, saveActiveSeries, clearActiveSeries, recordSeriesGame } from './series.js';
const ShareResultModal = React.lazy(() => import('./components/ShareResultModal.jsx'));
import SharedResultScreen from './components/SharedResultScreen.jsx';
import { shareRecordFromHash } from './shareResult.js';
const LabScreen = React.lazy(() => import('./components/LabScreen.jsx'));
import { chooseContract, clearActiveContract, loadActiveContract, loadSpecialRun, recordCareerGame, recordSpecialRunResult, reconcileCareerHistory, saveActiveContract, saveSpecialRun, startSpecialRun } from './career.js';
import { loadActiveGameChat } from './gameChat.js';
import { clearActiveGameSession, loadActiveGameSession } from './activeGameSession.js';
import { usePresenceHeartbeat } from './usePresenceHeartbeat.js';
import { useActiveGameSessionPersistence } from './useActiveGameSessionPersistence.js';
import { useGameReconnect } from './useGameReconnect.js';
import { useViewNavigation } from './useViewNavigation.js';
import { LEARNING_STORAGE_KEY, useActiveSessionRestore } from './useActiveSessionRestore.js';
import { STORAGE_LOCAL, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';

// 'menu' | 'game' | 'tutorial' | 'openings' | 'tournament' | 'tournamentGame' | 'puzzle' | 'combat' | 'history' | 'replay'
function AppInner({ isAdminUser }) {
  const {
    view,
    navigateTo,
    goBack,
    replaceView,
    resetNavigation,
  } = useViewNavigation({
    isAdminUser,
    initialView: () => loadActiveGameSession()?.route || null,
  });
  const [combatBattleUiActive, setCombatBattleUiActive] = useState(false);

  usePresenceHeartbeat(view);

  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSavedGame, setHasSavedGame] = useState(() => !!getStorageItem(STORAGE_LOCAL, STORAGE_KEY) || !!loadActiveGameSession());
  const [learningMode, setLearningMode] = useState(() => getStorageItem(STORAGE_LOCAL, LEARNING_STORAGE_KEY) === '1');

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
      navigateTo('combatReplay');
    } else {
      setReplayRecord(record);
      navigateTo('replay');
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
      navigateTo('combatReplay');
    } else {
      setReplayRecord(record);
      navigateTo('replay');
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
    if (mode === 'casual' || mode === 'practice' || mode === 'ghost') {
      removeStorageItem(STORAGE_LOCAL, STORAGE_KEY);
      removeStorageItem(STORAGE_LOCAL, LEARNING_STORAGE_KEY);
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
    navigateTo('replay');
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
  const [puzzleLaunch, setPuzzleLaunch] = useState({ source: 'curated', rush: false, filter: null });
  const [activeContract, setActiveContract] = useState(() => loadActiveContract());
  const [specialRun, setSpecialRun] = useState(() => loadSpecialRun());
  const [gameContext, setGameContext] = useState({});
  const [replayMovieMode, setReplayMovieMode] = useState(false);
  const [showRatingDetail, setShowRatingDetail] = useState(false);
  const [gameSaveState, setGameSaveState] = useState(SAVE_STATUS.SAVED);

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
    if (game) setStorageItem(STORAGE_LOCAL, STORAGE_KEY, game.id);
  }, [game]);

  useEffect(() => {
    setStorageItem(STORAGE_LOCAL, LEARNING_STORAGE_KEY, learningMode ? '1' : '0');
  }, [learningMode]);

  // Snapshot local de la sesión activa. Mongo confirma el tablero y el hook
  // conserva el contexto cliente necesario para sobrevivir a F5/deploy.
  useActiveGameSessionPersistence({
    view,
    game,
    tournamentGame,
    learningMode,
    gameContext,
    timeControlId: activeTimeControl?.id || null,
    onPersistenceState: setGameSaveState,
  });

  // Reconciliación conservadora tras offline → online. El hook mantiene Mongo
  // como autoridad y descarta respuestas tardías si el usuario cambia de partida.
  useGameReconnect({
    route: view,
    game,
    tournamentGame,
    saveState: gameSaveState,
    getGame: api.getGame,
    onGame: setGame,
    onTournamentGame: setTournamentGame,
    onPersistenceState: setGameSaveState,
    onError: setError,
  });


  // Restauración de F5/deploy, Continuar partida y recovery del ErrorBoundary.
  // El hook concentra la rehidratación de contrato/run/serie/reloj sin hacer
  // que App conozca otra vez todos los detalles de persistencia.
  const { continueActiveSession, recoverSessionFromBoundary } = useActiveSessionRestore({
    currentView: view,
    game,
    tournamentGame,
    learningMode,
    gameContext,
    activeTimeControl,
    replaceView,
    setGame,
    setTournamentGame,
    setLearningMode,
    setActiveContract,
    setSpecialRun,
    setGameContext,
    setActiveSeries,
    setActiveTimeControl,
    setHasSavedGame,
    setGameSaveState,
    setLoading,
    setError,
  });


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
      const created = await api.createGame(difficulty, color, handicap?.id ?? null, null, opts?.ghostStyle || null);
      const isLearning = !!opts?.learning;
      const nextContext = { rematch: !!opts?.rematch, runMode: opts?.runMode || null, lab: !!opts?.lab, rescue: !!opts?.rescue, suddenDeath: !!opts?.suddenDeath, threatCheck: !!opts?.threatCheck, ghost: !!opts?.ghost, ghostStyle: opts?.ghostStyle || null };
      setLearningMode(isLearning);
      setActiveTimeControl(timeControlById(opts?.timeControlId));
      setGameContext(nextContext);
      recordGameActivity({ gameId: created.id, state: 'started', mode: gameModeFromContext({ learningMode: isLearning, gameContext: nextContext }) });
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
      navigateTo('game');
    } catch (e) {
      setError(e?.requestId ? e.message : 'No se pudo conectar con el servidor. ¿Está corriendo el backend?');
    } finally {
      setLoading(false);
    }
  }


  function handleExitGame() {
    if (game?.id) {
      recordGameActivity({ gameId: game.id, state: 'cancelled', mode: gameModeFromContext({ learningMode, gameContext }) });
    }
    if (gameContext.runMode && specialRun?.active) {
      const endedRun = recordSpecialRunResult(specialRun, 'loss');
      setSpecialRun(endedRun);
    }
    if (game?.id) clearClockSnapshot(game.id);
    clearActiveGameSession();
    removeStorageItem(STORAGE_LOCAL, STORAGE_KEY);
    removeStorageItem(STORAGE_LOCAL, LEARNING_STORAGE_KEY);
    setHasSavedGame(false);
    setGame(null);
    setLearningMode(false);
    clearActiveContract();
    setActiveContract(null);
    setGameContext({});
    clearActiveSeries();
    setActiveSeries(null);
    goBack();
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
    clearClockSnapshot(finishedGame.id);
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
      const score = ratingScoreForOutcome(outcome);
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
      mode: gameContext.suddenDeath ? 'sudden' : gameContext.rescue ? 'rescue' : gameContext.nemesis ? 'nemesis-training' : gameContext.lab ? 'lab' : gameContext.runMode === 'cup' ? 'cup' : gameContext.runMode === 'boss' ? 'boss' : gameContext.runMode === 'streak' ? 'streak' : gameContext.ghost ? 'ghost' : learningMode ? 'practice' : 'casual',
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
    recordGameActivity({ gameId: finishedGame.id, state: 'finished', mode: record.mode, outcome });
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
    if (game?.id) clearClockSnapshot(game.id);
    setLoading(true);
    setError(null);
    try {
      if (game?.id) await api.deleteGame(game.id).catch(() => {});
      const handicap = handicapForGap(rating.rating, activeSeries.difficulty);
      const created = await api.createGame(activeSeries.difficulty, activeSeries.nextColor, handicap?.id ?? null);
      recordGameActivity({ gameId: created.id, state: 'started', mode: 'casual' });
      const updatedSeries = { ...activeSeries, currentGameId: created.id };
      saveActiveSeries(updatedSeries);
      setActiveSeries(updatedSeries);
      setLearningMode(false);
      setActiveTimeControl(timeControlById(updatedSeries.timeControlId));
      setGame(created);
      setHasSavedGame(true);
      navigateTo('game');
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

  async function handleRematch({ difficulty, humanColor, timeControl, ghostStyle = null }) {
    if (game?.id) clearClockSnapshot(game.id);
    setLoading(true);
    setError(null);
    try {
      if (game?.id) {
        recordGameActivity({ gameId: game.id, state: 'cancelled', mode: gameModeFromContext({ learningMode, gameContext }) });
        await api.deleteGame(game.id).catch(() => {});
      }
      const nextColor = humanColor === 'w' ? 'b' : 'w';
      const created = await api.createGame(difficulty, nextColor, null, null, ghostStyle);
      recordGameActivity({ gameId: created.id, state: 'started', mode: ghostStyle ? 'ghost' : 'casual' });
      const contract = chooseContract({ gameCount: historyList.length, incidents: loadRivalry().incidents });
      saveActiveContract(contract);
      setActiveContract(contract);
      setGameContext({ rematch: true, ghost: !!ghostStyle, ghostStyle });
      setActiveTimeControl(timeControl || null);
      setLearningMode(false);
      clearActiveSeries();
      setActiveSeries(null);
      setGame(created);
      setHasSavedGame(true);
      navigateTo('game');
    } catch (e) {
      setError(e?.requestId ? e.message : 'No se pudo preparar la revancha.');
    } finally { setLoading(false); }
  }

  async function handlePlayFromHere(fen, humanColor, difficulty, meta = {}) {
    setLoading(true);
    setError(null);
    try {
      const created = await api.createGame(difficulty || 50, humanColor || 'w', null, fen);
      const nextContext = { lab: true, rescue: !!meta.rescue, nemesis: !!meta.nemesis, nemesisLabel: meta.nemesisLabel || null, nemesisOpening: meta.nemesisOpening || null, sourceRecordId: meta.sourceRecord?.id || null };
      recordGameActivity({ gameId: created.id, state: 'started', mode: gameModeFromContext({ learningMode: true, gameContext: nextContext }) });
      clearActiveSeries();
      setActiveSeries(null);
      clearActiveContract();
      setActiveContract(null);
      setSpecialRun(loadSpecialRun());
      setGameContext(nextContext);
      setLearningMode(true);
      setActiveTimeControl(null);
      setGame(created);
      setHasSavedGame(true);
      navigateTo('game');
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
    navigateTo('replay');
  }

  function openPuzzleMode(source = 'curated', rush = false, filter = null) {
    setPuzzleLaunch({ source, rush, filter });
    navigateTo('puzzle');
  }

  async function launchRun(run) {
    setLoading(true);
    setError(null);
    try {
      if (game?.id) await api.deleteGame(game.id).catch(() => {});
      const created = await api.createGame(run.difficulty, 'random', null);
      recordGameActivity({ gameId: created.id, state: 'started', mode: run.mode || 'streak' });
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
      navigateTo('game');
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
      const level = levelForPoints(tournament.progressPoints || 0);
      const cpuDifficulty = difficultyForLevel(level);
      const created = await api.createGame(cpuDifficulty, color);
      recordGameActivity({ gameId: created.id, state: 'started', mode: 'tournament' });
      setTournamentGame(created);
      navigateTo('tournamentGame');
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
      const score = ratingScoreForOutcome(outcome);
      setRating((prev) => {
        const details = ratingChangeDetails(prev, finishedGame.difficulty, score);
        saveRating(details.next);
        recordRatingHistory(details.next.rating);
        setLastResult((current) => ({
          ...(current || { outcome }),
          eloDelta: details.delta,
          eloBefore: prev.rating,
          eloAfter: details.next.rating,
          cpuRating: details.cpuRating,
          expectedScore: details.expectedScore,
        }));
        return details.next;
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
      recordGameActivity({ gameId: finishedGame.id, state: 'finished', mode: 'tournament', outcome });
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
      // Moneda de pistas exclusivamente. No altera progreso de torneo ni ELO.
      const next = applyCaptureReward(prev, gained);
      saveTournament(next);
      return next;
    });
  }

  function handleExitTournamentGame() {
    if (tournamentGame?.id) recordGameActivity({ gameId: tournamentGame.id, state: 'cancelled', mode: 'tournament' });
    clearActiveGameSession();
    setHasSavedGame(!!getStorageItem(STORAGE_LOCAL, STORAGE_KEY));
    setTournamentGame(null);
    goBack();
  }

  function handleResetTournament() {
    setTournament(resetTournament());
    setLastResult(null);
  }

  const isBoardGameView = view === 'game' || view === 'tournamentGame' || combatBattleUiActive;

  return (
    <>
      {!isBoardGameView && <GlobalMusicDock isAdminUser={isAdminUser} onAdmin={() => navigateTo('admin')} />}
      <ErrorBoundary
        onReset={resetNavigation}
        onRecover={recoverSessionFromBoundary}
        canRecover={Boolean(game?.id || tournamentGame?.id || loadActiveGameSession()?.gameId || view === 'combat' || view === 'roguelike')}
      >
      <div className="app-shell">
        <div className="masthead">
          <div className="masthead-top-row">
            <div className="masthead-text">
              <h1>Escuela de Ajedrez</h1>
            </div>
            {((view === 'game' || view === 'tournamentGame') && (game?.id || tournamentGame?.id) || combatBattleUiActive) && (
              <SaveStatusBadge state={gameSaveState} />
            )}
          </div>
          <PlayerStatusBar
            tournament={tournament}
            combatXp={combatXp}
            rating={rating}
            compact={view === 'menu'}
            onTournamentClick={() => navigateTo('tournament')}
            onRatingClick={() => setShowRatingDetail(true)}
          />
          {!isBoardGameView && view !== 'menu' && (
            <div className="navigation-back-hint">ESC o clic derecho · volver / cerrar</div>
          )}
        </div>

        {showRatingDetail && (
          <RatingDetailModal rating={rating} onClose={() => setShowRatingDetail(false)} />
        )}

        <React.Suspense fallback={<div className="route-loading" role="status">Cargando…</div>}>
        {((view === 'game' && !game) || (view === 'tournamentGame' && !tournamentGame)) && (
          <div className="route-loading" role="status">Restaurando partida en curso…</div>
        )}
        {view === 'menu' && (
          <Menu
            onNewGame={handleNewGame}
            onContinue={continueActiveSession}
            onTournament={() => navigateTo('tournament')}
            onTutorial={() => navigateTo('tutorial')}
            onOpenings={() => navigateTo('openings')}
            onPuzzle={() => openPuzzleMode('curated', false)}
            onDailyChallenge={() => openPuzzleMode('daily', false)}
            onTrainPersonal={() => openPuzzleMode('personal', false)}
            onSpectator={() => navigateTo('spectator')}
            onCombat={() => navigateTo('combat')}
            onCombatRoguelike={() => navigateTo('roguelike')}
            isAdminUser={isAdminUser}
            onAdmin={() => navigateTo('admin')}
            onHistory={() => navigateTo('history')}
            onInsights={() => navigateTo('insights')}
            onLab={() => navigateTo('lab')}
            onBoard3D={() => navigateTo('board3d')}
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
            onPersistenceState={setGameSaveState}
            onGameEnd={handleCasualGameEnd}
            onChatUpdate={handleGameChatUpdate}
            hintMode={learningMode ? 'free' : 'off'}
            timeControl={activeTimeControl}
            seriesState={activeSeries}
            onNextSeriesGame={handleNextSeriesGame}
            onShareResult={(outcome) => setShareRecord(buildLiveShareRecord(game, outcome, gameContext.ghost ? 'ghost' : learningMode ? 'practice' : 'casual', activeSeries))}
            onShareIncident={(moveReport, _report, outcome) => setShareRecord({ ...buildLiveShareRecord(game, outcome, gameContext.ghost ? 'ghost' : learningMode ? 'practice' : 'casual', activeSeries), incident: { moveNumber: moveReport.moveNumber, played: moveReport.played, suggested: moveReport.suggested, loss: moveReport.loss } })}
            onOpenCrimeScene={(moveReport, _report, meta) => openGameCrimeScene(game, moveReport, gameContext.rescue ? 'rescue' : gameContext.lab ? 'lab' : gameContext.ghost ? 'ghost' : learningMode ? 'practice' : 'casual', meta?.outcome)}
            activeContract={activeContract}
            runState={specialRun && gameContext.runMode ? specialRun : null}
            onNextRunGame={() => handleContinueRun(specialRun)}
            onRematch={handleRematch}
            memoryContext={gameContext}
            onTrainPersonal={() => openPuzzleMode('personal', false)}
          />
        )}

        {view === 'tutorial' && <Tutorial onExit={goBack} />}
        {view === 'openings' && <OpeningsScreen onExit={goBack} />}

        {view === 'puzzle' && (
          <PuzzleScreen key={`${puzzleLaunch.source}-${puzzleLaunch.rush}-${puzzleLaunch.filter?.opening || 'all'}`} initialSource={puzzleLaunch.source} rushMode={puzzleLaunch.rush} initialFilter={puzzleLaunch.filter} onExit={goBack} points={tournament.points} onSpendPoints={handleSpendPoints} />
        )}

        {view === 'spectator' && <SpectatorScreen onExit={goBack} />}

        {view === 'lab' && (
          <LabScreen onExit={goBack} onStart={(fen, color, difficulty, meta) => handlePlayFromHere(fen, color, difficulty, meta)} />
        )}

        {view === 'board3d' && <Board3DExperiment onExit={goBack} />}

        {view === 'combat' && (
          <CombatScreen
            onExit={goBack}
            onError={setError}
            onHistory={() => navigateTo('history')}
            onViewBattle={openHistoryRecord}
            combatSessionId="free"
            onBattleUiActive={setCombatBattleUiActive}
            onPersistenceState={setGameSaveState}
            onBattleStart={(meta = {}) => {
              if (meta.gameId) recordGameActivity({ gameId: meta.gameId, state: 'started', mode: 'combat', modeRecord: meta.modeRecord });
            }}
            onBattleResult={(outcome, _debrief, meta = {}) => {
              if (meta.gameId) recordGameActivity({
                gameId: meta.gameId,
                state: outcome === 'retired' ? 'cancelled' : 'finished',
                mode: 'combat',
                modeRecord: meta.battleRecord || { variant: 'combat' },
                outcome: outcome === 'retired' ? null : outcome,
              });
            }}
          />
        )}

        {view === 'roguelike' && (
          <RoguelikeScreen
            onExit={goBack}
            onError={setError}
            onHistory={() => navigateTo('history')}
            onViewBattle={openHistoryRecord}
            onBattleUiActive={setCombatBattleUiActive}
            onPersistenceState={setGameSaveState}
          />
        )}

        {view === 'admin' && <AdminScreen onExit={goBack} />}

        {view === 'tournament' && (
          <TournamentScreen
            tournament={tournament}
            onPlay={handlePlayTournament}
            onExit={goBack}
            onReset={handleResetTournament}
            onHistory={() => navigateTo('history')}
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
            onExit={goBack}
            onJumpToMove={jumpToMove}
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
            onExit={goBack}
            onClear={clearAllHistory}
            onShare={(record) => setShareRecord(record)}
            onMovie={openMovie}
            title="Historial de partidas"
            emptyText='Todavía no jugaste ninguna partida. Normal, Torneo, Práctica y Combat Chess quedan todas acá juntas, con "pista inversa" para revisar dónde te equivocaste.'
          />
        )}

        {view === 'replay' && replayRecord && (
          <ReplayScreen record={replayRecord} initialStep={replayInitialStep} pinnedReport={pinnedReport} crimeMode={replayCrimeMode} movieMode={replayMovieMode} onPlayFromHere={handlePlayFromHere} onExit={goBack} />
        )}

        {view === 'combatReplay' && combatReplayRecord && (
          <CombatReplayScreen record={combatReplayRecord} initialStep={replayInitialStep} pinnedReport={pinnedReport} onExit={goBack} />
        )}

        {view === 'tournamentGame' && tournamentGame && (
          <GameScreen
            game={tournamentGame}
            setGame={setTournamentGame}
            onExit={handleExitTournamentGame}
            onError={setError}
            onPersistenceState={setGameSaveState}
            onGameEnd={handleTournamentGameEnd}
            onChatUpdate={handleGameChatUpdate}
            hintMode="paid"
            tournamentLevel={levelForPoints(tournament.progressPoints || 0)}
            points={tournament.points}
            onSpendPoints={handleSpendPoints}
            onCapturePoints={handleCapturePoints}
            onShareResult={(outcome) => setShareRecord(buildLiveShareRecord(tournamentGame, outcome, 'tournament', null))}
            onShareIncident={(moveReport, _report, outcome) => setShareRecord({ ...buildLiveShareRecord(tournamentGame, outcome, 'tournament', null), incident: { moveNumber: moveReport.moveNumber, played: moveReport.played, suggested: moveReport.suggested, loss: moveReport.loss } })}
            onOpenCrimeScene={(moveReport, _report, meta) => openGameCrimeScene(tournamentGame, moveReport, 'tournament', meta?.outcome)}
          />
        )}

        {shareRecord && <ShareResultModal record={shareRecord} onClose={() => setShareRecord(null)} />}
        </React.Suspense>
      </div>
      </ErrorBoundary>
    </>
  );
}

function GlobalMusicDock({ isAdminUser, onAdmin }) {
  return (
    <div className="global-music-dock" aria-label="Reproductor global">
      <React.Suspense fallback={null}>
        <MusicPlayer />
      </React.Suspense>
      <LiveServiceStatus isAdminUser={isAdminUser} onAdmin={onAdmin} />
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
    // El motor de audio es grande y no hace falta ni en login ni en enlaces
    // públicos. Se carga sólo cuando existe una sesión real con perfil listo.
    if (!loggedIn || !ready) return undefined;
    let cancelled = false;
    let audio = null;
    import('./sound.js').then((module) => {
      audio = module;
      if (cancelled) {
        module.stopAmbientMusic();
        return;
      }
      module.startAmbientMusic();
    }).catch(() => {});
    return () => {
      cancelled = true;
      audio?.stopAmbientMusic?.();
    };
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
