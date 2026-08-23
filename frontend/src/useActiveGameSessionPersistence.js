import { useEffect } from 'react';
import { saveActiveGameSession } from './activeGameSession.js';
import { SAVE_STATUS } from './saveStatus.js';

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
    let persisted = null;
    if (view === 'game' && game?.id) {
      persisted = saveActiveGameSession({
        route: 'game',
        game,
        learningMode,
        gameContext,
        timeControlId: timeControlId || null,
      });
    } else if (view === 'tournamentGame' && tournamentGame?.id) {
      persisted = saveActiveGameSession({ route: 'tournamentGame', game: tournamentGame });
    }

    // "Guardado" exige backend confirmado + sobre local durable para F5/deploy.
    if (persisted) onPersistenceState?.(SAVE_STATUS.SAVED);
    else if ((view === 'game' && game?.id) || (view === 'tournamentGame' && tournamentGame?.id)) {
      onPersistenceState?.(SAVE_STATUS.ERROR);
    }
  }, [view, game, tournamentGame, learningMode, gameContext, timeControlId, onPersistenceState]);
}
