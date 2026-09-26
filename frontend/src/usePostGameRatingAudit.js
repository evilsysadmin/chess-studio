import { useState } from 'react';

export function usePostGameRatingAudit({ setRating, setCasualResult, setLastResult }) {
  const [postGameAnalysis, setPostGameAnalysis] = useState(null);

  function resetPostGameAnalysis() {
    setPostGameAnalysis(null);
  }

  function launchPostGameAudit(finishedGame, outcome, record, options = {}) {
    if (!finishedGame?.id || !(finishedGame.history || []).length) return;
    const gameId = String(finishedGame.id);
    setPostGameAnalysis({ gameId, status: 'loading', report: null, qualityDelta: 0 });
    void import('./postGameRatingAuditRunner.js')
      .then(({ runPostGameRatingAudit }) => runPostGameRatingAudit({
        finishedGame,
        outcome,
        record,
        options,
        setRating,
        setCasualResult,
        setLastResult,
      }))
      .then((result) => setPostGameAnalysis((previous) => (
        previous?.gameId === gameId ? { gameId, status: 'done', ...result } : previous
      )))
      .catch(() => setPostGameAnalysis((previous) => (
        previous?.gameId === gameId ? { gameId, status: 'error', report: null, qualityDelta: 0 } : previous
      )));
  }

  return { postGameAnalysis, resetPostGameAnalysis, launchPostGameAudit };
}
