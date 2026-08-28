import { useEffect, useRef } from 'react';
import { loadActiveGameSession } from './activeGameSession.js';
import { fetchReconnectGame, reconnectTarget } from './gameReconnect.js';
import { SAVE_STATUS } from './saveStatus.js';

export function shouldAttemptReconnect({ inFlight, reconnectNeeded, saveState }) {
  if (inFlight) return false;
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

      reconnectInFlight.current = true;
      const offlineGenerationAtStart = reconnectOfflineGeneration.current;
      const controller = new AbortController();
      reconnectAbortRef.current?.abort(new DOMException('Superseded reconnect', 'AbortError'));
      reconnectAbortRef.current = controller;
      if (announceSaving) callbacksRef.current.onPersistenceState?.(SAVE_STATUS.SAVING);
      const result = await fetchReconnectGame(target.gameId, callbacksRef.current.getGame, { signal: controller.signal });
      if (disposed || controller.signal.aborted) {
        reconnectInFlight.current = false;
        return;
      }

      // Una respuesta tardía nunca debe resucitar una partida que el usuario ya abandonó.
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

      if (result.ok) {
        if (target.route === 'tournamentGame') callbacksRef.current.onTournamentGame?.(result.game);
        else callbacksRef.current.onGame?.(result.game);
        callbacksRef.current.onError?.(null);
        reconnectNeeded.current = reconnectStillNeeded({
          generationAtStart: offlineGenerationAtStart,
          currentGeneration: reconnectOfflineGeneration.current,
          online: typeof navigator === 'undefined' ? true : navigator.onLine,
        });
        // El snapshot de sesión activa marca SAVED cuando la respuesta reconciliada queda persistida.
      } else {
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

  // Un timeout o un 409 puede ocurrir sin que el navegador emita `offline`.
  // En ese caso consultamos inmediatamente la foto autoritativa de Mongo una
  // sola vez por transición a ERROR. No anunciamos SAVING para que un fallo de
  // esta propia consulta no cree un bucle ERROR -> SAVING -> ERROR.
  useEffect(() => {
    const target = reconnectTarget({
      route,
      game,
      tournamentGame,
      savedSession: loadActiveGameSession(),
    });
    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    if (!shouldAutoReconnect({ saveState, online, target })) return;
    void attemptReconnectRef.current?.({ announceSaving: false });
  }, [saveState, route, game?.id, tournamentGame?.id]);
}
