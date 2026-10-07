import { api } from './api.js';
import { saveActiveGameSession, setActiveGameSessionVisible } from './activeGameSession.js';
import { isAbortError } from './asyncControl.js';
import {
  chooseContract,
  clearActiveContract,
  loadSpecialRun,
  saveActiveContract,
  saveSpecialRun,
  startSpecialRun,
} from './career.js';
import { clearClockSnapshot } from './clockPersistence.js';
import { timeControlById } from './clock.js';
import { gameModeFromContext } from './gameModes.js';
import { recordGameActivity } from './gameActivity.js';
import { handicapForGap } from './handicap.js';
import { loadRivalry } from './rivalry.js';
import { clearActiveSeries, createSeries, saveActiveSeries } from './series.js';
import { attachSeriesGame } from './seriesFlow.js';
import { userFacingError } from './userFacingError.js';

export function gameContextFromOptions(options = {}) {
  return {
    rematch: !!options.rematch,
    adaptiveDifficulty: !!options.adaptiveDifficulty,
    runMode: options.runMode || null,
    lab: !!options.lab,
    rescue: !!options.rescue,
    suddenDeath: !!options.suddenDeath,
    threatCheck: !!options.threatCheck,
  };
}

export function shouldOfferCasualContract({ learning = false, options = {} } = {}) {
  return !learning
    && !options.runMode
    && !options.lab
    && !options.rescue
    && Number(options.seriesBestOf || 1) <= 1;
}

export function labContextFromMeta(meta = {}) {
  return {
    lab: true,
    rescue: !!meta.rescue,
    nemesis: !!meta.nemesis,
    nemesisLabel: meta.nemesisLabel || null,
    nemesisOpening: meta.nemesisOpening || null,
    sourceRecordId: meta.sourceRecord?.id || null,
  };
}

export function useGameStartFlow({
  launch,
  navigate,
  loading,
  error,
  rating,
  currentGame,
  currentSeries,
  currentRun,
  gameCount,
  setGame,
  saved,
  learning,
  timeControl,
  context,
  contract,
  series,
  run,
  resetResult,
}) {
  async function startGame(difficulty, color, options = {}) {
    const operation = launch.begin();
    if (!operation) return false;
    resetResult?.();
    loading(true);
    error(null);
    try {
      const handicap = handicapForGap(rating.rating, difficulty);
      const operationId = launch.operationId(operation, [difficulty, color, handicap?.id ?? null, null]);
      const created = await api.createGame(difficulty, color, handicap?.id ?? null, null, {
        signal: operation.controller.signal,
        operationId,
      });
      if (!launch.isCurrent(operation)) {
        void api.deleteGame(created.id).catch(() => {});
        return false;
      }
      launch.confirmCreated(operation);

      const isLearning = !!options.learning;
      const nextContext = gameContextFromOptions(options);
      const nextTimeControl = timeControlById(options.timeControlId);
      learning(isLearning);
      timeControl(nextTimeControl);
      context(nextContext);
      recordGameActivity({
        gameId: created.id,
        state: 'started',
        mode: gameModeFromContext({ learningMode: isLearning, gameContext: nextContext }),
        difficulty: created.difficulty,
        detail: nextContext.adaptiveDifficulty ? 'adaptive-difficulty' : null,
      });

      const activeContract = shouldOfferCasualContract({ learning: isLearning, options })
        ? chooseContract({ gameCount, incidents: loadRivalry().incidents })
        : null;
      if (activeContract) saveActiveContract(activeContract);
      else clearActiveContract();
      contract(activeContract);

      if (!isLearning && Number(options.seriesBestOf) > 1) {
        const nextSeries = createSeries({
          bestOf: Number(options.seriesBestOf),
          difficulty,
          firstColor: created.humanColor,
          timeControlId: options.timeControlId || 'none',
          adaptiveDifficulty: nextContext.adaptiveDifficulty,
        });
        const withGame = attachSeriesGame(nextSeries, created.id);
        saveActiveSeries(withGame);
        series(withGame);
      } else {
        clearActiveSeries();
        series(null);
      }

      const persistedSession = saveActiveGameSession({
        route: 'game',
        game: created,
        learningMode: isLearning,
        gameContext: nextContext,
        timeControlId: nextTimeControl.id,
      });
      setActiveGameSessionVisible(persistedSession ? 'game' : null);
      setGame(created);
      saved(true);
      navigate('game');
      return true;
    } catch (caught) {
      if (launch.isCurrent(operation) && !isAbortError(caught)) {
        error(userFacingError(caught, 'No se pudo iniciar la partida.'));
      }
      return false;
    } finally {
      if (launch.owns(operation)) loading(false);
      launch.end(operation);
    }
  }

  async function nextSeriesGame() {
    if (!currentSeries || currentSeries.winner) return;
    const operation = launch.begin();
    if (!operation) return;
    if (currentGame?.id) clearClockSnapshot(currentGame.id);
    loading(true);
    error(null);
    try {
      if (currentGame?.id) void api.deleteGame(currentGame.id).catch(() => {});
      const handicap = handicapForGap(rating.rating, currentSeries.difficulty);
      const operationId = launch.operationId(operation, [
        currentSeries.difficulty,
        currentSeries.nextColor,
        handicap?.id ?? null,
        null,
        null,
      ]);
      const created = await api.createGame(
        currentSeries.difficulty,
        currentSeries.nextColor,
        handicap?.id ?? null,
        null,
        { signal: operation.controller.signal, operationId },
      );
      if (!launch.isCurrent(operation)) {
        void api.deleteGame(created.id).catch(() => {});
        return;
      }
      launch.confirmCreated(operation);
      recordGameActivity({
        gameId: created.id,
        state: 'started',
        mode: 'casual',
        difficulty: created.difficulty,
        detail: currentSeries.adaptiveDifficulty ? 'adaptive-difficulty' : null,
      });
      const updatedSeries = attachSeriesGame(currentSeries, created.id);
      saveActiveSeries(updatedSeries);
      series(updatedSeries);
      learning(false);
      timeControl(timeControlById(updatedSeries.timeControlId));
      setGame(created);
      saved(true);
      navigate('game');
    } catch (caught) {
      if (launch.isCurrent(operation) && !isAbortError(caught)) {
        error(userFacingError(caught, 'No se pudo crear la siguiente partida de la serie.'));
      }
    } finally {
      if (launch.owns(operation)) loading(false);
      launch.end(operation);
    }
  }

  async function playFromHere(fen, humanColor, difficulty, meta = {}) {
    const operation = launch.begin();
    if (!operation) return;
    loading(true);
    error(null);
    try {
      const resolvedDifficulty = difficulty || 50;
      const resolvedColor = humanColor || 'w';
      const operationId = launch.operationId(operation, [resolvedDifficulty, resolvedColor, null, fen, null]);
      const created = await api.createGame(resolvedDifficulty, resolvedColor, null, fen, {
        signal: operation.controller.signal,
        operationId,
      });
      if (!launch.isCurrent(operation)) {
        void api.deleteGame(created.id).catch(() => {});
        return;
      }
      launch.confirmCreated(operation);
      const nextContext = labContextFromMeta(meta);
      recordGameActivity({
        gameId: created.id,
        state: 'started',
        mode: gameModeFromContext({ learningMode: true, gameContext: nextContext }),
        difficulty: created.difficulty,
      });
      clearActiveSeries();
      series(null);
      clearActiveContract();
      contract(null);
      run(loadSpecialRun());
      context(nextContext);
      learning(true);
      timeControl(null);
      setGame(created);
      saved(true);
      navigate('game');
    } catch (caught) {
      if (launch.isCurrent(operation) && !isAbortError(caught)) {
        error(userFacingError(caught, 'No se pudo arrancar la posición del laboratorio.'));
      }
    } finally {
      if (launch.owns(operation)) loading(false);
      launch.end(operation);
    }
  }

  async function launchRun(nextRun) {
    const operation = launch.begin();
    if (!operation) return false;
    loading(true);
    error(null);
    try {
      if (currentGame?.id) void api.deleteGame(currentGame.id).catch(() => {});
      const operationId = launch.operationId(operation, [nextRun.difficulty, 'random', null, null, null]);
      const created = await api.createGame(nextRun.difficulty, 'random', null, null, {
        signal: operation.controller.signal,
        operationId,
      });
      if (!launch.isCurrent(operation)) {
        void api.deleteGame(created.id).catch(() => {});
        return false;
      }
      launch.confirmCreated(operation);
      recordGameActivity({
        gameId: created.id,
        state: 'started',
        mode: nextRun.mode || 'streak',
        difficulty: created.difficulty,
      });
      clearActiveSeries();
      series(null);
      clearActiveContract();
      contract(null);
      const withGame = saveSpecialRun({ ...nextRun, currentGameId: created.id });
      run(withGame);
      context({ runMode: nextRun.mode });
      learning(false);
      timeControl(timeControlById('5+0'));
      setGame(created);
      saved(true);
      navigate('game');
    } catch (caught) {
      if (launch.isCurrent(operation) && !isAbortError(caught)) {
        error(userFacingError(caught, 'No se pudo iniciar el desafío.'));
      }
    } finally {
      if (launch.owns(operation)) loading(false);
      launch.end(operation);
    }
    return true;
  }

  function startRun(mode) {
    if (launch.busy()) return;
    void launchRun(startSpecialRun(mode));
  }

  function continueRun(nextRun = currentRun) {
    if (nextRun?.active && !launch.busy()) void launchRun(nextRun);
  }

  return {
    startGame,
    nextSeriesGame,
    playFromHere,
    startRun,
    continueRun,
  };
}
