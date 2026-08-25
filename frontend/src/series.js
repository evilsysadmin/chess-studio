import { STORAGE_LOCAL, getStorageItem, setStorageItem, removeStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

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

export function validateSeriesState(parsed) {
  if (!parsed || ![3, 5].includes(Number(parsed.bestOf))) return null;
  const bestOf = Number(parsed.bestOf);
  const winsNeeded = Math.floor(bestOf / 2) + 1;
  const humanWins = Math.max(0, Number(parsed.humanWins || 0));
  const cpuWins = Math.max(0, Number(parsed.cpuWins || 0));
  const draws = Math.max(0, Number(parsed.draws || 0));
  const games = Array.isArray(parsed.games) ? parsed.games.filter((g) => ['win','loss','draw'].includes(g?.outcome)) : [];
  if (humanWins + cpuWins + draws !== games.length) return null;
  if (humanWins > winsNeeded || cpuWins > winsNeeded) return null;
  const winner = humanWins >= winsNeeded ? 'human' : cpuWins >= winsNeeded ? 'cpu' : null;
  if (parsed.winner && parsed.winner !== winner) return null;
  return {
    ...parsed, bestOf, winsNeeded, humanWins, cpuWins, draws, games,
    nextColor: normalizeColor(parsed.nextColor), winner,
    currentGameId: winner ? null : (parsed.currentGameId || null),
  };
}

export function loadActiveSeries() {
  try {
    const raw = getStorageItem(STORAGE_LOCAL, ACTIVE_KEY);
    if (!raw) return null;
    return validateSeriesState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveActiveSeries(series) {
  if (!series) {
    removeStorageItem(STORAGE_LOCAL, ACTIVE_KEY);
    return null;
  }
  // Es estado de sesión: no se sincroniza con Mongo porque incluye game_id
  // efímeros del backend. Se persiste localmente para sobrevivir a un refresh.
  setStorageItem(STORAGE_LOCAL, ACTIVE_KEY, JSON.stringify(series));
  return series;
}

export function clearActiveSeries() {
  removeStorageItem(STORAGE_LOCAL, ACTIVE_KEY);
  return null;
}

export function loadSeriesHistory() {
  try {
    const raw = getStorageItem(STORAGE_LOCAL, HISTORY_KEY);
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
  if (!['win', 'loss', 'draw'].includes(outcome)) throw new Error(`Resultado de serie inválido: ${outcome}`);
  if (meta.gameId && (series.games || []).some((g) => g.gameId === meta.gameId)) return series;
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

function seriesScoreText(series) {
  if (!series) return '';
  return `Tú ${series.humanWins} · CPU ${series.cpuWins}${series.draws ? ` · tablas ${series.draws}` : ''}`;
}

export function seriesStatusText(series) {
  if (!series) return '';
  if (series.winner === 'human') return `Serie ganada ${series.humanWins}-${series.cpuWins}`;
  if (series.winner === 'cpu') return `Serie perdida ${series.humanWins}-${series.cpuWins}`;
  return `Mejor de ${series.bestOf} · ${seriesScoreText(series)}`;
}

// Narrativa puramente derivada del marcador. No añade estado, azar ni hechos
// inventados: sirve para que BO3/BO5 se sientan como una serie sin convertir
// la pantalla en otro modo de juego distinto.
export function seriesLiveMoment(series) {
  if (!series) return null;
  if (series.winner) {
    return {
      kind: 'finished',
      label: 'SERIE CERRADA',
      headline: seriesHeadline(series),
      detail: 'El resultado ya está archivado en el expediente de series.',
    };
  }

  const winsNeeded = Number(series.winsNeeded || Math.floor(Number(series.bestOf || 3) / 2) + 1);
  const humanWins = Number(series.humanWins || 0);
  const cpuWins = Number(series.cpuWins || 0);
  const played = Array.isArray(series.games) ? series.games.length : 0;
  const humanNeed = Math.max(0, winsNeeded - humanWins);
  const cpuNeed = Math.max(0, winsNeeded - cpuWins);

  if (played === 0) return { kind: 'opening', label: 'ARRANQUE', headline: `Mejor de ${series.bestOf}`, detail: `Primero en llegar a ${winsNeeded} victorias.` };
  if (humanNeed === 1 && cpuNeed === 1) return { kind: 'decider', label: 'TODO O NADA', headline: 'La próxima victoria cierra la serie', detail: `Marcador ${humanWins}-${cpuWins}. Unas tablas sólo aplazan la sentencia.` };
  if (humanNeed === 1) return { kind: 'human-match-point', label: 'PUNTO DE SERIE', headline: 'Puedes cerrarla en la siguiente', detail: `Mandas ${humanWins}-${cpuWins}; una victoria más y se acabó.` };
  if (cpuNeed === 1) return { kind: 'cpu-match-point', label: 'CONTRA LAS CUERDAS', headline: 'La CPU puede cerrar la serie', detail: `Vas ${humanWins}-${cpuWins}; necesitas responder antes de que firme el acta.` };
  if (humanWins > cpuWins) return { kind: 'leading', label: 'VENTAJA', headline: `Mandas ${humanWins}-${cpuWins}`, detail: 'La siguiente puede convertir ventaja en punto de serie.' };
  if (cpuWins > humanWins) return { kind: 'trailing', label: 'TOCA REMONTAR', headline: `Vas ${humanWins}-${cpuWins}`, detail: 'La serie sigue abierta, pero ya no sobra margen.' };
  return { kind: 'tied', label: 'IGUALADA', headline: `Marcador ${humanWins}-${cpuWins}`, detail: 'Nadie tiene aún punto de serie.' };
}

export function seriesNextActionLabel(series) {
  const moment = seriesLiveMoment(series);
  if (!moment || moment.kind === 'finished') return 'Volver al menú';
  if (moment.kind === 'decider') return 'Jugar la decisiva';
  if (moment.kind === 'human-match-point') return 'Intentar cerrar la serie';
  if (moment.kind === 'cpu-match-point') return 'Seguir vivo en la serie';
  return 'Siguiente partida de la serie';
}



function completedSeriesRows(history) {
  return (Array.isArray(history) ? history : []).filter((series) =>
    series && [3, 5].includes(Number(series.bestOf)) && ['human', 'cpu'].includes(series.winner)
  );
}

export function seriesFacts(series) {
  if (!series || !['human', 'cpu'].includes(series.winner)) {
    return { winner: null, sweep: false, comeback: false, decider: false };
  }
  const games = Array.isArray(series.games) ? series.games : [];
  const winsNeeded = Number(series.winsNeeded || Math.floor(Number(series.bestOf || 3) / 2) + 1);
  let human = 0;
  let cpu = 0;
  let humanTrailed = false;
  let cpuTrailed = false;
  let beforeLastHuman = 0;
  let beforeLastCpu = 0;

  games.forEach((game, index) => {
    if (index === games.length - 1) {
      beforeLastHuman = human;
      beforeLastCpu = cpu;
    }
    if (game?.outcome === 'win') human += 1;
    else if (game?.outcome === 'loss') cpu += 1;
    if (human < cpu) humanTrailed = true;
    if (cpu < human) cpuTrailed = true;
  });

  const loserWins = series.winner === 'human' ? Number(series.cpuWins || cpu) : Number(series.humanWins || human);
  const sweep = loserWins === 0 && Number(series.draws || 0) === 0;
  const comeback = series.winner === 'human' ? humanTrailed : cpuTrailed;
  const decider = beforeLastHuman === winsNeeded - 1 && beforeLastCpu === winsNeeded - 1;
  return { winner: series.winner, sweep, comeback, decider };
}

export function seriesHistoryStats(history = loadSeriesHistory()) {
  const rows = completedSeriesRows(history);
  const chronological = [...rows].sort((a, b) => new Date(a.completedAt || 0) - new Date(b.completedAt || 0));
  const stats = {
    total: rows.length,
    won: 0,
    lost: 0,
    currentStreak: 0,
    bestHumanStreak: 0,
    bestCpuStreak: 0,
    humanSweeps: 0,
    cpuSweeps: 0,
    humanComebacks: 0,
    cpuComebacks: 0,
    deciders: 0,
  };

  let signed = 0;
  for (const series of chronological) {
    const facts = seriesFacts(series);
    if (series.winner === 'human') {
      stats.won += 1;
      signed = signed >= 0 ? signed + 1 : 1;
      stats.bestHumanStreak = Math.max(stats.bestHumanStreak, signed);
      if (facts.sweep) stats.humanSweeps += 1;
      if (facts.comeback) stats.humanComebacks += 1;
    } else {
      stats.lost += 1;
      signed = signed <= 0 ? signed - 1 : -1;
      stats.bestCpuStreak = Math.max(stats.bestCpuStreak, Math.abs(signed));
      if (facts.sweep) stats.cpuSweeps += 1;
      if (facts.comeback) stats.cpuComebacks += 1;
    }
    if (facts.decider) stats.deciders += 1;
  }
  stats.currentStreak = signed;
  return stats;
}

export function seriesHeadline(series) {
  if (!series || !['human', 'cpu'].includes(series.winner)) return 'Serie sin cerrar';
  const facts = seriesFacts(series);
  const human = Number(series.humanWins || 0);
  const cpu = Number(series.cpuWins || 0);
  const score = `${human}-${cpu}`;
  const owner = series.winner === 'human' ? 'Victoria' : 'Derrota';
  if (facts.sweep) return `${owner} por barrida · ${score}`;
  if (facts.comeback) return `${owner} con remontada · ${score}`;
  if (facts.decider) return `${owner} en la decisiva · ${score}`;
  return `${owner} · ${score}`;
}
