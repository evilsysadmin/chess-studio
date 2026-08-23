import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { clearClockSnapshot, loadClockSnapshot } from './clockPersistence.js';
import { checkAchievements } from './achievements.js';
import { pullProfileFromServer, pushProfileToServer, scheduleProfileSync, cancelScheduledProfileSync } from './profileBackup.js';
import { isLoggedIn, fetchMe, logout, touchActivity, watchSessionIdentity } from './auth.js';
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
import { chooseContract, clearActiveContract, clearSpecialRun, loadActiveContract, loadSpecialRun, recordCareerGame, recordSpecialRunResult, reconcileCareerHistory, saveActiveContract, saveSpecialRun, startSpecialRun } from './career.js';
import { loadActiveGameChat } from './gameChat.js';
import { loadSessionView, loadSessionViewHistory, rememberSessionView, rememberSessionViewHistory } from './viewState.js';
import { clearActiveGameSession, loadActiveGameSession, saveActiveGameSession } from './activeGameSession.js';
import { fetchReconnectGame, reconnectTarget } from './gameReconnect.js';

// Guarda si la partida activa es "Partida de práctica" (pistas gratis) por separado del propio
// objeto de partida: ese objeto se reemplaza por completo con cada respuesta
// del servidor (que no sabe nada de esta marca, es solo del cliente), así
// que si viviera ahí se perdería en la primera jugada.
const LEARNING_STORAGE_KEY = 'chess-study-active-game-learning';

// 'menu' | 'game' | 'tutorial' | 'openings' | 'tournament' | 'tournamentGame' | 'puzzle' | 'combat' | 'history' | 'replay'
function AppInner({ isAdminUser }) {
  const [view, setViewRaw] = useState(() => loadActiveGameSession()?.route || loadSessionView({ isAdminUser }));
  const [combatBattleUiActive, setCombatBattleUiActive] = useState(false);

  const coarseActivity = useMemo(() => ({
    menu: 'Menú principal',
    game: 'Partida',
    tournament: 'Torneo',
    tournamentGame: 'Torneo',
    combat: 'Combat Chess',
    roguelike: 'Combat Chess',
    combatReplay: 'Replay',
    replay: 'Replay',
    insights: 'Así juegas',
    history: 'Historial',
    puzzle: 'Puzzle',
    tutorial: 'Aprendizaje',
    openings: 'Aperturas',
    lab: 'Laboratorio',
    spectator: 'Espectador',
    admin: 'Panel admin',
    board3d: 'Experimento 3D',
  }[view] || 'Navegando'), [view]);

  useEffect(() => {
    const reportPresence = () => {
      const foreground = typeof document === 'undefined' ? null : document.visibilityState === 'visible';
      touchActivity(coarseActivity, foreground);
    };
    const handleVisibility = () => reportPresence();

    reportPresence();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') reportPresence();
    }, 120000);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [coarseActivity]);
  const currentViewRef = useRef(view);
  const viewHistoryRef = useRef(loadSessionViewHistory({ isAdminUser }));
  currentViewRef.current = view;

  function navigateTo(nextView) {
    const current = currentViewRef.current;
    if (!nextView || nextView === current) return;
    viewHistoryRef.current = [...viewHistoryRef.current, current].slice(-40);
    rememberSessionViewHistory(viewHistoryRef.current);
    currentViewRef.current = nextView;
    setViewRaw(nextView);
  }

  function goBack() {
    const history = [...viewHistoryRef.current];
    const current = currentViewRef.current;
    let previous = history.pop();
    while (previous === current && history.length) previous = history.pop();
    previous = previous && previous !== current ? previous : 'menu';
    viewHistoryRef.current = history;
    rememberSessionViewHistory(history);
    currentViewRef.current = previous;
    setViewRaw(previous);
  }

  function resetNavigation() {
    viewHistoryRef.current = [];
    rememberSessionViewHistory([]);
    currentViewRef.current = 'menu';
    setViewRaw('menu');
  }

  async function recoverSessionFromBoundary() {
    const saved = loadActiveGameSession();
    if (saved?.gameId) return restoreActiveSession(saved);

    // Última red: si el error ocurrió justo al entrar al tablero, el effect que
    // persiste el snapshot puede no haber llegado a ejecutarse todavía. El id
    // vivo en React basta para pedir de nuevo la partida al backend.
    if (tournamentGame?.id) {
      return restoreActiveSession({ route: 'tournamentGame', gameId: tournamentGame.id });
    }
    if (game?.id) {
      return restoreActiveSession({
        route: 'game',
        gameId: game.id,
        learningMode,
        gameContext,
        timeControlId: activeTimeControl?.id || null,
      });
    }

    // Combat Chess ya conserva su batalla en combatSession/sessionStorage. Al
    // cerrar el fallback React remonta CombatScreen/RoguelikeScreen y sus
    // controladores rehidratan esa sesión sin degradarla a Setup.
    if (currentViewRef.current === 'combat' || currentViewRef.current === 'roguelike') return true;
    return false;
  }
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSavedGame, setHasSavedGame] = useState(() => !!localStorage.getItem(STORAGE_KEY) || !!loadActiveGameSession());
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
  const gameRef = useRef(game);
  const tournamentGameRef = useRef(tournamentGame);
  const gameSaveStateRef = useRef(gameSaveState);
  gameRef.current = game;
  tournamentGameRef.current = tournamentGame;
  gameSaveStateRef.current = gameSaveState;

  // Conserva la última pantalla reconstruible durante esta pestaña/sesión.
  // Las vistas efímeras (partida/replay) no pisan el padre seguro guardado.
  useEffect(() => {
    rememberSessionView(view);
  }, [view]);

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

  // Snapshot local de la sesión activa. Mongo sigue siendo la fuente de verdad
  // para el tablero, pero este sobre conserva la ruta y el contexto cliente
  // (práctica/variantes/reloj) para que un refresh o un deploy pueda volver
  // exactamente a la partida en curso. Torneo usa el mismo mecanismo.
  useEffect(() => {
    let persisted = null;
    if (view === 'game' && game?.id) {
      persisted = saveActiveGameSession({
        route: 'game',
        game,
        learningMode,
        gameContext,
        timeControlId: activeTimeControl?.id || null,
      });
    } else if (view === 'tournamentGame' && tournamentGame?.id) {
      persisted = saveActiveGameSession({ route: 'tournamentGame', game: tournamentGame });
    }

    // "Guardado" significa dos cosas a la vez: el backend ya confirmó este
    // objeto de partida y el sobre local necesario para sobrevivir a F5/deploy
    // también quedó escrito. Si localStorage falla, no pintamos un verde falso.
    if (persisted) setGameSaveState(SAVE_STATUS.SAVED);
    else if ((view === 'game' && game?.id) || (view === 'tournamentGame' && tournamentGame?.id)) {
      setGameSaveState(SAVE_STATUS.ERROR);
    }
  }, [view, game, tournamentGame, learningMode, gameContext, activeTimeControl?.id]);

  // Si el navegador estuvo realmente offline, al volver la red reconciliamos
  // la partida abierta con la copia autoritativa del backend. No intentamos
  // fusionar tableros: las mutaciones normales ya revierten a la última
  // posición confirmada cuando fallan, así que Mongo gana siempre.
  const reconnectInFlight = useRef(false);
  const reconnectNeeded = useRef(typeof navigator !== 'undefined' && navigator.onLine === false);
  const reconnectOfflineGeneration = useRef(0);
  useEffect(() => {
    let disposed = false;
    async function handleOnline() {
      if (reconnectInFlight.current) return;
      if (!reconnectNeeded.current && gameSaveStateRef.current !== SAVE_STATUS.ERROR) return;

      const target = reconnectTarget({
        route: currentViewRef.current,
        game: gameRef.current,
        tournamentGame: tournamentGameRef.current,
        savedSession: loadActiveGameSession(),
      });
      if (!target) {
        reconnectNeeded.current = false;
        return;
      }

      reconnectInFlight.current = true;
      const offlineGenerationAtStart = reconnectOfflineGeneration.current;
      setGameSaveState(SAVE_STATUS.SAVING);
      const result = await fetchReconnectGame(target.gameId, api.getGame);
      if (disposed) return;

      // El usuario pudo abandonar/cambiar de pantalla mientras el GET estaba
      // volando. En ese caso descartamos la respuesta tardía por completo.
      const currentTarget = reconnectTarget({
        route: currentViewRef.current,
        game: gameRef.current,
        tournamentGame: tournamentGameRef.current,
        savedSession: loadActiveGameSession(),
      });
      if (!currentTarget || currentTarget.route !== target.route || currentTarget.gameId !== target.gameId) {
        reconnectInFlight.current = false;
        return;
      }

      if (result.ok) {
        if (target.route === 'tournamentGame') setTournamentGame(result.game);
        else setGame(result.game);
        setError(null);
        // Si volvió a caer la red mientras esta reconciliación estaba en vuelo,
        // el siguiente evento online debe comprobar otra vez el backend.
        reconnectNeeded.current = reconnectOfflineGeneration.current !== offlineGenerationAtStart
          || (typeof navigator !== 'undefined' && navigator.onLine === false);
        // El effect de activeGameSession será quien marque SAVED después de
        // confirmar que el snapshot local de esta respuesta también se escribió.
      } else {
        setGameSaveState(SAVE_STATUS.ERROR);
        setError('La conexión volvió, pero todavía no se pudo resincronizar la partida. La última posición confirmada sigue intacta.');
      }
      reconnectInFlight.current = false;
    }

    const handleOffline = () => {
      reconnectOfflineGeneration.current += 1;
      reconnectNeeded.current = true;
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      disposed = true;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // En un deploy el navegador puede recargar el documento para obtener los
  // chunks nuevos. Si había una sesión activa, la rehidratamos de Mongo sin
  // obligar al usuario a volver al Home y pulsar "Continuar".
  const startupRestoreAttempted = useRef(false);
  useEffect(() => {
    const saved = loadActiveGameSession();
    if (!saved || startupRestoreAttempted.current) return;
    startupRestoreAttempted.current = true;
    restoreActiveSession(saved);
  }, []);

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

  async function restoreActiveSession(saved = loadActiveGameSession()) {
    if (!saved?.gameId) return false;
    setLoading(true);
    setError(null);
    setGameSaveState(SAVE_STATUS.SAVING);
    try {
      const found = await api.getGame(saved.gameId);
      if (saved.route === 'tournamentGame') {
        setTournamentGame(found);
        currentViewRef.current = 'tournamentGame';
        setViewRaw('tournamentGame');
        setHasSavedGame(true);
        return true;
      }

      setGame(found);
      const savedLearning = typeof saved.learningMode === 'boolean'
        ? saved.learningMode
        : localStorage.getItem(LEARNING_STORAGE_KEY) === '1';
      setLearningMode(savedLearning);
      setActiveContract(loadActiveContract());
      const storedRun = loadSpecialRun();
      setSpecialRun(storedRun);
      const restoredContext = saved.gameContext && Object.keys(saved.gameContext).length
        ? saved.gameContext
        : (storedRun?.active && storedRun.currentGameId === found.id
          ? { runMode: storedRun.mode }
          : (found.ghostStyle ? { ghost: true, ghostStyle: found.ghostStyle } : {}));
      setGameContext(restoredContext);

      const storedSeries = loadActiveSeries();
      if (storedSeries?.currentGameId === found.id && !storedSeries.winner) {
        setActiveSeries(storedSeries);
        setActiveTimeControl(timeControlById(storedSeries.timeControlId));
      } else {
        clearActiveSeries();
        setActiveSeries(null);
        const clockSnapshot = loadClockSnapshot(found.id);
        const restoredTimeControlId = saved.timeControlId || clockSnapshot?.timeControlId || null;
        setActiveTimeControl(restoredTimeControlId && restoredTimeControlId !== 'none'
          ? timeControlById(restoredTimeControlId)
          : null);
      }
      localStorage.setItem(STORAGE_KEY, found.id);
      setHasSavedGame(true);
      currentViewRef.current = 'game';
      setViewRaw('game');
      return true;
    } catch (e) {
      // 404/403 = el savegame ya no existe o no pertenece a esta cuenta. Un
      // fallo de red transitorio conserva el snapshot para poder reintentar.
      if (e?.status === 404 || e?.status === 403) {
        clearActiveGameSession();
        localStorage.removeItem(STORAGE_KEY);
        setHasSavedGame(false);
        setError('La partida guardada ya no existe en el servidor.');
      } else {
        setHasSavedGame(true);
        setGameSaveState(SAVE_STATUS.ERROR);
        setError('No se pudo recuperar la partida en curso. Puedes reintentar cuando vuelva el servidor.');
      }
      currentViewRef.current = 'menu';
      setViewRaw('menu');
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleContinue() {
    const savedSession = loadActiveGameSession();
    if (savedSession?.gameId) {
      await restoreActiveSession(savedSession);
      return;
    }

    const savedId = localStorage.getItem(STORAGE_KEY);
    if (!savedId) return;
    // Compatibilidad con perfiles/sesiones anteriores a v16.6dm6: construye
    // un descriptor mínimo y deja que el restaurador común haga el resto.
    await restoreActiveSession({
      route: 'game',
      gameId: savedId,
      learningMode: localStorage.getItem(LEARNING_STORAGE_KEY) === '1',
      gameContext: {},
      timeControlId: loadClockSnapshot(savedId)?.timeControlId || null,
    });
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
    setHasSavedGame(!!localStorage.getItem(STORAGE_KEY));
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
            onContinue={handleContinue}
            onTournament={() => navigateTo('tournament')}
            onTutorial={() => navigateTo('tutorial')}
            onOpenings={() => navigateTo('openings')}
            onPuzzle={() => openPuzzleMode('curated', false)}
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
