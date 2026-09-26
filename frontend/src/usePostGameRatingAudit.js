import { useState } from 'react';
import { api } from './api.js';
import { archiveAnalysis } from './advancedCareer.js';
import { recordCleanGameEvidence } from './cleanGames.js';
import { analyzeCompletedGameOnce } from './postGameAnalysis.js';
import {
  loadRating,
  ratingQualityChangeDetails,
  recordRatingHistory,
  saveRating,
} from './playerRating.js';

export function usePostGameRatingAudit({ setRating, setCasualResult, setLastResult }) {
  const [postGameAnalysis, setPostGameAnalysis] = useState(null);

  function resetPostGameAnalysis() {
    setPostGameAnalysis(null);
  }

  function launchPostGameAudit(finishedGame, outcome, record, { ratingEligible = false, target = 'casual' } = {}) {
    if (!finishedGame?.id || !(finishedGame.history || []).length) return;
    const gameId = String(finishedGame.id);
    setPostGameAnalysis({ gameId, status: 'loading', report: null, qualityDelta: 0 });

    void analyzeCompletedGameOnce({
      gameId,
      history: finishedGame.history,
      humanColor: finishedGame.humanColor,
      api,
      initialFen: finishedGame.initialFen || null,
    }).then((report) => {
      const meta = {
        gameId,
        date: record?.date || new Date().toISOString(),
        outcome,
        difficulty: finishedGame.difficulty,
        opening: record?.opening || null,
        timeControlId: record?.timeControl?.id || 'none',
      };
      archiveAnalysis(gameId, report, meta);
      const evidence = recordCleanGameEvidence(gameId, report, meta);
      let qualityDelta = 0;

      if (ratingEligible) {
        const current = loadRating();
        const quality = ratingQualityChangeDetails(current, gameId, evidence, outcome);
        qualityDelta = quality.delta;
        if (!quality.duplicate) {
          saveRating(quality.next);
          recordRatingHistory(quality.next.rating, gameId);
          setRating(quality.next);

          if (target === 'casual') {
            setCasualResult((previous) => {
              if (!previous?.ratingApplied || previous.gameId !== gameId) return previous;
              const baseDelta = Number(previous.eloBaseDelta ?? previous.eloDelta ?? 0);
              const totalDelta = baseDelta + qualityDelta;
              return {
                ...previous,
                eloBaseDelta: baseDelta,
                eloQualityDelta: qualityDelta,
                eloDelta: totalDelta,
                eloAfter: quality.next.rating,
                detail: `Rating ${totalDelta >= 0 ? '+' : ''}${totalDelta} · ${previous.eloBefore} → ${quality.next.rating}${qualityDelta ? ` · calidad ${qualityDelta > 0 ? '+' : ''}${qualityDelta}` : ' · calidad revisada'}`,
              };
            });
          } else if (target === 'tournament') {
            setLastResult((previous) => {
              if (!previous) return previous;
              const baseDelta = Number(previous.eloBaseDelta ?? previous.eloDelta ?? 0);
              return {
                ...previous,
                eloBaseDelta: baseDelta,
                eloQualityDelta: qualityDelta,
                eloDelta: baseDelta + qualityDelta,
                eloAfter: quality.next.rating,
              };
            });
          }
        }
      }

      setPostGameAnalysis((previous) => (
        previous?.gameId === gameId
          ? { gameId, status: 'done', report, evidence, qualityDelta }
          : previous
      ));
    }).catch(() => {
      setPostGameAnalysis((previous) => (
        previous?.gameId === gameId
          ? { gameId, status: 'error', report: null, qualityDelta: 0 }
          : previous
      ));
    });
  }

  return { postGameAnalysis, resetPostGameAnalysis, launchPostGameAudit };
}
