import { useEffect } from 'react';
import { saveActiveGameSession } from './activeGameSession.js';
import { SAVE_STATUS } from './saveStatus.js';

export function activeSessionPersistenceDescriptor({
  view,
  game,
  tournamentGame,
  learningMode,
  gameContext,
  timeControlId,
}) {
  if (view === 'game' && game?.id) {
    return {
      route: 'game',
      game,
      learningMode,
      gameContext,
      timeControlId: timeControlId || null,
    };
  }
  if (view === 'tournamentGame' && tournamentGame?.id) {
    return { route: 'tournamentGame', game: tournamentGame };
  }
  return null;
}

export function persistenceStateAfterSnapshot({ descriptor, persisted }) {
  if (!descriptor) return null;
  return persisted ? SAVE_STATUS.SAVED : SAVE_STATUS.ERROR;
}

export function useActiveGameSessionPersistence({
  view,
  game,
  tournamentGame,
  learningMode,
  gameContext,
  timeControlId,
  onPersistenceState,
}) {
  useEffect(() => {
    const descriptor = activeSessionPersistenceDescriptor({
      view, game, tournamentGame, learningMode, gameContext, timeControlId,
    });
    if (!descriptor) return;

    const persisted = saveActiveGameSession(descriptor);
    // "Guardado" exige backend confirmado + sobre local durable para F5/deploy.
    onPersistenceState?.(persistenceStateAfterSnapshot({ descriptor, persisted }));
  }, [view, game, tournamentGame, learningMode, gameContext, timeControlId, onPersistenceState]);
}
