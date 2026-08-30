import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

export const CLEAN_GAMES_KEY = 'chess-study-clean-games-v1';
export const CLEAN_GAME_MIN_ANALYZED_MOVES = 8;
const MAX_RECORDS = 100;
const MAJOR_MINOR = new Set(['q', 'r', 'b', 'n']);

function safeRecords() {
  try {
    const parsed = JSON.parse(getStorageItem(STORAGE_LOCAL, CLEAN_GAMES_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function finiteRows(report) {
  return (Array.isArray(report?.moveReports) ? report.moveReports : []).filter((row) => Number.isFinite(row?.loss));
}

export function cleanGameEvidence(report, meta = {}) {
  const rows = finiteRows(report);
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
