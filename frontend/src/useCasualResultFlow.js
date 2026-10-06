import { useState } from 'react';
import {
  clearActiveContract,
  recordCareerGame,
  recordSpecialRunResult,
} from './career.js';
import { clearClockSnapshot } from './clockPersistence.js';
import { recordCompletedAdaptiveMatchmakingTelemetry, recordGameActivity } from './gameActivity.js';
import { saveGameRecord } from './gameHistory.js';
import { isCompletedGameOutcome, shouldApplyCompetitiveProgress } from './gameOutcome.js';
import { loadActiveGameChat } from './gameChat.js';
import { identifyOpening } from './openings.js';
import {
  ratingChangeDetails,
  ratingScoreForOutcome,
  recordRatingHistory,
  saveRating,
} from './playerRating.js';
import { recordRivalryResult } from './rivalry.js';
import { recordSeriesGame } from './series.js';

export function casualModeFromContext(gameContext = {}, learningMode = false) {
  if (gameContext.suddenDeath) return 'sudden';
  if (gameContext.rescue) return 'rescue';
  if (gameContext.nemesis) return 'nemesis-training';
  if (gameContext.lab) return 'lab';
  if (gameContext.runMode === 'cup') return 'cup';
  if (gameContext.runMode === 'boss') return 'boss';
  if (gameContext.runMode === 'streak') return 'streak';
  return learningMode ? 'practice' : 'casual';
}

export function casualResultSummary({
  gameId,
  outcome,
  endReason = null,
  adaptiveDifficulty = false,
  ratingSummary = { ratingApplied: false },
}) {
  const title = endReason === 'resignation'
    ? 'Abandono registrado como derrota'
    : outcome === 'win' ? 'Victoria'
      : outcome === 'draw' ? 'Tablas'
        : 'Derrota';
  const detail = ratingSummary.ratingApplied
    ? `Rating ${ratingSummary.eloDelta >= 0 ? '+' : ''}${ratingSummary.eloDelta} · ${ratingSummary.eloBefore} → ${ratingSummary.eloAfter}`
    : 'Esta modalidad no afecta a tu rating.';
  return {
    gameId,
    outcome,
    title,
    detail,
    endReason,
    adaptiveDifficulty,
    ...ratingSummary,
  };
}

export function useCasualResultFlow({
  activeSeries,
  setActiveSeries,
  gameContext,
  learningMode,
  activeTimeControl,
  rating,
  setRating,
  setHistoryList,
  activeContract,
  setActiveContract,
  specialRun,
  setSpecialRun,
}) {
  const [result, setResult] = useState(null);

  function clearResult() {
    setResult(null);
  }

  function finish(outcome, finishedGame, endMeta = {}) {
    if (!finishedGame || !isCompletedGameOutcome(outcome)) return null;

    clearClockSnapshot(finishedGame.id);
    const moveSans = (finishedGame.history || []).map((move) => move.san).filter(Boolean);
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
        ratingGames: details.next.games,
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
      mode: casualModeFromContext(gameContext, learningMode),
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
    recordGameActivity({
      gameId: finishedGame.id,
      state: 'finished',
      mode: record.mode,
      outcome,
      difficulty: finishedGame.difficulty,
    });
    recordCompletedAdaptiveMatchmakingTelemetry({ gameContext, finishedGame, outcome, endMeta });
    recordCareerGame(record, { ...endMeta, contract: activeContract });

    clearActiveContract();
    setActiveContract(null);

    const summary = casualResultSummary({
      gameId: finishedGame.id,
      outcome,
      endReason: endMeta.endReason || null,
      adaptiveDifficulty: !!gameContext.adaptiveDifficulty,
      ratingSummary,
    });
    setResult(summary);

    if (specialRun?.active && gameContext.runMode) {
      setSpecialRun(recordSpecialRunResult(specialRun, outcome));
    }

    return summary;
  }

  return {
    result,
    clearResult,
    finish,
  };
}
