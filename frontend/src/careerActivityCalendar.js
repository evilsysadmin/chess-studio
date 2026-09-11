const OUTCOMES = new Set(['win', 'draw', 'loss']);
const WEEK_DAYS = Object.freeze(['L', 'M', 'X', 'J', 'V', 'S', 'D']);

function localDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mondayIndex(date) {
  return (date.getDay() + 6) % 7;
}

function monthLabel(date) {
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(date);
}

export function careerActivityCalendar(history = [], now = new Date()) {
  const anchor = now instanceof Date ? new Date(now) : new Date(now);
  if (Number.isNaN(anchor.getTime())) return null;
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const todayKey = localDayKey(anchor);
  const byDay = new Map();

  for (const game of Array.isArray(history) ? history : []) {
    if (!OUTCOMES.has(game?.outcome) || !game?.date) continue;
    const date = new Date(game.date);
    if (Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month) continue;
    const key = localDayKey(date);
    if (!key) continue;
    const row = byDay.get(key) || { games: 0, wins: 0, draws: 0, losses: 0 };
    row.games += 1;
    if (game.outcome === 'win') row.wins += 1;
    else if (game.outcome === 'draw') row.draws += 1;
    else row.losses += 1;
    byDay.set(key, row);
  }

  const first = new Date(year, month, 1, 12, 0, 0, 0);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - mondayIndex(first));
  const cells = [];
  const totals = { games: 0, wins: 0, draws: 0, losses: 0, activeDays: 0 };

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const key = localDayKey(date);
    const stats = byDay.get(key) || { games: 0, wins: 0, draws: 0, losses: 0 };
    const inMonth = date.getFullYear() === year && date.getMonth() === month;
    if (inMonth && stats.games > 0) {
      totals.games += stats.games;
      totals.wins += stats.wins;
      totals.draws += stats.draws;
      totals.losses += stats.losses;
      totals.activeDays += 1;
    }
    let tone = 'quiet';
    if (stats.games > 0) {
      if (stats.wins > stats.losses) tone = 'positive';
      else if (stats.losses > stats.wins) tone = 'negative';
      else tone = 'mixed';
    }
    cells.push({
      key,
      day: date.getDate(),
      inMonth,
      isToday: key === todayKey,
      tone,
      ...stats,
    });
  }

  return {
    year,
    month,
    label: monthLabel(first),
    weekDays: WEEK_DAYS,
    cells,
    totals,
  };
}
