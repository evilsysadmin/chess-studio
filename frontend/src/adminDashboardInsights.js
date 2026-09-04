import { ACHIEVEMENTS } from './achievements.js';
import { buildWorstMoveAutopsy } from './adminWorstMove.js';
import { buildPlayerPortraitFacts } from './aiPlayerPortrait.js';
import { computeInsights, generateCoaching, generateRoast } from './insights.js';

export function buildAdminInsights(payload) {
  if (!payload) return null;
  const insights = computeInsights(
    payload.gameHistory || [],
    payload.combatHistory || [],
    payload.ratingHistory || [],
  );
  const rivalry = payload.rivalry || {};
  const rawExtras = payload.extras || {};
  const extras = {
    achievementsUnlocked: Number(rawExtras.achievementsUnlocked || 0),
    achievementsTotal: ACHIEVEMENTS.length,
    puzzlesSolved: Number(rawExtras.puzzlesSolved || 0),
    personalPuzzles: Number(rawExtras.personalPuzzles || 0),
    rivalryRecord: rivalry.record,
    incidents: rivalry.incidents,
  };
  const worst = rawExtras.worstMove
    ? { moveReport: {
      played: rawExtras.worstMove.played,
      suggested: rawExtras.worstMove.suggested,
      loss: rawExtras.worstMove.loss,
    } }
    : null;
  return {
    insights,
    roast: generateRoast(insights, worst, extras),
    coaching: generateCoaching(insights, rivalry, extras),
    autopsy: buildWorstMoveAutopsy(payload, rawExtras.worstMove),
    portraitFacts: buildPlayerPortraitFacts(insights, rivalry, extras, worst),
  };
}
