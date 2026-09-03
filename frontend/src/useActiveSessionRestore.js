import { useCallback, useEffect, useRef } from 'react';
import { api, STORAGE_KEY } from './api.js';
import { clearActiveGameSession, loadActiveGameSession } from './activeGameSession.js';
import { clearClockSnapshot, loadClockSnapshot } from './clockPersistence.js';
import { timeControlById } from './clock.js';
import { clearActiveContract, clearSpecialRun, loadActiveContract, loadSpecialRun } from './career.js';
import { clearActiveSeries, loadActiveSeries } from './series.js';
import { SAVE_STATUS } from './saveStatus.js';
import { STORAGE_LOCAL, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';
import { loadCampaign } from './combatCampaign.js';
import { loadRun } from './roguelikeRun.js';
import { hasCombatSession } from './combatSession.js';
import { ACTIVE_SESSION_EVENT, ACTIVE_SESSION_STATE, activeSessionTransition, assertActiveSessionInvariant } from './activeSessionMachine.js';
import { reportStateInvariant } from './stateMachine.js';

export const LEARNING_STORAGE_KEY = 'chess-study-active-game-learning';

export function classifyRestoreFailure(error) {
  if (error?.status === 404 || error?.status === 403) return 'stale-session';
  if (error?.status === 409) return 'irrecoverable';
  return 'transient';
}

export function shouldLeaveActiveRouteAfterRestoreFailure(error) {
  return classifyRestoreFailure(error) === 'stale-session';
}

export function resolveRestoredGameContext(saved, found, storedRun) {
  const resumed = found?.id || saved?.gameId || true;
  if (saved?.gameContext && Object.keys(saved.gameContext).length) return { ...saved.gameContext, resumed };
  if (storedRun?.active && storedRun.currentGameId === found?.id) return { runMode: storedRun.mode, resumed };
  if (found?.ghostStyle) return { ghost: true, ghostStyle: found.ghostStyle, resumed };
  return { resumed };
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
  combatRecoverable = false,
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
  if ((currentView === 'combat' || currentView === 'roguelike') && combatRecoverable) return { type: 'combat' };
  return { type: 'none' };
}

export function hasRecoverableCombatState(currentView, {
  campaign = loadCampaign(),
  run = loadRun(),
  freeSession = hasCombatSession('free'),
} = {}) {
  if (currentView === 'roguelike') return campaign?.active === true || run?.inRun === true;
  if (currentView === 'combat') return freeSession === true;
  return false;
}

export function discardActiveSessionStorage(gameId = null) {
  if (gameId) clearClockSnapshot(gameId);
  clearActiveGameSession();
  clearActiveSeries();
  clearActiveContract();
  clearSpecialRun();
  removeStorageItem(STORAGE_LOCAL, STORAGE_KEY);
  removeStorageItem(STORAGE_LOCAL, LEARNING_STORAGE_KEY);
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
  const restoreRequestRef = useRef(null);
  const sessionMachineRef = useRef(ACTIVE_SESSION_STATE.IDLE);

  function advanceSessionMachine(event, saved = null) {
    const current = sessionMachineRef.current;
    const result = activeSessionTransition(current, event);
    if (!result.ok) {
      reportStateInvariant('active-session', 'invalid-transition', { state: current, event, route: saved?.route || null });
      return current;
    }
    sessionMachineRef.current = result.nextState;
    try {
      assertActiveSessionInvariant({
        state: result.nextState,
        savedSession: saved,
        gameId: saved?.gameId || null,
      });
    } catch {
      reportStateInvariant('active-session', 'broken-invariant', { state: result.nextState, event, route: saved?.route || null });
    }
    return result.nextState;
  }

  const restoreActiveSession = useCallback((saved = loadActiveGameSession()) => {
    if (!saved?.gameId) return Promise.resolve(false);

    const inFlight = restoreRequestRef.current;
    if (inFlight?.gameId === saved.gameId && inFlight.promise) return inFlight.promise;
    inFlight?.controller?.abort(new DOMException('Superseded session restore', 'AbortError'));

    const controller = new AbortController();
    const request = { gameId: saved.gameId, controller, promise: null };
    const isCurrent = () => restoreRequestRef.current === request && !controller.signal.aborted;

    const promise = (async () => {
      advanceSessionMachine(ACTIVE_SESSION_EVENT.RESTORE, saved);
      setLoading(true);
      setError(null);
      setGameSaveState(SAVE_STATUS.SAVING);
      try {
        const found = await api.getGame(saved.gameId, { signal: controller.signal });
        if (!isCurrent()) return false;
      if (saved.route === 'tournamentGame') {
        setTournamentGame(found);
        replaceView('tournamentGame');
        setHasSavedGame(true);
        advanceSessionMachine(ACTIVE_SESSION_EVENT.RESTORED, saved);
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
      advanceSessionMachine(ACTIVE_SESSION_EVENT.RESTORED, saved);
      return true;
      } catch (error) {
        if (!isCurrent()) return false;
        // Sólo una sesión realmente inexistente/no autorizada abandona la ruta
      // activa. Red/5xx conserva la pantalla de partida y el snapshot para que
      // el usuario pueda reintentar sin sufrir un salto involuntario a Home.
      if (shouldLeaveActiveRouteAfterRestoreFailure(error)) {
        advanceSessionMachine(ACTIVE_SESSION_EVENT.STALE, saved);
        clearActiveGameSession();
        removeStorageItem(STORAGE_LOCAL, STORAGE_KEY);
        setHasSavedGame(false);
        setError('La partida guardada ya no existe en el servidor.');
        replaceView('menu');
      } else {
        const failure = classifyRestoreFailure(error);
        advanceSessionMachine(
          failure === 'irrecoverable' ? ACTIVE_SESSION_EVENT.IRRECOVERABLE_FAILURE : ACTIVE_SESSION_EVENT.TRANSIENT_FAILURE,
          saved,
        );
        setHasSavedGame(true);
        setGameSaveState(SAVE_STATUS.ERROR);
        setError(failure === 'irrecoverable'
          ? 'La partida guardada está dañada y no puede reanudarse. Puedes descartarla sin registrar derrota.'
          : 'No se pudo recuperar la partida en curso. Tu sesión sigue guardada; reintenta cuando vuelva el servidor.');
      }
      return false;
      } finally {
        if (restoreRequestRef.current === request) {
          restoreRequestRef.current = null;
          setLoading(false);
        }
      }
    })();
    request.promise = promise;
    restoreRequestRef.current = request;
    return promise;
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

  useEffect(() => () => {
    restoreRequestRef.current?.controller?.abort(new DOMException('Session restore unmounted', 'AbortError'));
    restoreRequestRef.current = null;
  }, []);

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

  const discardActiveSession = useCallback(() => {
    advanceSessionMachine(ACTIVE_SESSION_EVENT.DISCARD, loadActiveGameSession());
    const savedGameId = loadActiveGameSession()?.gameId || getStorageItem(STORAGE_LOCAL, STORAGE_KEY) || null;
    restoreRequestRef.current?.controller?.abort(new DOMException('Active session discarded', 'AbortError'));
    restoreRequestRef.current = null;
    discardActiveSessionStorage(savedGameId);
    setGame(null);
    setTournamentGame(null);
    setLearningMode(false);
    setActiveContract(null);
    setSpecialRun(null);
    setGameContext({});
    setActiveSeries(null);
    setActiveTimeControl(null);
    setHasSavedGame(false);
    setGameSaveState(SAVE_STATUS.SAVED);
    setLoading(false);
    setError(null);
    replaceView('menu');
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

  const recoverSessionFromBoundary = useCallback(async () => {
    const candidate = selectBoundaryRecovery({
      saved: loadActiveGameSession(),
      tournamentGame,
      game,
      learningMode,
      gameContext,
      timeControlId: activeTimeControl?.id || null,
      currentView,
      combatRecoverable: hasRecoverableCombatState(currentView),
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
    discardActiveSession,
    recoverSessionFromBoundary,
  };
}
