import { cleanGameEvidence, recordCleanGameEvidence } from './cleanGames.js';
import { archiveAnalysis } from './advancedCareer.js';

export function finalizePostGameAnalysisEvidence({ finishedGame, outcome, endMeta = {}, opening, timeControlId = 'none' }) {
  const analysisReport = endMeta.analysisReport || null;
  if (!analysisReport || !finishedGame?.id) return null;
  const meta = {
    gameId: finishedGame.id,
    date: new Date().toISOString(),
    outcome,
    difficulty: finishedGame.difficulty,
    opening,
    timeControlId,
    pressureMoves: Number(endMeta.pressureMoves || 0),
    pressureIncidents: Number(endMeta.pressureIncidents || 0),
  };
  const evidence = cleanGameEvidence(analysisReport, meta);
  archiveAnalysis(finishedGame.id, analysisReport, meta);
  recordCleanGameEvidence(finishedGame.id, analysisReport, meta);
  return evidence;
}

export function ratingImpactDetail(summary) {
  const quality = Number(summary?.performanceDelta || 0);
  const qualityDetail = quality ? ` · cuaderno ${quality > 0 ? '+' : ''}${quality}` : '';
  return `Rating ${summary.eloDelta >= 0 ? '+' : ''}${summary.eloDelta} · ${summary.eloBefore} → ${summary.eloAfter}${qualityDetail}`;
}
