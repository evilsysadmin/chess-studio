import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

const KEY = 'chess-study-daily-challenge';

export function dailyChallengeDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function dailyPuzzle(pool, date = new Date()) {
  if (!pool?.length) return null;
  const day = dailyChallengeDayKey(date);
  return { ...pool[hash(day) % pool.length], dailyKey: day };
}

export function loadDailyChallenge() {
  try {
    const parsed = JSON.parse(getStorageItem(STORAGE_LOCAL, KEY) || '{}');
    return { solvedDates: [], bestStreak: 0, results: {}, ...parsed, results: parsed?.results && typeof parsed.results === 'object' ? parsed.results : {} };
  } catch {
    return { solvedDates: [], bestStreak: 0, results: {} };
  }
}

function streakFromDates(dates) {
  const unique = [...new Set(dates)].sort().reverse();
  if (!unique.length) return 0;
  let streak = 1;
  let cursor = new Date(`${unique[0]}T12:00:00`);
  for (let i = 1; i < unique.length; i++) {
    cursor.setDate(cursor.getDate() - 1);
    if (dailyChallengeDayKey(cursor) === unique[i]) streak += 1;
    else break;
  }
  return streak;
}

export function markDailySolved(day = dailyChallengeDayKey(), { clean = null } = {}) {
  const state = loadDailyChallenge();
  const firstSolve = !state.solvedDates.includes(day);
  const previousBest = Math.max(0, Number(state.bestStreak) || 0);
  if (firstSolve) state.solvedDates.push(day);
  state.solvedDates = state.solvedDates.sort().slice(-120);
  state.results = state.results && typeof state.results === 'object' ? state.results : {};
  const streak = streakFromDates(state.solvedDates);
  if (!state.results[day]) {
    state.results[day] = { solved: true, ...(typeof clean === 'boolean' ? { clean } : {}), newBest: firstSolve && streak > previousBest };
  }
  state.bestStreak = Math.max(previousBest, streak);
  setProfileStorageItem(KEY, JSON.stringify(state));
  return { ...state, streak };
}

export function dailyChallengeBrief(state = {}, day = dailyChallengeDayKey()) {
  const solvedDates = Array.isArray(state?.solvedDates) ? state.solvedDates : [];
  const solved = Boolean(day && solvedDates.includes(day));
  const streak = Math.max(0, Number(state?.streak) || 0);
  const bestStreak = Math.max(0, Number(state?.bestStreak) || 0);
  const result = state?.results && typeof state.results === 'object' ? state.results[day] : null;

  if (!solved) {
    if (streak >= 7) return { solved, clean: null, headline: `Racha de ${streak} días en juego`, detail: 'Hoy toca defenderla. El tablero no acepta justificantes.' };
    if (streak >= 2) return { solved, clean: null, headline: `${streak} días seguidos. Falta hoy.`, detail: 'Una posición y fuera. Luego ya puedes presumir.' };
    return { solved, clean: null, headline: 'Desafío de hoy pendiente', detail: 'Una posición. Cero excusas administrativas.' };
  }

  const clean = typeof result?.clean === 'boolean' ? result.clean : null;
  const newBest = Boolean(result?.newBest) && streak >= 2;
  if (clean === true && newBest) return { solved, clean, headline: `Nueva mejor racha: ${streak} días`, detail: 'Y además limpio. Qué irritante nivel de competencia.' };
  if (clean === true) return { solved, clean, headline: 'Resuelto a la primera', detail: streak ? `Racha intacta: ${streak} día${streak === 1 ? '' : 's'}.` : 'Trabajo limpio. Puedes seguir con tu vida.' };
  if (clean === false) return { solved, clean, headline: 'Resuelto. Hubo negociación.', detail: streak ? `La racha sigue viva: ${streak} día${streak === 1 ? '' : 's'}.` : 'No fue limpio, pero cuenta. El expediente es misericordioso hoy.' };
  return { solved, clean: null, headline: 'Desafío de hoy resuelto', detail: streak ? `Racha actual: ${streak} día${streak === 1 ? '' : 's'}.` : 'Hecho. Sin necesidad de redactar un informe.' };
}


function activeStreakFromDates(dates, now = new Date()) {
  const unique = [...new Set(dates)].sort().reverse();
  if (!unique.length) return 0;
  const today = dailyChallengeDayKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setHours(12, 0, 0, 0);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = dailyChallengeDayKey(yesterdayDate);
  if (unique[0] !== today && unique[0] !== yesterday) return 0;
  return streakFromDates(unique);
}

export function currentDailyStreak(now = new Date()) {
  const state = loadDailyChallenge();
  return { ...state, streak: activeStreakFromDates(state.solvedDates, now) };
}
