import { setProfileStorageItem, removeProfileStorageItem } from './profileKeys.js';

const ACTIVE_KEY = 'chess-study-active-series';
const HISTORY_KEY = 'chess-study-series-history';
const MAX_HISTORY = 20;

export const SERIES_OPTIONS = [
  { value: 1, label: 'Partida única' },
  { value: 3, label: 'Mejor de 3' },
  { value: 5, label: 'Mejor de 5' },
];

function normalizeColor(color) {
  return color === 'b' ? 'b' : 'w';
}

export function createSeries({ bestOf, difficulty, firstColor, timeControlId = 'none' }) {
  const n = Number(bestOf);
  if (![3, 5].includes(n)) return null;
  const color = normalizeColor(firstColor);
  return {
    version: 1,
    id: `series-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    bestOf: n,
    winsNeeded: Math.floor(n / 2) + 1,
    difficulty: Number(difficulty),
    timeControlId,
    humanWins: 0,
    cpuWins: 0,
    draws: 0,
    games: [],
    currentGameId: null,
    nextColor: color,
    winner: null,
    completedAt: null,
  };
}

export function loadActiveSeries() {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (![3, 5].includes(Number(parsed?.bestOf))) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveActiveSeries(series) {
  if (!series) {
    localStorage.removeItem(ACTIVE_KEY);
    return null;
  }
  // Es estado de sesión: no se sincroniza con Mongo porque incluye game_id
  // efímeros del backend. Se persiste localmente para sobrevivir a un refresh.
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(series));
  return series;
}

export function clearActiveSeries() {
  localStorage.removeItem(ACTIVE_KEY);
  return null;
}

export function loadSeriesHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function archiveCompletedSeries(series) {
  const history = loadSeriesHistory();
  if (history.some((item) => item.id === series.id)) return history;
  history.unshift(series);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  setProfileStorageItem(HISTORY_KEY, JSON.stringify(history));
  return history;
}

export function recordSeriesGame(series, outcome, meta = {}) {
  if (!series || series.winner) return series;
  const next = {
    ...series,
    games: [...(series.games || [])],
  };
  if (outcome === 'win') next.humanWins += 1;
  else if (outcome === 'loss') next.cpuWins += 1;
  else next.draws += 1;

  const humanColor = normalizeColor(meta.humanColor);
  next.games.push({
    date: new Date().toISOString(),
    outcome,
    humanColor,
    gameId: meta.gameId || null,
    moves: Number(meta.moves || 0),
    opening: meta.opening || null,
  });
  next.nextColor = humanColor === 'w' ? 'b' : 'w';
  next.currentGameId = null;

  if (next.humanWins >= next.winsNeeded) next.winner = 'human';
  else if (next.cpuWins >= next.winsNeeded) next.winner = 'cpu';

  if (next.winner) {
    next.completedAt = new Date().toISOString();
    archiveCompletedSeries(next);
  }
  return saveActiveSeries(next);
}

export function seriesScoreText(series) {
  if (!series) return '';
  return `Tú ${series.humanWins} · CPU ${series.cpuWins}${series.draws ? ` · tablas ${series.draws}` : ''}`;
}

export function seriesStatusText(series) {
  if (!series) return '';
  if (series.winner === 'human') return `Serie ganada ${series.humanWins}-${series.cpuWins}`;
  if (series.winner === 'cpu') return `Serie perdida ${series.humanWins}-${series.cpuWins}`;
  return `Mejor de ${series.bestOf} · ${seriesScoreText(series)}`;
}

export function clearSeriesHistory() {
  removeProfileStorageItem(HISTORY_KEY);
  return [];
}
