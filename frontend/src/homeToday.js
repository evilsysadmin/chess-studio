const OUTCOME_LABEL = Object.freeze({ win: 'Victoria', draw: 'Tablas', loss: 'Derrota' });

export function buildHomeToday({ daily = {}, todayKey = '', activity = [] } = {}) {
  const solvedDates = Array.isArray(daily?.solvedDates) ? daily.solvedDates : [];
  const lastFinished = (Array.isArray(activity) ? activity : []).find((event) => event?.state === 'finished') || null;
  return {
    dailySolved: Boolean(todayKey && solvedDates.includes(todayKey)),
    streak: Math.max(0, Number(daily?.streak) || 0),
    bestStreak: Math.max(0, Number(daily?.bestStreak) || 0),
    lastResult: lastFinished ? {
      label: OUTCOME_LABEL[lastFinished.outcome] || 'Finalizada',
      modeLabel: lastFinished.modeLabel || 'Partida',
      date: lastFinished.date || null,
    } : null,
  };
}
