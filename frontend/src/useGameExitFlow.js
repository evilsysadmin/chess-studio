import { STORAGE_KEY } from './api.js';
import { clearActiveGameSession } from './activeGameSession.js';
import { clearActiveContract } from './career.js';
import { clearClockSnapshot } from './clockPersistence.js';
import { recordGameActivity } from './gameActivity.js';
import { chessGameExitDisposition } from './gameOutcome.js';
import { gameModeFromContext } from './gameModes.js';
import { STORAGE_LOCAL, removeStorageItem } from './safeStorage.js';
import { clearActiveSeries } from './series.js';
import { LEARNING_STORAGE_KEY } from './useActiveSessionRestore.js';

export const CANCELLED_GAME_EXIT_NOTICE = Object.freeze({
  outcome: 'cancelled',
  title: 'Partida cancelada',
  detail: 'No habías perdido ninguna pieza. Tu rating no cambia.',
  ratingApplied: false,
});

export function gameExitTrainingPosition(gameContext = {}) {
  return !!(gameContext.lab || gameContext.rescue || gameContext.suddenDeath);
}

export function resolveGameExit({ gameId, casualResult, exitDisposition }) {
  if (!gameId) return { kind: 'none', notice: null };
  if (casualResult?.gameId === gameId) return { kind: 'completed', notice: casualResult };
  if (exitDisposition === 'forfeit') return { kind: 'forfeit', notice: null };
  return { kind: 'cancelled', notice: CANCELLED_GAME_EXIT_NOTICE };
}

export function useGameExitFlow({
  game,
  casualResult,
  gameContext,
  learningMode,
  finish,
  notice,
  saved,
  setGame,
  learning,
  contract,
  context,
  series,
  back,
}) {
  function exitGame() {
    let decision = resolveGameExit({ gameId: game?.id, casualResult, exitDisposition: null });

    if (game?.id && decision.kind !== 'completed') {
      const trainingPosition = gameExitTrainingPosition(gameContext);
      const exitDisposition = chessGameExitDisposition(game, {
        learningMode,
        trainingPosition,
        explicitAction: true,
      });
      decision = resolveGameExit({ gameId: game.id, casualResult, exitDisposition });
    }

    if (decision.kind === 'completed') {
      notice(decision.notice);
    } else if (decision.kind === 'forfeit') {
      notice(finish('loss', game, { endReason: 'resignation' }));
    } else if (decision.kind === 'cancelled') {
      recordGameActivity({
        gameId: game.id,
        state: 'cancelled',
        mode: gameModeFromContext({ learningMode, gameContext }),
        difficulty: game.difficulty,
      });
      notice(decision.notice);
    }

    if (game?.id) clearClockSnapshot(game.id);
    clearActiveGameSession();
    removeStorageItem(STORAGE_LOCAL, STORAGE_KEY);
    removeStorageItem(STORAGE_LOCAL, LEARNING_STORAGE_KEY);
    saved(false);
    setGame(null);
    learning(false);
    clearActiveContract();
    contract(null);
    context({});
    clearActiveSeries();
    series(null);
    back();
  }

  return exitGame;
}
