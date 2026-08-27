import React, { useEffect, useRef, useState } from 'react';
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
import { loadCombatHistory } from './combatHistory.js';
const PuzzleScreen = React.lazy(() => import('./components/PuzzleScreen.jsx'));
const DailyChallengesScreen = React.lazy(() => import('./components/DailyChallengesScreen.jsx'));
const CombatScreen = React.lazy(() => import('./components/CombatScreen.jsx'));
const RoguelikeScreen = React.lazy(() => import('./components/RoguelikeScreen.jsx'));
import PlayerStatusBar from './components/PlayerStatusBar.jsx';
import RatingDetailModal from './components/RatingDetailModal.jsx';
import CombatArmySummaryModal from './components/CombatArmySummaryModal.jsx';
const MusicPlayer = React.lazy(() => import('./components/MusicPlayer.jsx'));
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { api, STORAGE_KEY } from './api.js';
import { loadTournament, saveTournament, resetTournament, applyResult, applyCaptureReward, difficultyForLevel, levelForPoints } from './tournament.js';
import { saveGameRecord, updateGameRecordChat } from './gameHistory.js';
import { recordGameActivity } from './gameActivity.js';
import { humanMoveCount, isCompletedGameOutcome, shouldApplyCompetitiveProgress, gameExitDisposition } from './gameOutcome.js';
import { gameModeFromContext } from './gameModes.js';
import { loadRoster as loadCombatRoster } from './combatRoster.js';
import { loadCombatService, summarizeCombatService } from './combatService.js';
import { loadRating, saveRating, ratingChangeDetails, ratingScoreForOutcome, recordRatingHistory, loadRatingHistory } from './playerRating.js';
import { handicapForGap } from './handicap.js';
const InsightsScreen = React.lazy(() => import('./components/InsightsScreen.jsx'));
import { timeControlById } from './clock.js';
import { clearClockSnapshot } from './clockPersistence.js';
import { checkAchievements } from './achievements.js';
const AdminScreen = React.lazy(() => import('./components/AdminScreen.jsx'));
import LiveServiceStatus from './components/LiveServiceStatus.jsx';
import SaveStatusBadge from './components/SaveStatusBadge.jsx';
import ReleaseUpdateNotice from './components/ReleaseUpdateNotice.jsx';
import UserSettingsPanel from './components/UserSettingsPanel.jsx';
import AccountModal from './components/AccountModal.jsx';
import UserReleaseNotesModal from './components/UserReleaseNotesModal.jsx';
const FeedbackModal = React.lazy(() => import('./components/FeedbackModal.jsx'));
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
import { useAuthenticatedApp } from './useAuthenticatedApp.js';
import { useAuthenticatedAudio } from './useAuthenticatedAudio.js';
import { usePlayerPortraitRefresh } from './usePlayerPortraitRefresh.js';
import { useProfileSyncLifecycle } from './useProfileSyncLifecycle.js';
import { useReplayLibrary } from './useReplayLibrary.js';
import { logout } from './auth.js';
import { pushProfileToServer } from './profileBackup.js';
import { setAdminPreviewAccess } from './adminPreview.js';
import { DEFAULT_FEATURE_FLAGS, normalizeFeatureFlags } from './featureFlags.js';
import { userFacingError } from './userFacingError.js';
import { setFrontendTelemetryContext, startFrontendTelemetry } from './frontendTelemetry.js';
import { APP_RELEASE } from './release.js';
import { USER_RELEASE_NOTES_KEY } from './userReleaseNotes.js';
import { setProfileStorageItem } from './profileKeys.js';

// 'menu' | 'game' | 'tutorial' | 'openings' | 'tournament' | 'tournamentGame' | 'puzzle' | 'combat' | 'history' | 'replay'
function AppInner({ isAdminUser }) {
  useEffect(() => {
    setAdminPreviewAccess(isAdminUser);
  }, [isAdminUser]);

  useEffect(() => startFrontendTelemetry(), []);

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
  const [insightsLandingSection, setInsightsLandingSection] = useState('diagnosis');

  usePresenceHeartbeat(view);

  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSavedGame, setHasSavedGame] = useState(() => !!getStorageItem(STORAGE_LOCAL, STORAGE_KEY) || !!loadActiveGameSession());
  const [learningMode, setLearningMode] = useState(() => getStorageItem(STORAGE_LOCAL, LEARNING_STORAGE_KEY) === '1');

  const [tournament, setTournament] = useState(() => loadTournament());
  const [tournamentGame, setTournamentGame] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [casualResult, setCasualResult] = useState(null);
  const [exitNotice, setExitNotice] = useState(null);
  const {
    historyList, setHistoryList,
    combatHistoryList, setCombatHistoryList,
    replayRecord, setReplayRecord,
    combatReplayRecord,
    replayInitialStep, setReplayInitialStep,
    pinnedReport, setPinnedReport,
    replayCrimeMode, setReplayCrimeMode,
    replayMovieMode,
    allHistory, insights,
    jumpToMove, openHistoryRecord, clearAllHistory, openMovie,
  } = useReplayLibrary({ navigateTo });
  usePlayerPortraitRefresh(insights);

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
  const [combatOverview, setCombatOverview] = useState(() => {
    const roster = loadCombatRoster();
    const service = summarizeCombatService(loadCombatService());
    return { credits: roster.credits || 0, rank: service.rank, nextProgress: service.nextProgress };
  });
  const [activeTimeControl, setActiveTimeControl] = useState(null);
  const [activeSeries, setActiveSeries] = useState(() => loadActiveSeries());
  const [shareRecord, setShareRecord] = useState(null);
  const [puzzleLaunch, setPuzzleLaunch] = useState({ source: 'curated', rush: false, filter: null, dailySlot: 'tactic' });
  const [activeContract, setActiveContract] = useState(() => loadActiveContract());
  const [specialRun, setSpecialRun] = useState(() => loadSpecialRun());
  const [gameContext, setGameContext] = useState({});
  const [showRatingDetail, setShowRatingDetail] = useState(false);
  const [showCombatSummary, setShowCombatSummary] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGlobalAccount, setShowGlobalAccount] = useState(false);
  const [showGlobalReleaseNotes, setShowGlobalReleaseNotes] = useState(false);
  const [releaseNotesSeen, setReleaseNotesSeen] = useState(() => getStorageItem(STORAGE_LOCAL, USER_RELEASE_NOTES_KEY) === APP_RELEASE);
  const [showGlobalFeedback, setShowGlobalFeedback] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const accountMenuRef = useRef(null);
  const accountMenuButtonRef = useRef(null);
  const [gameSaveState, setGameSaveState] = useState(SAVE_STATUS.SAVED);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(null);
  const [featureFlags, setFeatureFlags] = useState(() => ({ ...DEFAULT_FEATURE_FLAGS }));

  useProfileSyncLifecycle(view);

  useEffect(() => {
    let active = true;
    api.getFeatures()
      .then((payload) => { if (active) setFeatureFlags(normalizeFeatureFlags(payload)); })
      .catch(() => { /* defaults mantienen el producto operativo con backend antiguo/offline */ });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!showAccountMenu) return undefined;
    function closeOnOutsidePointer(event) {
      if (!accountMenuRef.current?.contains(event.target)) setShowAccountMenu(false);
    }
    function closeOnEscape(event) {
      if (event.key !== 'Escape') return;
      setShowAccountMenu(false);
      accountMenuButtonRef.current?.focus();
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showAccountMenu]);

  async function handleGlobalLogout() {
    setLogoutError(null);
    setLoggingOut(true);
    try {
      await pushProfileToServer({ throwOnError: true });
      logout();
      window.location.reload();
    } catch (error) {
      if (error?.status === 401) {
        logout();
        window.location.reload();
        return;
      }
      setLogoutError('No se pudo guardar tu progreso. Reintenta cuando vuelva la conexión.');
      setLoggingOut(false);
    }
  }


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
    const combatRoster = loadCombatRoster();
    const combatService = summarizeCombatService(loadCombatService());
    setCombatOverview({ credits: combatRoster.credits || 0, rank: combatService.rank, nextProgress: combatService.nextProgress });
    setCombatHistoryList(loadCombatHistory());
    checkAchievements();
  }, [view]);

  async function handleNewGame(difficulty, color, opts) {
    setExitNotice(null);
    setCasualResult(null);
    setLoading(true);
    setError(null);
    try {
      const handicap = handicapForGap(rating.rating, difficulty);
      const created = await api.createGame(difficulty, color, handicap?.id ?? null, null, opts?.ghostStyle || null);
      const isLearning = !!opts?.learning;
      const nextContext = { rematch: !!opts?.rematch, adaptiveDifficulty: !!opts?.adaptiveDifficulty, runMode: opts?.runMode || null, lab: !!opts?.lab, rescue: !!opts?.rescue, suddenDeath: !!opts?.suddenDeath, threatCheck: !!opts?.threatCheck, ghost: !!opts?.ghost, ghostStyle: opts?.ghostStyle || null };
      setLearningMode(isLearning);
      setActiveTimeControl(timeControlById(opts?.timeControlId));
      setGameContext(nextContext);
      recordGameActivity({ gameId: created.id, state: 'started', mode: gameModeFromContext({ learningMode: isLearning, gameContext: nextContext }), detail: nextContext.adaptiveDifficulty ? 'adaptive-difficulty' : null });
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
      setError(userFacingError(e, 'No se pudo iniciar la partida.'));
    } finally {
      setLoading(false);
    }
  }


  function handleExitGame() {
    if (game?.id) {
      if (casualResult?.gameId === game.id) {
        setExitNotice(casualResult);
      } else {
      const trainingPosition = !!(gameContext.lab || gameContext.rescue || gameContext.suddenDeath);
      const exitDisposition = gameExitDisposition({ moveCount: humanMoveCount(game.history?.length || 0, game.humanColor), isGameOver: !!game.isGameOver, learningMode, trainingPosition, explicitAction: true });
      if (exitDisposition === 'forfeit') {
        const summary = handleCasualGameEnd('loss', game, { endReason: 'resignation' });
        setExitNotice(summary);
      } else {
        recordGameActivity({ gameId: game.id, state: 'cancelled', mode: gameModeFromContext({ learningMode, gameContext }) });
        setExitNotice({ outcome: 'cancelled', title: 'Partida cancelada', detail: 'No hiciste ninguna jugada. Tu rating no cambia.', ratingApplied: false });
      }
      }
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
    if (!finishedGame || !isCompletedGameOutcome(outcome)) return null;
    clearClockSnapshot(finishedGame.id);
    const moveSans = (finishedGame.history || []).map((m) => m.san).filter(Boolean);
    const opening = identifyOpening(moveSans);
    let seriesSnapshot = activeSeries;
    const trainingPosition = !!(gameContext.lab || gameContext.rescue || gameContext.suddenDeath);

    let ratingSummary = { ratingApplied: false };
    if (shouldApplyCompetitiveProgress(outcome, { learningMode, trainingPosition })) {
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
      const details = ratingChangeDetails(rating, finishedGame.difficulty, score);
      saveRating(details.next);
      recordRatingHistory(details.next.rating);
      setRating(details.next);
      ratingSummary = {
        ratingApplied: true,
        eloDelta: details.delta,
        eloBefore: rating.rating,
        eloAfter: details.next.rating,
      };
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
    const title = endMeta.endReason === 'resignation'
      ? 'Abandono registrado como derrota'
      : outcome === 'win' ? 'Victoria' : outcome === 'draw' ? 'Tablas' : 'Derrota';
    const detail = ratingSummary.ratingApplied
      ? `Rating ${ratingSummary.eloDelta >= 0 ? '+' : ''}${ratingSummary.eloDelta} · ${ratingSummary.eloBefore} → ${ratingSummary.eloAfter}`
      : 'Esta modalidad no afecta a tu rating.';
    const summary = { gameId: finishedGame.id, outcome, title, detail, endReason: endMeta.endReason || null, ...ratingSummary };
    setCasualResult(summary);
    if (specialRun?.active && gameContext.runMode) {
      const nextRun = recordSpecialRunResult(specialRun, outcome);
      setSpecialRun(nextRun);
    }
    return summary;
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
      setError(userFacingError(e, 'No se pudo crear la siguiente partida de la serie.'));
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
      setError(userFacingError(e, 'No se pudo arrancar la posición del laboratorio.'));
    } finally { setLoading(false); }
  }

  function openPuzzleMode(source = 'curated', rush = false, filter = null, dailySlot = 'tactic') {
    setPuzzleLaunch({ source, rush, filter, dailySlot });
    navigateTo('puzzle');
  }

  function openDailyChallengeSlot(slot = 'tactic') {
    openPuzzleMode('daily', false, null, slot);
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
      setError(userFacingError(e, 'No se pudo iniciar el desafío.'));
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
      setError(userFacingError(e, 'No se pudo iniciar la partida.'));
    } finally {
      setLoading(false);
    }
  }

  function handleTournamentGameEnd(outcome, finishedGame, endMeta = {}) {
    if (!isCompletedGameOutcome(outcome)) return;
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
    if (tournamentGame?.id) {
      const exitDisposition = gameExitDisposition({ moveCount: tournamentGame.history?.length || 0, isGameOver: !!tournamentGame.isGameOver, explicitAction: true });
      if (exitDisposition === 'forfeit') handleTournamentGameEnd('loss', tournamentGame, { endReason: 'resignation' });
      else recordGameActivity({ gameId: tournamentGame.id, state: 'cancelled', mode: 'tournament' });
    }
    clearActiveGameSession();
    setHasSavedGame(!!getStorageItem(STORAGE_LOCAL, STORAGE_KEY));
    setTournamentGame(null);
    goBack();
  }

  function handleResetTournament() {
    setTournament(resetTournament());
    setLastResult(null);
  }

  useEffect(() => {
    setFrontendTelemetryContext(view);
  }, [view]);

  const isBoardGameView = view === 'game' || view === 'tournamentGame' || combatBattleUiActive;

  return (
    <>
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      {!isBoardGameView && <GlobalMusicDock isAdminUser={isAdminUser} onAdmin={() => navigateTo('admin')} />}
      <ReleaseUpdateNotice deferReload={isBoardGameView} />
      <ErrorBoundary
        view={view}
        onReset={resetNavigation}
        onRecover={recoverSessionFromBoundary}
        canRecover={Boolean(game?.id || tournamentGame?.id || loadActiveGameSession()?.gameId || view === 'combat' || view === 'roguelike')}
      >
      <div className="app-shell" id="main-content" tabIndex={-1}>
        <div className={`masthead ${isBoardGameView ? 'masthead-game-compact' : ''}`}>
          <div className="masthead-top-row">
            <div className="masthead-text">
              {!isBoardGameView && <span className="masthead-kicker">JUEGA · APRENDE · COMPITE</span>}
              {isBoardGameView ? <span className="game-wordmark">Chess Studio</span> : <h1>Chess Studio</h1>}
            </div>
            <div className="masthead-actions">
              {((view === 'game' || view === 'tournamentGame') && (game?.id || tournamentGame?.id) || combatBattleUiActive) && (
                <SaveStatusBadge state={gameSaveState} />
              )}
              <button
                type="button"
                className="masthead-feedback-trigger"
                onClick={() => setShowGlobalFeedback(true)}
                aria-label="Enviar feedback"
                title="Enviar feedback"
              >
                <span aria-hidden="true">✦</span>
                <span>Feedback</span>
              </button>
              <div className="masthead-account-stack">
                <div className="masthead-account-menu" ref={accountMenuRef}>
                  <button
                    ref={accountMenuButtonRef}
                    type="button"
                    className="masthead-account-trigger"
                    onClick={() => setShowAccountMenu((open) => !open)}
                    aria-label="Abrir menú de cuenta"
                    aria-haspopup="menu"
                    aria-expanded={showAccountMenu}
                  >
                    <span className="masthead-account-avatar" aria-hidden="true">♙</span>
                    <span>Mi cuenta</span>
                    <span className="masthead-account-chevron" aria-hidden="true">⌄</span>
                  </button>
                  {showAccountMenu && (
                    <div className="masthead-account-popover" role="menu" aria-label="Cuenta">
                      <button type="button" role="menuitem" onClick={() => { setShowAccountMenu(false); setShowGlobalAccount(true); }}>
                        <span aria-hidden="true">♙</span><span><b>Mi cuenta</b><small>Perfil y preferencias</small></span>
                      </button>
                    {isAdminUser && (
                      <button type="button" role="menuitem" className="masthead-account-menu-admin" onClick={() => { setShowAccountMenu(false); navigateTo('admin'); }}>
                        <span aria-hidden="true">◉</span><span><b>Administración</b><small>Usuarios y operación</small></span>
                      </button>
                    )}
                    <button type="button" role="menuitem" onClick={() => { setShowAccountMenu(false); setInsightsLandingSection('diagnosis'); navigateTo('insights'); }}>
                      <span aria-hidden="true">◫</span><span><b>Mi progreso</b><small>Diagnóstico y siguiente mejora</small></span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => { setShowAccountMenu(false); setShowSettings(true); }}>
                      <span aria-hidden="true">⚙</span><span><b>Personalizar</b><small>Tablero, piezas y sonido</small></span>
                    </button>
                    <div className="masthead-account-menu-separator" role="separator" />
                    <button type="button" role="menuitem" className="masthead-account-menu-logout" onClick={() => { setShowAccountMenu(false); void handleGlobalLogout(); }} disabled={loggingOut}>
                      <span aria-hidden="true">↪</span><span><b>{loggingOut ? 'Guardando…' : 'Cerrar sesión'}</b><small>Guarda antes de salir</small></span>
                    </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={`masthead-release-trigger ${releaseNotesSeen ? '' : 'is-new'}`}
                  onClick={() => { setProfileStorageItem(USER_RELEASE_NOTES_KEY, APP_RELEASE); setReleaseNotesSeen(true); setShowGlobalReleaseNotes(true); }}
                  aria-label={releaseNotesSeen ? 'Abrir novedades' : 'Abrir novedades nuevas'}
                >
                  <span aria-hidden="true">✦</span>
                  <span>Novedades{releaseNotesSeen ? '' : ' · Nuevo'}</span>
                </button>
              </div>
            </div>
          </div>
          {logoutError && <p className="error-text masthead-session-error" role="alert">{logoutError}</p>}
          {!isBoardGameView && (
            <PlayerStatusBar
              tournament={tournament}
              combatOverview={combatOverview}
              rating={rating}
              onTournamentClick={() => navigateTo('tournament')}
              onCombatClick={() => setShowCombatSummary(true)}
              onRatingClick={() => setShowRatingDetail(true)}
            />
          )}
          {!isBoardGameView && view !== 'menu' && view !== 'insights' && (
            <div className="navigation-back-hint">ESC o clic derecho · volver / cerrar</div>
          )}
        </div>

        {!isBoardGameView && exitNotice && (
          <div className={`session-result-notice outcome-${exitNotice.outcome}`} role="status" aria-live="polite">
            <div><strong>{exitNotice.title}</strong><span>{exitNotice.detail}</span></div>
            <button type="button" aria-label="Cerrar resumen de la partida" onClick={() => setExitNotice(null)}>×</button>
          </div>
        )}

        {showRatingDetail && (
          <RatingDetailModal rating={rating} onClose={() => setShowRatingDetail(false)} />
        )}
        {showCombatSummary && (
          <CombatArmySummaryModal
            roster={loadCombatRoster()}
            onClose={() => setShowCombatSummary(false)}
            onOpenCombat={() => { setShowCombatSummary(false); navigateTo('roguelike'); }}
          />
        )}
        {showSettings && <UserSettingsPanel isAdminUser={isAdminUser} onClose={() => setShowSettings(false)} onBoard3D={() => { setShowSettings(false); navigateTo('board3d'); }} />}
        {showGlobalAccount && <AccountModal rating={rating} tournament={tournament} combatOverview={combatOverview} onClose={() => setShowGlobalAccount(false)} onLogout={() => void handleGlobalLogout()} loggingOut={loggingOut} />}
        {showGlobalReleaseNotes && <UserReleaseNotesModal onClose={() => setShowGlobalReleaseNotes(false)} />}
        {showGlobalFeedback && <FeedbackModal context={view === 'menu' ? 'Home' : `Global · ${view}`} onClose={() => setShowGlobalFeedback(false)} />}

        <React.Suspense fallback={<div className="route-loading" role="status">Cargando…</div>}>
        {((view === 'game' && !game) || (view === 'tournamentGame' && !tournamentGame)) && (
          <div className="route-loading active-session-recovery" role="status">
            {error ? (
              <>
                <strong>La partida sigue guardada.</strong>
                <span>{error}</span>
                <div className="active-session-recovery-actions">
                  <button type="button" className="primary-btn" onClick={continueActiveSession} disabled={loading}>
                    {loading ? 'Reintentando…' : 'Reintentar recuperación'}
                  </button>
                  <button type="button" className="secondary-btn" onClick={resetNavigation}>Volver al menú</button>
                </div>
              </>
            ) : 'Restaurando partida en curso…'}
          </div>
        )}
        {view === 'menu' && (
          <Menu
            onNewGame={handleNewGame}
            onContinue={continueActiveSession}
            onTournament={() => navigateTo('tournament')}
            onTutorial={() => navigateTo('tutorial')}
            onOpenings={() => navigateTo('openings')}
            onPuzzle={() => openPuzzleMode('curated', false)}
            onDailyChallenge={() => navigateTo('dailyChallenges')}
            onTrainPersonal={() => openPuzzleMode('personal', false)}
            onSpectator={() => navigateTo('spectator')}
            onCombat={() => navigateTo('combat')}
            onCombatRoguelike={() => navigateTo('roguelike')}
            onHistory={() => navigateTo('history')}
            onInsights={() => { setInsightsLandingSection('diagnosis'); navigateTo('insights'); }}
            onProgress={() => { setInsightsLandingSection('career'); navigateTo('insights'); }}
            onLab={() => navigateTo('lab')}
            hasSavedGame={hasSavedGame}
            loading={loading}
            error={error}
            tournament={tournament}
            rating={rating}
            combatProgress={combatOverview}
            suppressHomeNudge={showSettings || showGlobalAccount || showGlobalReleaseNotes || showGlobalFeedback}
            features={featureFlags}
          />
        )}

        {view === 'game' && game && (
          <GameScreen
            game={game}
            setGame={setGame}
            onExit={handleExitGame}
            onError={setError}
            onPersistenceState={setGameSaveState}
            onCustomize={() => setShowSettings(true)}
            onGameEnd={handleCasualGameEnd}
            resultSummary={casualResult?.gameId === game.id ? casualResult : null}
            abandonRatingPreview={!learningMode && !gameContext.lab && !gameContext.rescue && !gameContext.suddenDeath ? (() => { const preview = ratingChangeDetails(rating, game.difficulty, 0); return { delta: preview.delta, before: rating.rating, after: preview.next.rating }; })() : null}
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
            memoryContext={gameContext}
            onTrainPersonal={() => openPuzzleMode('personal', false)}
            postGameFeedbackEnabled={featureFlags.postGameFeedback}
          />
        )}

        {view === 'tutorial' && <Tutorial onExit={goBack} />}
        {view === 'openings' && <OpeningsScreen onExit={goBack} />}

        {view === 'dailyChallenges' && (
          <DailyChallengesScreen onExit={goBack} onPlay={openDailyChallengeSlot} />
        )}

        {view === 'puzzle' && (
          <PuzzleScreen key={`${puzzleLaunch.source}-${puzzleLaunch.rush}-${puzzleLaunch.filter?.opening || 'all'}-${puzzleLaunch.dailySlot || 'tactic'}`} initialSource={puzzleLaunch.source} rushMode={puzzleLaunch.rush} initialFilter={puzzleLaunch.filter} dailySlot={puzzleLaunch.dailySlot} onExit={goBack} points={tournament.points} onSpendPoints={handleSpendPoints} />
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
            onCustomize={() => setShowSettings(true)}
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
            isAdminUser={isAdminUser}
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
            initialSection={insightsLandingSection}
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
            isAdminUser={isAdminUser}
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
            emptyText='Todavía no jugaste ninguna partida. Normal, Torneo, Partida de práctica y Combat Chess quedan todas acá juntas, con "pista inversa" para revisar dónde te equivocaste.'
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
            abandonRatingPreview={(() => { const preview = ratingChangeDetails(rating, tournamentGame.difficulty, 0); return { delta: preview.delta, before: rating.rating, after: preview.next.rating }; })()}
            onChatUpdate={handleGameChatUpdate}
            hintMode="paid"
            tournamentLevel={levelForPoints(tournament.progressPoints || 0)}
            points={tournament.points}
            onSpendPoints={handleSpendPoints}
            onCapturePoints={handleCapturePoints}
            onShareResult={(outcome) => setShareRecord(buildLiveShareRecord(tournamentGame, outcome, 'tournament', null))}
            onShareIncident={(moveReport, _report, outcome) => setShareRecord({ ...buildLiveShareRecord(tournamentGame, outcome, 'tournament', null), incident: { moveNumber: moveReport.moveNumber, played: moveReport.played, suggested: moveReport.suggested, loss: moveReport.loss } })}
            onOpenCrimeScene={(moveReport, _report, meta) => openGameCrimeScene(tournamentGame, moveReport, 'tournament', meta?.outcome)}
            postGameFeedbackEnabled={featureFlags.postGameFeedback}
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
        <MusicPlayer ownsMediaSession />
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
  const { loggedIn, setLoggedIn, ready, isAdminUser, syncError, retryBootstrap } = useAuthenticatedApp();
  useAuthenticatedAudio(loggedIn, ready);

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
              <span className="eyebrow">Chess Studio</span>
              <h2>{syncError ? 'No se pudo sincronizar' : 'Sincronizando tu perfil…'}</h2>
              {syncError ? (
                <>
                  <p className="error-text" role="alert">{syncError}</p>
                  <button type="button" className="primary-btn" onClick={retryBootstrap}>
                    Reintentar
                  </button>
                </>
              ) : (
                <p className="hint-text" role="status">Cargando tu progreso antes de abrir la aplicación.</p>
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
