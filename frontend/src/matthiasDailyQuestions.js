const QUESTION_FACT_KEYS = Object.freeze({
  improve: Object.freeze([
    'total_games', 'record', 'rating_trend', 'cpu_rivalry', 'noteworthy_incidents',
    'worst_recorded_move', 'favorite_opening', 'openings',
  ]),
  tactics: Object.freeze([
    'total_games', 'noteworthy_incidents', 'worst_recorded_move', 'human_captures',
    'puzzles_solved', 'personal_training_positions',
  ]),
  strengths: Object.freeze([
    'total_games', 'record', 'longest_win_streak', 'human_captures', 'by_mode',
    'favorite_opening', 'openings', 'rating_trend', 'cpu_rivalry',
    'achievements_unlocked', 'achievements_total',
  ]),
  action: Object.freeze([
    'total_games', 'noteworthy_incidents', 'worst_recorded_move', 'rating_trend',
    'puzzles_solved', 'personal_training_positions', 'favorite_opening', 'openings',
  ]),
  openings: Object.freeze([
    'total_games', 'favorite_opening', 'openings',
  ]),
});

export const MATTHIAS_DAILY_QUESTION_KINDS = Object.freeze(Object.keys(QUESTION_FACT_KEYS));

export function focusMatthiasDailyFacts(kind, facts = {}) {
  const allowed = QUESTION_FACT_KEYS[kind] || QUESTION_FACT_KEYS.improve;
  const source = facts && typeof facts === 'object' ? facts : {};
  const focused = {};
  for (const key of allowed) {
    if (!(key in source)) continue;
    focused[key] = source[key];
  }
  // Eligibility is defined by played games and must survive every projection.
  if (!('total_games' in focused)) focused.total_games = Number(source.total_games || 0);
  return focused;
}
