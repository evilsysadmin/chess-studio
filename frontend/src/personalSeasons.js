import { isCompetitiveHistoryRecord } from './gameHistory.js';

export const PERSONAL_SEASON_TARGET = 20;

function validTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function competitiveRows(history = []) {
  return (Array.isArray(history) ? history : [])
    .filter(isCompetitiveHistoryRecord)
    .filter((record) => String(record?.mode || '') !== 'nemesis-training')
    .sort((a, b) => validTime(a.date) - validTime(b.date));
}

function openingReport(rows) {
  const groups = new Map();
  for (const row of rows) {
    const opening = String(row?.opening || '').trim();
    if (!opening) continue;
    const bucket = groups.get(opening) || { opening, games: 0, wins: 0, draws: 0, losses: 0, points: 0 };
    bucket.games += 1;
    if (row.outcome === 'win') { bucket.wins += 1; bucket.points += 1; }
    else if (row.outcome === 'draw') { bucket.draws += 1; bucket.points += 0.5; }
    else bucket.losses += 1;
    groups.set(opening, bucket);
  }
  const candidates = [...groups.values()]
    .filter((row) => row.games >= 2)
    .map((row) => ({ ...row, scorePct: Math.round((row.points / row.games) * 100) }))
    .sort((a, b) => b.scorePct - a.scorePct || b.games - a.games || a.opening.localeCompare(b.opening));
  return candidates[0] || null;
}

function bestWin(rows) {
  return rows
    .filter((row) => row.outcome === 'win')
    .sort((a, b) => Number(b.difficulty || 0) - Number(a.difficulty || 0) || (a.moves?.length || Infinity) - (b.moves?.length || Infinity))[0] || null;
}

function worstBlunder(rows, archive = {}) {
  const candidates = [];
  for (const row of rows) {
    const analysis = archive?.[row.id] || archive?.[row.sourceGameId];
    const loss = Number(analysis?.worst?.loss);
    if (!Number.isFinite(loss)) continue;
    candidates.push({
      gameId: row.id,
      loss: Math.max(0, Math.round(loss)),
      san: analysis?.worst?.played || analysis?.worst?.san || null,
      opening: row.opening || null,
      difficulty: Number(row.difficulty || 0),
      date: row.date || null,
    });
  }
  return candidates.sort((a, b) => b.loss - a.loss)[0] || null;
}

function ratingRows(history = []) {
  return (Array.isArray(history) ? history : [])
    .map((point) => ({ time: validTime(point?.date), rating: Number(point?.rating ?? point) }))
    .filter((point) => point.time > 0 && Number.isFinite(point.rating))
    .sort((a, b) => a.time - b.time);
}

function ratingDeltaForSeason(rows, ratingHistory = []) {
  if (!rows.length) return null;
  const points = ratingRows(ratingHistory);
  if (!points.length) return null;
  const start = validTime(rows[0].date);
  const end = validTime(rows.at(-1).date);
  // recordRatingHistory() se ejecuta instantes antes de guardar el registro de
  // partida. Damos un margen mínimo para asociar ese checkpoint sin mezclar
  // sesiones separadas ni fingir un rating que no tenemos.
  const windowStart = start - 60_000;
  const windowEnd = end + 60_000;
  const inWindow = points.filter((point) => point.time >= windowStart && point.time <= windowEnd);
  if (!inWindow.length) return null;
  const previous = [...points].reverse().find((point) => point.time < windowStart) || null;
  const first = inWindow[0];
  const last = inWindow.at(-1);
  const baseline = previous || (inWindow.length >= 2 ? first : null);
  if (!baseline) return null;
  return {
    before: baseline.rating,
    after: last.rating,
    delta: last.rating - baseline.rating,
    exactBaseline: Boolean(previous),
  };
}

function buildSeason(rows, index, ratingHistory, archive) {
  const wins = rows.filter((row) => row.outcome === 'win').length;
  const draws = rows.filter((row) => row.outcome === 'draw').length;
  const losses = rows.filter((row) => row.outcome === 'loss').length;
  return {
    number: index + 1,
    games: rows.length,
    target: PERSONAL_SEASON_TARGET,
    complete: rows.length >= PERSONAL_SEASON_TARGET,
    wins,
    draws,
    losses,
    scorePct: rows.length ? Math.round(((wins + draws * 0.5) / rows.length) * 100) : 0,
    startedAt: rows[0]?.date || null,
    endedAt: rows.at(-1)?.date || null,
    rating: ratingDeltaForSeason(rows, ratingHistory),
    bestOpening: openingReport(rows),
    bestWin: bestWin(rows),
    worstBlunder: worstBlunder(rows, archive),
  };
}

export function buildPersonalSeasons(history = [], ratingHistory = [], archive = {}) {
  const rows = competitiveRows(history);
  if (!rows.length) {
    return [{
      number: 1, games: 0, target: PERSONAL_SEASON_TARGET, complete: false,
      wins: 0, draws: 0, losses: 0, scorePct: 0, startedAt: null, endedAt: null,
      rating: null, bestOpening: null, bestWin: null, worstBlunder: null,
    }];
  }
  const seasons = [];
  for (let start = 0; start < rows.length; start += PERSONAL_SEASON_TARGET) {
    seasons.push(buildSeason(rows.slice(start, start + PERSONAL_SEASON_TARGET), seasons.length, ratingHistory, archive));
  }
  return seasons;
}

export function currentPersonalSeason(history = [], ratingHistory = [], archive = {}) {
  return buildPersonalSeasons(history, ratingHistory, archive).at(-1);
}

export function latestCompletedPersonalSeason(history = [], ratingHistory = [], archive = {}) {
  return [...buildPersonalSeasons(history, ratingHistory, archive)].reverse().find((season) => season.complete) || null;
}
