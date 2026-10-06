import { useState } from 'react';
import { api, STORAGE_KEY } from './api.js';
import { clearActiveGameSession } from './activeGameSession.js';
import { recordCareerGame } from './career.js';
import { saveGameRecord } from './gameHistory.js';
import { recordGameActivity } from './gameActivity.js';
import { chessGameExitDisposition, isCompletedGameOutcome } from './gameOutcome.js';
import { loadActiveGameChat } from './gameChat.js';
import { identifyOpening } from './openings.js';
import { ratingChangeDetails, ratingScoreForOutcome, recordRatingHistory, saveRating } from './playerRating.js';
import { recordRivalryResult } from './rivalry.js';
import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import {
  applyCaptureReward,
  applyResult,
  difficultyForLevel,
  levelForPoints,
  loadTournament,
  resetTournament,
  saveTournament,
} from './tournament.js';
import { isAbortError } from './asyncControl.js';
import { userFacingError } from './userFacingError.js';

export function useTournamentFlow({
  gameLaunch,
  navigateTo,
  goBack,
  setLoading,
  setError,
  setRating,
  setHistoryList,
  setHasSavedGame,
}) {
  const [tournament, setTournament] = useState(() => loadTournament());
  const [tournamentGame, setTournamentGame] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  async function handlePlayTournament(color) {
    const launch = gameLaunch.begin();
    if (!launch) return;
    setLoading(true);
    setError(null);
    try {
      const level = levelForPoints(tournament.progressPoints || 0);
      const cpuDifficulty = difficultyForLevel(level);
      const operationId = gameLaunch.operationId(launch, [cpuDifficulty, color, null, null, null]);
      const created = await api.createGame(cpuDifficulty, color, null, null, { signal: launch.controller.signal, operationId });
      if (!gameLaunch.isCurrent(launch)) { void api.deleteGame(created.id).catch(() => {}); return; }
      gameLaunch.confirmCreated(launch);
      recordGameActivity({ gameId: created.id, state: 'started', mode: 'tournament', difficulty: created.difficulty });
      setTournamentGame(created);
      navigateTo('tournamentGame');
    } catch (error) {
      if (gameLaunch.isCurrent(launch) && !isAbortError(error)) setError(userFacingError(error, 'No se pudo iniciar la partida.'));
    } finally {
      if (gameLaunch.owns(launch)) setLoading(false);
      gameLaunch.end(launch);
    }
  }

  function handleTournamentGameEnd(outcome, finishedGame, endMeta = {}) {
    if (!isCompletedGameOutcome(outcome)) return;
    if (finishedGame) {
      const moveSans = (finishedGame.history || []).map((move) => move.san).filter(Boolean);
      recordRivalryResult(outcome, {
        difficulty: finishedGame.difficulty,
        humanColor: finishedGame.humanColor,
        opening: identifyOpening(moveSans),
        moves: finishedGame.history?.length || 0,
        timeControlId: null,
      });
    }

    setTournament((previous) => {
      const { state, gained, leveledUp, newLevel } = applyResult(previous, outcome);
      saveTournament(state);
      setLastResult({ outcome, gained, leveledUp, newLevel });
      return state;
    });

    if (!finishedGame) return;

    const score = ratingScoreForOutcome(outcome);
    setRating((previous) => {
      const details = ratingChangeDetails(previous, finishedGame.difficulty, score);
      saveRating(details.next);
      recordRatingHistory(details.next.rating);
      setLastResult((current) => ({
        ...(current || { outcome }),
        eloDelta: details.delta,
        eloBefore: previous.rating,
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
      opening: identifyOpening((finishedGame.history || []).map((move) => move.san).filter(Boolean)),
      timeControl: null,
      gameChat: Array.isArray(endMeta.gameChat) ? endMeta.gameChat : loadActiveGameChat(finishedGame.id),
      series: null,
    };
    setHistoryList(saveGameRecord(record));
    recordGameActivity({ gameId: finishedGame.id, state: 'finished', mode: 'tournament', outcome, difficulty: finishedGame.difficulty });
    recordCareerGame(record, {});
  }

  function handleSpendPoints(cost) {
    setTournament((previous) => {
      const next = { ...previous, points: Math.max(0, previous.points - cost) };
      saveTournament(next);
      return next;
    });
  }

  function handleCapturePoints(gained) {
    setTournament((previous) => {
      const next = applyCaptureReward(previous, gained);
      saveTournament(next);
      return next;
    });
  }

  function handleExitTournamentGame() {
    if (tournamentGame?.id) {
      const exitDisposition = chessGameExitDisposition(tournamentGame, { explicitAction: true });
      if (exitDisposition === 'forfeit') handleTournamentGameEnd('loss', tournamentGame, { endReason: 'resignation' });
      else recordGameActivity({ gameId: tournamentGame.id, state: 'cancelled', mode: 'tournament', difficulty: tournamentGame.difficulty });
    }
    clearActiveGameSession();
    setHasSavedGame(!!getStorageItem(STORAGE_LOCAL, STORAGE_KEY));
    setTournamentGame(null);
    goBack();
  }

  function handleResetTournament() {
    setTournament(resetTournament());
    setLastResult(null);
  }

  return {
    tournament,
    tournamentGame,
    setTournamentGame,
    lastResult,
    tournamentLevel: levelForPoints(tournament.progressPoints || 0),
    handlePlayTournament,
    handleTournamentGameEnd,
    handleSpendPoints,
    handleCapturePoints,
    handleExitTournamentGame,
    handleResetTournament,
  };
}
