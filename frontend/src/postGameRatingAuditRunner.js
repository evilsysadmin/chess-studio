import { api } from './api.js';
import { abortableDelay } from './asyncControl.js';
import { archiveAnalysis } from './advancedCareer.js';
import { loadCleanGameRecords, recordCleanGameEvidence } from './cleanGames.js';
import { analyzeGame } from './gameReport.js';
import {
  loadRating,
  ratingQualityChangeDetails,
  recordRatingHistory,
  saveRating,
} from './playerRating.js';

export function resultWithQualityDelta(previous, gameId, qualityDelta, nextRating) {
  if (!previous?.ratingApplied || String(previous.gameId || '') !== String(gameId || '')) return previous;
  const baseDelta = Number(previous.eloBaseDelta ?? previous.eloDelta ?? 0);
  const totalDelta = baseDelta + Number(qualityDelta || 0);
  return {
    ...previous,
    eloBaseDelta: baseDelta,
    eloQualityDelta: Number(qualityDelta || 0),
    eloDelta: totalDelta,
    eloAfter: nextRating,
    detail: `Rating ${totalDelta >= 0 ? '+' : ''}${totalDelta} · ${previous.eloBefore} → ${nextRating}${qualityDelta ? ` · calidad ${qualityDelta > 0 ? '+' : ''}${qualityDelta}` : ' · calidad revisada'}`,
  };
}

async function waitForExistingEvidence(gameId, waitMs = 30_000, pollMs = 500) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const evidence = loadCleanGameRecords()?.[String(gameId)];
    if (evidence) return evidence;
    await abortableDelay(pollMs);
  }
  return null;
}

export async function runPostGameRatingAudit({
  finishedGame,
  outcome,
  record,
  setRating,
  setCasualResult,
  analyze = analyzeGame,
} = {}) {
  if (!finishedGame?.id || !(finishedGame.history || []).length) return null;

  const gameId = String(finishedGame.id);
  const meta = {
    gameId,
    date: record?.date || new Date().toISOString(),
    outcome,
    difficulty: finishedGame.difficulty,
    opening: record?.opening || null,
    timeControlId: record?.timeControl?.id || 'none',
  };

  // Give the normal post-game report first refusal on engine analysis. It
  // already archives clean-game evidence; sharing that result avoids two
  // concurrent analysis bursts competing for the same backend budget.
  let evidence = await waitForExistingEvidence(gameId);
  let report = null;
  if (!evidence) {
    report = await analyze(
      finishedGame.history,
      finishedGame.humanColor,
      api,
      {
        initialFen: finishedGame.initialFen || null,
        maxMoves: Math.min((finishedGame.history || []).length, 24),
      },
    );
    archiveAnalysis(gameId, report, meta);
    evidence = recordCleanGameEvidence(gameId, report, meta);
  }

  const current = loadRating();
  const quality = ratingQualityChangeDetails(current, gameId, evidence, outcome);
  if (!quality.duplicate) {
    saveRating(quality.next);
    recordRatingHistory(quality.next.rating, gameId);
    setRating?.(quality.next);
    setCasualResult?.((previous) => resultWithQualityDelta(previous, gameId, quality.delta, quality.next.rating));
  }

  return { report, evidence, qualityDelta: quality.delta, duplicate: quality.duplicate };
}
