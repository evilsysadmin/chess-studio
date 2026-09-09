import { useEffect, useRef } from 'react';
import { loadActiveGameSession } from './activeGameSession.js';
import { currentGameAuthorityGeneration, hasActiveGameMutation } from './gameAuthorityGeneration.js';
import { fetchReconnectGame, reconnectTarget } from './gameReconnect.js';
import { SAVE_STATUS } from './saveStatus.js';
import { ACTIVE_SESSION_EVENT, ACTIVE_SESSION_STATE, activeSessionTransition } from './activeSessionMachine.js';
import { reportStateInvariant } from './stateMachine.js';

export function shouldAttemptReconnect({ inFlight, reconnectNeeded, saveState, mutationInFlight = false }) {
  if (inFlight || mutationInFlight || saveState === SAVE_STATUS.SAVING) return false;
  return reconnectNeeded || saveState === SAVE_STATUS.ERROR;
}

export function shouldAutoReconnect({ saveState, online = true, target = null }) {
  return online !== false && saveState === SAVE_STATUS.ERROR && !!target?.gameId;
}

export function sameReconnectTarget(expected, current) {
  return !!expected
    && !!current
    && expected.route === current.route
    && expected.gameId === current.gameId;
}

export function reconnectStillNeeded({ generationAtStart, currentGeneration, online }) {
  return currentGeneration !== generationAtStart || online === false;
}

export function reconnectAuthorityStillCurrent({ generationAtStart, currentGeneration = currentGameAuthorityGeneration() }) {
  return generationAtStart === currentGeneration;
}

export function reconnectSnapshotIsFreshEnough({ localGame = null, remoteGame = null } = {}) {
  const localHistory = Array.isArray(localGame?.history) ? localGame.history.length : null;
  const remoteHistory = Array.isArray(remoteGame?.history) ? remoteGame.history.length : null;
  if (localHistory == null || remoteHistory == null) return true;
  return remoteHistory >= localHistory;
}

export function useGameReconnect({
  route,
  game,
  tournamentGame,
  saveState,
  getGame,
  onGame,
  onTournamentGame,
  onPersistenceState,
  onError,
}) {
  const routeRef = useRef(route);
  const gameRef = useRef(game);
  const tournamentGameRef = useRef(tournamentGame);
  const saveStateRef = useRef(saveState);
  const callbacksRef = useRef({ getGame, onGame, onTournamentGame, onPersistenceState, onError });
  const reconnectInFlight = useRef(false);
  const reconnectNeeded = useRef(typeof navigator !== 'undefined' && navigator.onLine === false);
  const reconnectOfflineGeneration = useRef(0);
  const reconnectAbortRef = useRef(null);
  const attemptReconnectRef = useRef(null);
  const reconnectMachineRef = useRef(ACTIVE_SESSION_STATE.ACTIVE);

  function advanceReconnect(event, target = null) {
    const current = reconnectMachineRef.current;
    const result = activeSessionTransition(current, event);
    if (!result.ok) {
      reportStateInvariant('game-reconnect', 'invalid-transition', { state: current, event, route: target?.route || routeRef.current });
      return current;
    }
    reconnectMachineRef.current = result.nextState;
    return result.nextState;
  }

  routeRef.current = route;
  gameRef.current = game;
  tournamentGameRef.current = tournamentGame;
  saveStateRef.current = saveState;
  callbacksRef.current = { getGame, onGame, onTournamentGame, onPersistenceState, onError };

  useEffect(() => {
    let disposed = false;

    async function attemptReconnect({ announceSaving = true } = {}) {
      if (!shouldAttemptReconnect({
        inFlight: reconnectInFlight.current,
        reconnectNeeded: reconnectNeeded.current,
        saveState: saveStateRef.current,
        mutationInFlight: hasActiveGameMutation(),
      })) return;

      const target = reconnectTarget({
        route: routeRef.current,
        game: gameRef.current,
        tournamentGame: tournamentGameRef.current,
        savedSession: loadActiveGameSession(),
      });
      if (!target) {
        reconnectNeeded.current = false;
        return;
      }

      advanceReconnect(ACTIVE_SESSION_EVENT.RECONNECT, target);
      reconnectInFlight.current = true;
      const offlineGenerationAtStart = reconnectOfflineGeneration.current;
      const authorityGenerationAtStart = currentGameAuthorityGeneration();
      const controller = new AbortController();
      reconnectAbortRef.current?.abort(new DOMException('Superseded reconnect', 'AbortError'));
      reconnectAbortRef.current = controller;
      if (announceSaving) callbacksRef.current.onPersistenceState?.(SAVE_STATUS.SAVING);
      const result = await fetchReconnectGame(target.gameId, callbacksRef.current.getGame, { signal: controller.signal });
      if (disposed || controller.signal.aborted) {
        reconnectInFlight.current = false;
        return;
      }

      const currentTarget = reconnectTarget({
        route: routeRef.current,
        game: gameRef.current,
        tournamentGame: tournamentGameRef.current,
        savedSession: loadActiveGameSession(),
      });
      if (!sameReconnectTarget(target, currentTarget)) {
        reconnectInFlight.current = false;
        return;
      }

      if (result.ok && (
        hasActiveGameMutation()
        || !reconnectAuthorityStillCurrent({ generationAtStart: authorityGenerationAtStart })
      )) {
        advanceReconnect(ACTIVE_SESSION_EVENT.RECONNECTED, target);
        reconnectNeeded.current = true;
        if (reconnectAbortRef.current === controller) reconnectAbortRef.current = null;
        reconnectInFlight.current = false;
        return;
      }

      const currentLocalGame = target.route === 'tournamentGame'
        ? tournamentGameRef.current
        : gameRef.current;
      if (result.ok && !reconnectSnapshotIsFreshEnough({ localGame: currentLocalGame, remoteGame: result.game })) {
        advanceReconnect(ACTIVE_SESSION_EVENT.RECONNECTED, target);
        reconnectNeeded.current = true;
        if (reconnectAbortRef.current === controller) reconnectAbortRef.current = null;
        reconnectInFlight.current = false;
        return;
      }

      if (result.ok) {
        advanceReconnect(ACTIVE_SESSION_EVENT.RECONNECTED, target);
        if (target.route === 'tournamentGame') callbacksRef.current.onTournamentGame?.(result.game);
        else callbacksRef.current.onGame?.(result.game);
        callbacksRef.current.onError?.(null);
        reconnectNeeded.current = reconnectStillNeeded({
          generationAtStart: offlineGenerationAtStart,
          currentGeneration: reconnectOfflineGeneration.current,
          online: typeof navigator === 'undefined' ? true : navigator.onLine,
        });
      } else {
        advanceReconnect(ACTIVE_SESSION_EVENT.TRANSIENT_FAILURE, target);
        callbacksRef.current.onPersistenceState?.(SAVE_STATUS.ERROR);
        callbacksRef.current.onError?.('La conexión volvió, pero todavía no se pudo resincronizar la partida. La última posición confirmada sigue intacta.');
      }
      if (reconnectAbortRef.current === controller) reconnectAbortRef.current = null;
      reconnectInFlight.current = false;
    }

    attemptReconnectRef.current = attemptReconnect;
    const handleOnline = () => { void attemptReconnect({ announceSaving: true }); };

    const handleOffline = () => {
      reconnectOfflineGeneration.current += 1;
      reconnectNeeded.current = true;
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      disposed = true;
      attemptReconnectRef.current = null;
      reconnectAbortRef.current?.abort(new DOMException('Reconnect unmounted', 'AbortError'));
      reconnectAbortRef.current = null;
      reconnectInFlight.current = false;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    const target = reconnectTarget({
      route,
      game,
      tournamentGame,
      savedSession: loadActiveGameSession(),
    });
    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    if (online === false || !target?.gameId || saveState === SAVE_STATUS.SAVING || hasActiveGameMutation()) return;

    const deferredReconnect = reconnectNeeded.current;
    const errorReconnect = shouldAutoReconnect({ saveState, online, target });
    if (!deferredReconnect && !errorReconnect) return;

    void attemptReconnectRef.current?.({ announceSaving: false });
  }, [saveState, route, game?.id, tournamentGame?.id]);
}
