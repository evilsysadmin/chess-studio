import { dailyChallengeBrief } from './dailyChallenge.js';

const OUTCOME_LABEL = Object.freeze({ win: 'Victoria', draw: 'Tablas', loss: 'Derrota' });

export function buildHomeToday({ daily = {}, todayKey = '', activity = [] } = {}) {
  const solvedDates = Array.isArray(daily?.solvedDates) ? daily.solvedDates : [];
  const lastFinished = (Array.isArray(activity) ? activity : []).find((event) => event?.state === 'finished') || null;
  const dailyBrief = dailyChallengeBrief(daily, todayKey);
  return {
    dailySolved: Boolean(todayKey && solvedDates.includes(todayKey)),
    dailySolvedCount: Math.max(0, Math.min(3, Number(dailyBrief.solvedCount) || 0)),
    dailyFull: Boolean(dailyBrief.full),
    streak: Math.max(0, Number(daily?.streak) || 0),
    bestStreak: Math.max(0, Number(daily?.bestStreak) || 0),
    dailyHeadline: dailyBrief.headline,
    dailyDetail: dailyBrief.detail,
    lastResult: lastFinished ? {
      label: OUTCOME_LABEL[lastFinished.outcome] || 'Finalizada',
      modeLabel: lastFinished.modeLabel || 'Partida',
      date: lastFinished.date || null,
    } : null,
  };
}
