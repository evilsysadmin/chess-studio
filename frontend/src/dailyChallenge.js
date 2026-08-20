import { setProfileStorageItem } from './profileKeys.js';

const KEY = 'chess-study-daily-challenge';

function localDateKey(date = new Date()) {
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
  const day = localDateKey(date);
  return { ...pool[hash(day) % pool.length], dailyKey: day };
}

export function loadDailyChallenge() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { solvedDates: [], bestStreak: 0, ...parsed };
  } catch {
    return { solvedDates: [], bestStreak: 0 };
  }
}

function streakFromDates(dates) {
  const unique = [...new Set(dates)].sort().reverse();
  if (!unique.length) return 0;
  let streak = 1;
  let cursor = new Date(`${unique[0]}T12:00:00`);
  for (let i = 1; i < unique.length; i++) {
    cursor.setDate(cursor.getDate() - 1);
    if (localDateKey(cursor) === unique[i]) streak += 1;
    else break;
  }
  return streak;
}

export function markDailySolved(day = localDateKey()) {
  const state = loadDailyChallenge();
  if (!state.solvedDates.includes(day)) state.solvedDates.push(day);
  state.solvedDates = state.solvedDates.sort().slice(-120);
  const streak = streakFromDates(state.solvedDates);
  state.bestStreak = Math.max(state.bestStreak || 0, streak);
  setProfileStorageItem(KEY, JSON.stringify(state));
  return { ...state, streak };
}

export function currentDailyStreak() {
  const state = loadDailyChallenge();
  return { ...state, streak: streakFromDates(state.solvedDates) };
}
