import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

const KEY = 'chess-study-daily-challenge';

export const DAILY_CHALLENGE_SLOTS = Object.freeze([
  { id: 'tactic', label: 'Táctica', title: 'Golpe táctico', description: 'Una posición corta para encontrar la idea correcta.' },
  { id: 'precision', label: 'Precisión', title: 'Sin regalar nada', description: 'Resuélvela; si sale limpia, queda registrado.' },
  { id: 'finish', label: 'Remate', title: 'Cierra el expediente', description: 'La tercera posición del día. Completar las tres da pleno.' },
]);

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

export function dailyPuzzles(pool, date = new Date()) {
  if (!pool?.length) return [];
  const day = dailyChallengeDayKey(date);
  const ranked = [...pool].sort((a, b) => {
    const ah = hash(`${day}:${a?.id || a?.title || ''}`);
    const bh = hash(`${day}:${b?.id || b?.title || ''}`);
    return ah - bh || String(a?.id || '').localeCompare(String(b?.id || ''));
  });
  return DAILY_CHALLENGE_SLOTS.map((slot, index) => ({
    ...ranked[index % ranked.length],
    dailyKey: day,
    dailySlot: slot.id,
    dailySlotLabel: slot.label,
  }));
}

export function dailyPuzzle(pool, date = new Date(), slot = 'tactic') {
  const puzzles = dailyPuzzles(pool, date);
  if (!puzzles.length) return null;
  const index = Math.max(0, DAILY_CHALLENGE_SLOTS.findIndex((item) => item.id === slot));
  return puzzles[index] || puzzles[0];
}

function normalizeResult(result) {
  if (!result || typeof result !== 'object') return { slots: {} };
  const slots = result.slots && typeof result.slots === 'object' ? { ...result.slots } : {};
  // Compatibilidad con el desafío único anterior: cuenta como el primer reto.
  if (result.solved && !slots.tactic) {
    slots.tactic = { solved: true, ...(typeof result.clean === 'boolean' ? { clean: result.clean } : {}) };
  }
  return { ...result, slots };
}

export function loadDailyChallenge() {
  try {
    const parsed = JSON.parse(getStorageItem(STORAGE_LOCAL, KEY) || '{}');
    const rawResults = parsed?.results && typeof parsed.results === 'object' ? parsed.results : {};
    const results = Object.fromEntries(Object.entries(rawResults).map(([day, result]) => [day, normalizeResult(result)]));
    return { solvedDates: [], bestStreak: 0, results, ...parsed, results };
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

export function dailyChallengeProgress(state = {}, day = dailyChallengeDayKey()) {
  const result = normalizeResult(state?.results?.[day]);
  const slots = Object.fromEntries(DAILY_CHALLENGE_SLOTS.map((slot) => [slot.id, result.slots?.[slot.id] || null]));
  const solvedCount = DAILY_CHALLENGE_SLOTS.filter((slot) => Boolean(slots[slot.id]?.solved)).length;
  const cleanCount = DAILY_CHALLENGE_SLOTS.filter((slot) => slots[slot.id]?.clean === true).length;
  return {
    day,
    slots,
    solvedCount,
    cleanCount,
    full: solvedCount === DAILY_CHALLENGE_SLOTS.length,
  };
}

export function dailyChallengeStats(state = {}) {
  const results = state?.results && typeof state.results === 'object' ? state.results : {};
  const solvedDates = new Set(Array.isArray(state?.solvedDates) ? state.solvedDates : []);
  let completedChallenges = 0;
  let fullDays = 0;
  let cleanFullDays = 0;

  for (const day of new Set([...solvedDates, ...Object.keys(results)])) {
    const progress = dailyChallengeProgress(state, day);
    // Los perfiles del desafío único anterior pueden tener sólo solvedDates.
    const solvedCount = progress.solvedCount || (solvedDates.has(day) ? 1 : 0);
    completedChallenges += solvedCount;
    if (progress.full) fullDays += 1;
    if (progress.full && progress.cleanCount === DAILY_CHALLENGE_SLOTS.length) cleanFullDays += 1;
  }

  return {
    completedChallenges,
    activeDays: new Set([...solvedDates, ...Object.keys(results).filter((day) => dailyChallengeProgress(state, day).solvedCount > 0)]).size,
    fullDays,
    cleanFullDays,
    bestStreak: Math.max(0, Number(state?.bestStreak) || 0),
  };
}

export function markDailySolved(day = dailyChallengeDayKey(), { clean = null, slot = 'tactic' } = {}) {
  const state = loadDailyChallenge();
  const firstSolveOfDay = !state.solvedDates.includes(day);
  const previousBest = Math.max(0, Number(state.bestStreak) || 0);
  state.results = state.results && typeof state.results === 'object' ? state.results : {};
  const result = normalizeResult(state.results[day]);
  const knownSlot = DAILY_CHALLENGE_SLOTS.some((item) => item.id === slot) ? slot : 'tactic';

  if (!result.slots[knownSlot]?.solved) {
    result.slots[knownSlot] = { solved: true, ...(typeof clean === 'boolean' ? { clean } : {}) };
  }
  if (firstSolveOfDay) state.solvedDates.push(day);
  state.solvedDates = state.solvedDates.sort().slice(-120);
  const streak = streakFromDates(state.solvedDates);
  const progress = dailyChallengeProgress({ ...state, results: { ...state.results, [day]: result } }, day);
  state.results[day] = {
    ...result,
    solved: progress.solvedCount > 0,
    full: progress.full,
    newBest: firstSolveOfDay && streak > previousBest,
  };
  state.bestStreak = Math.max(previousBest, streak);
  setProfileStorageItem(KEY, JSON.stringify(state));
  return { ...state, streak };
}

export function dailyChallengeBrief(state = {}, day = dailyChallengeDayKey()) {
  const solvedDates = Array.isArray(state?.solvedDates) ? state.solvedDates : [];
  const solved = Boolean(day && solvedDates.includes(day));
  const streak = Math.max(0, Number(state?.streak) || 0);
  const progress = dailyChallengeProgress(state, day);

  if (!solved || progress.solvedCount === 0) {
    if (streak >= 7) return { solved: false, full: false, solvedCount: 0, headline: `Racha de ${streak} días en juego`, detail: 'Tres retos hoy. Con uno mantienes la racha; 3/3 firma el pleno.' };
    if (streak >= 2) return { solved: false, full: false, solvedCount: 0, headline: `${streak} días seguidos. Falta hoy.`, detail: 'Tres retos disponibles. Uno mantiene la racha; tú decides cuánto sufrir.' };
    return { solved: false, full: false, solvedCount: 0, headline: 'Hoy · 0/3', detail: 'Tres posiciones. Completa al menos una para mantener la racha.' };
  }

  if (!progress.full) {
    return {
      solved: true,
      full: false,
      solvedCount: progress.solvedCount,
      headline: `Hoy · ${progress.solvedCount}/3`,
      detail: `Racha asegurada${streak ? ` (${streak} día${streak === 1 ? '' : 's'})` : ''}. El pleno sigue disponible.`,
    };
  }

  if (progress.cleanCount === DAILY_CHALLENGE_SLOTS.length) {
    return { solved: true, full: true, solvedCount: 3, headline: 'Pleno diario · 3/3 limpio', detail: `Racha ${streak || 1}. Ni una mancha en el expediente.` };
  }
  return { solved: true, full: true, solvedCount: 3, headline: 'Pleno diario · 3/3', detail: `Racha ${streak || 1}. Hubo negociación, pero están los tres.` };
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
