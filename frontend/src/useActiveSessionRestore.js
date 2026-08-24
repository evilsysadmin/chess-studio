import { useCallback, useEffect, useRef } from 'react';
import { api, STORAGE_KEY } from './api.js';
import { clearActiveGameSession, loadActiveGameSession } from './activeGameSession.js';
import { loadClockSnapshot } from './clockPersistence.js';
import { timeControlById } from './clock.js';
import { loadActiveContract, loadSpecialRun } from './career.js';
import { clearActiveSeries, loadActiveSeries } from './series.js';
import { SAVE_STATUS } from './saveStatus.js';
import { STORAGE_LOCAL, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';

export const LEARNING_STORAGE_KEY = 'chess-study-active-game-learning';

export function classifyRestoreFailure(error) {
  return error?.status === 404 || error?.status === 403 ? 'stale-session' : 'transient';
}

export function resolveRestoredGameContext(saved, found, storedRun) {
  if (saved?.gameContext && Object.keys(saved.gameContext).length) return saved.gameContext;
  if (storedRun?.active && storedRun.currentGameId === found?.id) return { runMode: storedRun.mode };
  if (found?.ghostStyle) return { ghost: true, ghostStyle: found.ghostStyle };
  return {};
}

export function buildLegacySessionDescriptor({ gameId, learningMode = false, timeControlId = null } = {}) {
  if (!gameId) return null;
  return {
    route: 'game',
    gameId,
    learningMode: !!learningMode,
    gameContext: {},
    timeControlId: timeControlId || null,
  };
}

export function selectBoundaryRecovery({
  saved,
  tournamentGame,
  game,
  learningMode = false,
  gameContext = {},
  timeControlId = null,
  currentView,
} = {}) {
  if (saved?.gameId) return { type: 'session', session: saved };
  if (tournamentGame?.id) {
    return { type: 'session', session: { route: 'tournamentGame', gameId: tournamentGame.id } };
  }
  if (game?.id) {
    return {
      type: 'session',
      session: {
        route: 'game',
        gameId: game.id,
        learningMode: !!learningMode,
        gameContext: gameContext || {},
        timeControlId: timeControlId || null,
      },
    };
  }
  if (currentView === 'combat' || currentView === 'roguelike') return { type: 'combat' };
  return { type: 'none' };
}

export function useActiveSessionRestore({
  currentView,
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
}) {
  const startupRestoreAttempted = useRef(false);

  const restoreActiveSession = useCallback(async (saved = loadActiveGameSession()) => {
    if (!saved?.gameId) return false;
    setLoading(true);
    setError(null);
    setGameSaveState(SAVE_STATUS.SAVING);
    try {
      const found = await api.getGame(saved.gameId);
      if (saved.route === 'tournamentGame') {
        setTournamentGame(found);
        replaceView('tournamentGame');
        setHasSavedGame(true);
        return true;
      }

      setGame(found);
      const savedLearning = typeof saved.learningMode === 'boolean'
        ? saved.learningMode
        : getStorageItem(STORAGE_LOCAL, LEARNING_STORAGE_KEY) === '1';
      setLearningMode(savedLearning);
      setActiveContract(loadActiveContract());
      const storedRun = loadSpecialRun();
      setSpecialRun(storedRun);
      setGameContext(resolveRestoredGameContext(saved, found, storedRun));

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
      setStorageItem(STORAGE_LOCAL, STORAGE_KEY, found.id);
      setHasSavedGame(true);
      replaceView('game');
      return true;
    } catch (error) {
      // 404/403 = el savegame ya no existe o no pertenece a esta cuenta. Un
      // fallo transitorio conserva la sesión para poder reintentar después.
      if (classifyRestoreFailure(error) === 'stale-session') {
        clearActiveGameSession();
        removeStorageItem(STORAGE_LOCAL, STORAGE_KEY);
        setHasSavedGame(false);
        setError('La partida guardada ya no existe en el servidor.');
      } else {
        setHasSavedGame(true);
        setGameSaveState(SAVE_STATUS.ERROR);
        setError('No se pudo recuperar la partida en curso. Puedes reintentar cuando vuelva el servidor.');
      }
      replaceView('menu');
      return false;
    } finally {
      setLoading(false);
    }
  }, [
    replaceView,
    setActiveContract,
    setActiveSeries,
    setActiveTimeControl,
    setError,
    setGame,
    setGameContext,
    setGameSaveState,
    setHasSavedGame,
    setLearningMode,
    setLoading,
    setSpecialRun,
    setTournamentGame,
  ]);

  const continueActiveSession = useCallback(async () => {
    const savedSession = loadActiveGameSession();
    if (savedSession?.gameId) return restoreActiveSession(savedSession);

    const savedId = getStorageItem(STORAGE_LOCAL, STORAGE_KEY);
    if (!savedId) return false;
    const legacy = buildLegacySessionDescriptor({
      gameId: savedId,
      learningMode: getStorageItem(STORAGE_LOCAL, LEARNING_STORAGE_KEY) === '1',
      timeControlId: loadClockSnapshot(savedId)?.timeControlId || null,
    });
    return restoreActiveSession(legacy);
  }, [restoreActiveSession]);

  const recoverSessionFromBoundary = useCallback(async () => {
    const candidate = selectBoundaryRecovery({
      saved: loadActiveGameSession(),
      tournamentGame,
      game,
      learningMode,
      gameContext,
      timeControlId: activeTimeControl?.id || null,
      currentView,
    });
    if (candidate.type === 'combat') return true;
    if (candidate.type === 'session') return restoreActiveSession(candidate.session);
    return false;
  }, [
    activeTimeControl?.id,
    currentView,
    game,
    gameContext,
    learningMode,
    restoreActiveSession,
    tournamentGame,
  ]);

  useEffect(() => {
    const saved = loadActiveGameSession();
    if (!saved || startupRestoreAttempted.current) return;
    startupRestoreAttempted.current = true;
    restoreActiveSession(saved);
  }, [restoreActiveSession]);

  return {
    restoreActiveSession,
    continueActiveSession,
    recoverSessionFromBoundary,
  };
}
