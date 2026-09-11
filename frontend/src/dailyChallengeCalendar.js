import { dailyChallengeDayKey, dailyChallengeProgress } from './dailyChallenge.js';

export const DAILY_CALENDAR_WEEKS = 6;
export const DAILY_CALENDAR_DAYS = DAILY_CALENDAR_WEEKS * 7;

function atNoon(date) {
  const copy = new Date(date);
  copy.setHours(12, 0, 0, 0);
  return copy;
}

function mondayIndex(date) {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

export function dailyChallengeCalendarMonth(state = {}, referenceDate = new Date()) {
  const reference = atNoon(referenceDate);
  const monthStart = new Date(reference.getFullYear(), reference.getMonth(), 1, 12, 0, 0, 0);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - mondayIndex(monthStart));
  const today = dailyChallengeDayKey(reference);
  const cells = [];

  for (let index = 0; index < DAILY_CALENDAR_DAYS; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const day = dailyChallengeDayKey(date);
    const progress = dailyChallengeProgress(state, day);
    const solvedLegacy = Array.isArray(state?.solvedDates) && state.solvedDates.includes(day);
    const solvedCount = progress.solvedCount || (solvedLegacy ? 1 : 0);
    const status = progress.full
      ? (progress.cleanCount === 3 ? 'clean' : 'full')
      : solvedCount > 0
        ? 'partial'
        : 'none';

    cells.push({
      day,
      dayOfMonth: date.getDate(),
      inMonth: date.getMonth() === reference.getMonth(),
      today: day === today,
      solvedCount,
      cleanCount: progress.cleanCount,
      status,
    });
  }

  return {
    year: reference.getFullYear(),
    month: reference.getMonth(),
    monthLabel: reference.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
    cells,
  };
}
