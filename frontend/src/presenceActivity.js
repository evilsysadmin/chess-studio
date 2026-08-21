export const ACTIVITY_LABELS = Object.freeze({
  menu: 'En menú',
  game: 'Partida',
  practice: 'Práctica',
  tournament: 'Torneo',
  combat_free: 'Combat Chess · Batalla libre',
  combat_campaign: 'Combat Chess · Campaña',
  insights: 'Así juegas',
  worst_move_analysis: 'Calculando peor jugada',
  history: 'Historial',
  replay: 'Replay / Autopsia',
  daily_challenge: 'Daily Challenge',
  puzzle: 'Puzzles',
  tutorial: 'Aprendizaje',
  openings: 'Aperturas',
  lab: 'Laboratorio',
  spectator: 'Espectador',
  board3d: 'Experimento 3D',
  admin: 'Admin Panel',
});

export function activityLabel(code) {
  return ACTIVITY_LABELS[code] || 'En la aplicación';
}

export function activityForView(view, context = {}) {
  switch (view) {
    case 'menu': return 'menu';
    case 'game': return context.learningMode ? 'practice' : 'game';
    case 'tournament':
    case 'tournamentGame': return 'tournament';
    case 'combat': return 'combat_free';
    case 'roguelike': return 'combat_campaign';
    case 'insights': return 'insights';
    case 'history': return 'history';
    case 'replay':
    case 'combatReplay': return 'replay';
    case 'puzzle': return context.puzzleSource === 'daily' ? 'daily_challenge' : 'puzzle';
    case 'tutorial': return 'tutorial';
    case 'openings': return 'openings';
    case 'lab': return 'lab';
    case 'spectator': return 'spectator';
    case 'board3d': return 'board3d';
    case 'admin': return 'admin';
    default: return 'menu';
  }
}
