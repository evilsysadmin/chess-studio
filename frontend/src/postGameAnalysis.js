import { analyzeGame } from './gameReport.js';

const completed = new Map();
const inFlight = new Map();

function normalizedGameId(gameId) {
  const value = String(gameId || '').trim();
  return value || null;
}

export function getCompletedPostGameAnalysis(gameId) {
  const id = normalizedGameId(gameId);
  return id ? completed.get(id) || null : null;
}

export function clearPostGameAnalysisCache(gameId = null) {
  const id = normalizedGameId(gameId);
  if (id) {
    completed.delete(id);
    inFlight.delete(id);
    return;
  }
  completed.clear();
  inFlight.clear();
}

export function analyzeCompletedGameOnce({
  gameId,
  history,
  humanColor,
  api,
  initialFen = null,
  analyze = analyzeGame,
}) {
  const id = normalizedGameId(gameId);
  if (id && completed.has(id)) return Promise.resolve(completed.get(id));
  if (id && inFlight.has(id)) return inFlight.get(id);

  const rows = Array.isArray(history) ? history : [];
  const promise = Promise.resolve(analyze(rows, humanColor, api, {
    initialFen,
    maxMoves: rows.length,
  })).then((report) => {
    if (id) completed.set(id, report);
    return report;
  }).finally(() => {
    if (id) inFlight.delete(id);
  });

  if (id) inFlight.set(id, promise);
  return promise;
}
