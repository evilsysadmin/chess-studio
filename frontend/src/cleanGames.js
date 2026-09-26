import { STORAGE_LOCAL, readJsonStorage } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';
import { buildPostGameIncidentEvidence } from './postGameIncidentEvidence.js';

export const CLEAN_GAMES_KEY = 'chess-study-clean-games-v1';
export const CLEAN_GAME_MIN_ANALYZED_MOVES = 8;
export const CLEAN_GAME_INCIDENT_COVERAGE_VERSION = 1;
export const CLEAN_GAME_POSITIVE_EVIDENCE_VERSION = 1;
const MAX_RECORDS = 100;
const MAJOR_MINOR = new Set(['q', 'r', 'b', 'n']);

function safeRecords() {
  const parsed = readJsonStorage(STORAGE_LOCAL, CLEAN_GAMES_KEY, { fallback: {} });
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function finiteRows(report) {
  return (Array.isArray(report?.moveReports) ? report.moveReports : []).filter((row) => Number.isFinite(row?.loss));
}

function incidentCoverage(rows) {
  const keys = new Set();
  let coveredMoves = 0;
  for (const row of rows) {
    const evidence = buildPostGameIncidentEvidence(row);
    if (!evidence) continue;
    coveredMoves += 1;
    for (const key of evidence.incidentKeys || []) {
      if (key) keys.add(key);
    }
  }
  return {
    version: CLEAN_GAME_INCIDENT_COVERAGE_VERSION,
    coveredMoves,
    sufficient: coveredMoves >= CLEAN_GAME_MIN_ANALYZED_MOVES,
    incidentKeys: [...keys].sort(),
  };
}

function normalizedPromotion(value) {
  const promotion = String(value || '').trim().toLowerCase();
  return promotion || null;
}

function comparableMoveIdentity(row) {
  const playedFrom = String(row?.playedFrom || '').trim().toLowerCase();
  const playedTo = String(row?.playedTo || '').trim().toLowerCase();
  const suggestedFrom = String(row?.suggestedFrom || '').trim().toLowerCase();
  const suggestedTo = String(row?.suggestedTo || '').trim().toLowerCase();
  if (playedFrom && playedTo && suggestedFrom && suggestedTo) {
    return {
      comparable: true,
      matches: playedFrom === suggestedFrom
        && playedTo === suggestedTo
        && normalizedPromotion(row?.playedPromotion) === normalizedPromotion(row?.suggestedPromotion),
    };
  }

  const played = String(row?.played || '').trim();
  const suggested = String(row?.suggested || '').trim();
  if (!played || !suggested) return { comparable: false, matches: false };
  return { comparable: true, matches: played === suggested };
}

function positiveDecisionEvidence(rows) {
  let comparedMoves = 0;
  let enginePreferredMoves = 0;
  for (const row of rows) {
    const identity = comparableMoveIdentity(row);
    if (!identity.comparable) continue;
    comparedMoves += 1;
    if (identity.matches) enginePreferredMoves += 1;
  }
  return {
    version: CLEAN_GAME_POSITIVE_EVIDENCE_VERSION,
    comparedMoves,
    enginePreferredMoves,
  };
}

export function cleanGameEvidence(report, meta = {}) {
  const rows = finiteRows(report);
  const coverage = incidentCoverage(rows);
  const positive = positiveDecisionEvidence(rows);
  const analyzedCount = Math.max(0, Number(report?.analyzedCount || rows.length) || 0);
  const blunders = rows.filter((row) => row.severity === 'blunder' || Number(row.loss) >= 150).length;
  const mistakes = rows.filter((row) => row.severity === 'mistake' || (Number(row.loss) >= 60 && Number(row.loss) < 150)).length;
  const materialGifts = rows.filter((row) => (
    Number(row.loss) >= 60
    && row.context?.reply?.capturedPlayedPiece === true
    && MAJOR_MINOR.has(String(row.context?.played?.piece || row.playedPiece || '').toLowerCase())
  )).length;
  const missedMates = rows.filter((row) => (
    (row.context?.suggested?.checkmate === true || String(row.suggested || '').includes('#'))
    && row.context?.played?.checkmate !== true
    && !String(row.played || '').includes('#')
  )).length;
  const sufficientSample = analyzedCount >= CLEAN_GAME_MIN_ANALYZED_MOVES;
  const clean = sufficientSample && blunders === 0 && mistakes === 0 && materialGifts === 0 && missedMates === 0;
  const maxLoss = rows.length ? Math.max(...rows.map((row) => Math.max(0, Number(row.loss) || 0))) : null;

  return {
    version: 1,
    gameId: meta.gameId ? String(meta.gameId) : null,
    date: meta.date || new Date().toISOString(),
    analyzedCount,
    sufficientSample,
    clean,
    blunders,
    mistakes,
    materialGifts,
    missedMates,
    maxLoss,
    averageLoss: Number.isFinite(Number(report?.averageLoss)) ? Number(report.averageLoss) : null,
    incidentCoverageVersion: coverage.version,
    incidentCoveredMoves: coverage.coveredMoves,
    incidentCoverageSufficient: coverage.sufficient,
    incidentKeys: coverage.incidentKeys,
    positiveEvidenceVersion: positive.version,
    positiveComparedMoves: positive.comparedMoves,
    enginePreferredMoves: positive.enginePreferredMoves,
  };
}

export function competitiveGameSignals(report, meta = {}) {
  const rows = finiteRows(report);
  const analyzedCount = Math.max(0, Number(report?.analyzedCount || rows.length) || 0);
  if (analyzedCount < CLEAN_GAME_MIN_ANALYZED_MOVES) {
    return { sufficientSample: false, closeGame: false, winningPositionEscaped: false, stalemateFromWinningPosition: false };
  }

  const humanEvaluations = rows
    .map((row) => Number(row?.humanEvaluation ?? row?.evaluation ?? row?.eval))
    .filter(Number.isFinite);
  const peakAdvantage = humanEvaluations.length ? Math.max(...humanEvaluations) : null;
  const decisiveAdvantageReached = Number.isFinite(peakAdvantage) && peakAdvantage >= 300;
  const outcome = String(meta?.outcome || report?.outcome || '').toLowerCase();
  const termination = String(meta?.termination || report?.termination || '').toLowerCase();
  const escaped = decisiveAdvantageReached && outcome !== 'win';
  const stalemate = outcome === 'draw' && /stalemate|ahogado/.test(termination);

  // closeGame es deliberadamente conservador: si no tenemos una evaluación
  // comparable no inventamos dramatismo. Sirve como señal UX, no como rating.
  const finalEvaluation = humanEvaluations.length ? humanEvaluations.at(-1) : null;
  const closeGame = Number.isFinite(finalEvaluation) && Math.abs(finalEvaluation) <= 150;

  return {
    sufficientSample: true,
    closeGame,
    winningPositionEscaped: escaped,
    stalemateFromWinningPosition: escaped && stalemate,
    peakAdvantage,
  };
}

export function recordCleanGameEvidence(gameId, report, meta = {}) {
  if (!gameId || !report) return null;
  const evidence = cleanGameEvidence(report, { ...meta, gameId });
  const records = safeRecords();
  records[String(gameId)] = evidence;
  const pruned = Object.fromEntries(Object.entries(records)
    .sort((a, b) => new Date(b[1]?.date || 0) - new Date(a[1]?.date || 0))
    .slice(0, MAX_RECORDS));
  setProfileStorageItem(CLEAN_GAMES_KEY, JSON.stringify(pruned));
  return evidence;
}

export function loadCleanGameRecords() {
  return safeRecords();
}

export function cleanGameSummary(records = loadCleanGameRecords()) {
  const eligible = Object.values(records || {})
    .filter((row) => row?.version === 1 && row.sufficientSample === true)
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  const clean = eligible.filter((row) => row.clean === true);
  let currentStreak = 0;
  for (let i = eligible.length - 1; i >= 0 && eligible[i].clean; i -= 1) currentStreak += 1;
  let bestStreak = 0;
  let running = 0;
  for (const row of eligible) {
    running = row.clean ? running + 1 : 0;
    bestStreak = Math.max(bestStreak, running);
  }
  return {
    eligible: eligible.length,
    clean: clean.length,
    rate: eligible.length ? Math.round(clean.length / eligible.length * 100) : null,
    currentStreak,
    bestStreak,
    latest: eligible.at(-1) || null,
    latestClean: [...clean].reverse()[0] || null,
  };
}
