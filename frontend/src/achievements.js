import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

// achievements.js — Logros: condiciones simples chequeadas contra el
// progreso que ya vive en otros módulos (torneo, rating, ejército de
// combate, puzzles). Los IDs desbloqueados se persisten aparte; una vez
// desbloqueado, un logro no se vuelve a bloquear aunque el progreso baje
// después (por ejemplo, si reinicias el torneo).

import { loadTournament, levelForPoints } from './tournament.js';
import { loadRating } from './playerRating.js';
import { loadRoster } from './combatRoster.js';
import { loadPuzzlesSolved } from './puzzleStats.js';
import { derivedLevel } from './combat.js';
import { dailyChallengeStats, loadDailyChallenge } from './dailyChallenge.js';
import { loadRivalry } from './rivalry.js';

const KEY = 'chess-study-achievements';

export const ACHIEVEMENTS = [
  { id: 'first_game', name: 'Primer movimiento', description: 'Jugaste tu primera partida contra la CPU.' },
  { id: 'ten_games', name: 'Diez partidas', description: 'Jugaste 10 partidas contra la CPU.' },
  { id: 'fifty_games', name: 'Cincuenta partidas', description: 'Jugaste 50 partidas contra la CPU.' },
  { id: 'tournament_wins_5', name: 'Racha de cinco', description: 'Ganaste 5 partidas de torneo.' },
  { id: 'tournament_level_5', name: 'Nivel 5', description: 'Llegaste a nivel 5 en el torneo.' },
  { id: 'tournament_level_10', name: 'Nivel 10', description: 'Llegaste a nivel 10 en el torneo.' },
  { id: 'rating_intermediate', name: 'Intermedio', description: 'Tu rating llegó a "Intermedio" (1300+).' },
  { id: 'rating_advanced', name: 'Avanzado', description: 'Tu rating llegó a "Avanzado" (1600+).' },
  { id: 'rating_master', name: 'Maestro', description: 'Tu rating llegó a "Maestro" (1900+).' },
  { id: 'combat_gold_piece', name: 'Pieza dorada', description: 'Una pieza de tu ejército llegó a nivel 6 o más.' },
  { id: 'combat_reviver', name: 'Resucitador', description: 'Reviviste una pieza caída con XP de combate.' },
  { id: 'combat_flawless', name: 'Victoria perfecta', description: 'Ganaste una batalla de combate sin perder ninguna pieza.' },
  { id: 'puzzles_10', name: 'Resolvedor', description: 'Resolviste 10 puzzles.' },
  { id: 'puzzles_50', name: 'Especialista en puzzles', description: 'Resolviste 50 puzzles.' },
  { id: 'daily_streak_3', name: 'Tres días sin excusas', description: 'Mantuviste una racha diaria de 3 días.' },
  { id: 'daily_streak_7', name: 'Semana de guardia', description: 'Mantuviste una racha diaria de 7 días.' },
  { id: 'daily_streak_30', name: 'Funcionario del tablero', description: 'Alcanzaste una racha diaria de 30 días.' },
  { id: 'daily_challenges_10', name: 'Diez casos cerrados', description: 'Completaste 10 desafíos diarios.' },
  { id: 'daily_full_first', name: 'Triple corona', description: 'Completaste los tres desafíos de un mismo día.' },
  { id: 'daily_full_7', name: 'Siete plenos', description: 'Firmaste 7 plenos diarios.' },
  { id: 'daily_clean_full_3', name: 'Expediente impecable', description: 'Completaste 3 plenos sin un solo fallo.' },
  { id: 'rivalry_25', name: 'Veinticinco asaltos', description: 'Completaste 25 partidas competitivas contra la misma CPU.' },
  { id: 'rivalry_streak_3', name: 'Tres al hilo', description: 'Encadenaste 3 victorias competitivas contra la CPU.' },
  { id: 'rivalry_hard_75', name: 'Tumbagigantes', description: 'Derrotaste a la CPU en dificultad 75 o superior.' },
  { id: 'crime_missed_mate', name: 'Mate, ¿qué mate?', description: 'Ignoraste un mate en una.', kind: 'shame' },
  { id: 'crime_allowed_mate', name: 'Entrega urgente', description: 'Dejaste mate en una a la CPU.', kind: 'shame' },
  { id: 'crime_queen_to_pawn', name: 'Revolución proletaria inversa', description: 'Un peón enemigo capturó tu dama.', kind: 'shame' },
  { id: 'crime_queen_exposed', name: 'Parking premium', description: 'Dejaste tu dama directamente al alcance de un peón.', kind: 'shame' },
  { id: 'crime_stalemate', name: 'Diplomacia involuntaria', description: 'Convertiste una ventaja ganadora en tablas por ahogado.', kind: 'shame' },
  { id: 'crime_knight_fork', name: 'Geometría hostil', description: 'La CPU te clavó una horquilla de caballo seria.', kind: 'shame' },
  { id: 'feat_pawn_queen', name: 'David contra Goliat', description: 'Tu peón capturó la dama rival.', kind: 'glory' },
  { id: 'feat_mate', name: 'Cierre por derribo', description: 'Diste jaque mate a la CPU.', kind: 'glory' },
  { id: 'feat_promotion', name: 'Ascenso meteórico', description: 'Coronaste un peón.', kind: 'glory' },
  { id: 'feat_skewer', name: 'Brocheta real', description: 'Ejecutaste un ensartado sobre el rey.', kind: 'glory' },
];

function emptySet() {
  return new Set();
}

export function loadUnlocked() {
  try {
    const raw = getStorageItem(STORAGE_LOCAL, KEY);
    return raw ? new Set(JSON.parse(raw)) : emptySet();
  } catch {
    return emptySet();
  }
}

function saveUnlocked(set) {
  setProfileStorageItem(KEY, JSON.stringify([...set]));
}

// Revisa las condiciones "de hito" (comprobables en cualquier momento
// re-leyendo el progreso guardado) y desbloquea las que correspondan.
// `extra` permite pasar condiciones puntuales de un evento que ya pasó
// (por ejemplo, "esta batalla de combate fue perfecta") — esas no se
// pueden re-derivar después solo mirando el estado actual, hay que
// avisarlas en el momento.
export function checkAchievements(extra = {}) {
  const unlocked = loadUnlocked();
  const previouslyUnlocked = new Set(unlocked);
  const before = unlocked.size;

  const tournament = loadTournament();
  const rating = loadRating();
  const roster = loadRoster();
  const puzzlesSolved = loadPuzzlesSolved();
  const daily = loadDailyChallenge();
  const dailyStats = dailyChallengeStats(daily);
  const rivalry = loadRivalry();

  if (rating.games >= 1) unlocked.add('first_game');
  if (rating.games >= 10) unlocked.add('ten_games');
  if (rating.games >= 50) unlocked.add('fifty_games');
  if (tournament.wins >= 5) unlocked.add('tournament_wins_5');
  if (levelForPoints(tournament.progressPoints || 0) >= 5) unlocked.add('tournament_level_5');
  if (levelForPoints(tournament.progressPoints || 0) >= 10) unlocked.add('tournament_level_10');
  if (rating.rating >= 1300) unlocked.add('rating_intermediate');
  if (rating.rating >= 1600) unlocked.add('rating_advanced');
  if (rating.rating >= 1900) unlocked.add('rating_master');
  if ((roster.revivesUsed || 0) >= 1) unlocked.add('combat_reviver');
  if (puzzlesSolved >= 10) unlocked.add('puzzles_10');
  if (puzzlesSolved >= 50) unlocked.add('puzzles_50');
  if (Number(daily.bestStreak || 0) >= 3) unlocked.add('daily_streak_3');
  if (Number(daily.bestStreak || 0) >= 7) unlocked.add('daily_streak_7');
  if (Number(daily.bestStreak || 0) >= 30) unlocked.add('daily_streak_30');
  if (dailyStats.completedChallenges >= 10) unlocked.add('daily_challenges_10');
  if (dailyStats.fullDays >= 1) unlocked.add('daily_full_first');
  if (dailyStats.fullDays >= 7) unlocked.add('daily_full_7');
  if (dailyStats.cleanFullDays >= 3) unlocked.add('daily_clean_full_3');
  if (Number(rivalry.record?.games || 0) >= 25) unlocked.add('rivalry_25');
  if (Number(rivalry.record?.bestHumanStreak || 0) >= 3) unlocked.add('rivalry_streak_3');
  if (Number(rivalry.record?.milestones?.highestDifficultyWin || 0) >= 75) unlocked.add('rivalry_hard_75');

  for (const piece of Object.values(roster.pieces)) {
    if (piece.alive !== false && derivedLevel(piece) >= 6) {
      unlocked.add('combat_gold_piece');
      break;
    }
  }

  if (extra.combatFlawlessWin) unlocked.add('combat_flawless');

  const newAchievements = ACHIEVEMENTS.filter((achievement) => !previouslyUnlocked.has(achievement.id) && unlocked.has(achievement.id));
  if (unlocked.size !== before) saveUnlocked(unlocked);
  return { unlocked, newlyUnlocked: unlocked.size > before, newAchievements };
}


const FEATURED_PRIORITY = Object.freeze([
  'rivalry_hard_75', 'rivalry_streak_3', 'feat_mate', 'feat_pawn_queen',
  'combat_flawless', 'combat_gold_piece', 'daily_full_7', 'daily_streak_7',
  'daily_full_first', 'daily_challenges_10', 'rating_advanced',
  'crime_queen_to_pawn', 'crime_missed_mate', 'rivalry_25', 'ten_games',
]);

export function achievementProgress(achievementId, dailyState = loadDailyChallenge()) {
  const stats = dailyChallengeStats(dailyState);
  const targets = {
    daily_streak_3: [stats.bestStreak, 3],
    daily_streak_7: [stats.bestStreak, 7],
    daily_streak_30: [stats.bestStreak, 30],
    daily_challenges_10: [stats.completedChallenges, 10],
    daily_full_first: [stats.fullDays, 1],
    daily_full_7: [stats.fullDays, 7],
    daily_clean_full_3: [stats.cleanFullDays, 3],
  };
  const target = targets[achievementId];
  if (!target) return null;
  const [rawCurrent, goal] = target;
  const current = Math.max(0, Math.min(goal, Number(rawCurrent) || 0));
  return { current, goal, percent: Math.round((current / goal) * 100) };
}

export function featuredAchievements(unlocked, limit = 6) {
  const set = unlocked instanceof Set ? unlocked : new Set(unlocked || []);
  const rank = new Map(FEATURED_PRIORITY.map((id, index) => [id, index]));
  return ACHIEVEMENTS
    .filter((achievement) => set.has(achievement.id))
    .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999) || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, Number(limit) || 0));
}

const EVENT_ACHIEVEMENTS = {
  human: {
    MISSED_MATE: 'crime_missed_mate',
    ALLOWED_MATE: 'crime_allowed_mate',
    QUEEN_EN_PRISE_TO_PAWN: 'crime_queen_exposed',
    STALEMATE_BLUNDER: 'crime_stalemate',
    PAWN_TAKES_QUEEN: 'feat_pawn_queen',
    MATE_FOUND: 'feat_mate',
    PROMOTION: 'feat_promotion',
    SKEWER: 'feat_skewer',
  },
  cpu: {
    PAWN_TAKES_QUEEN: 'crime_queen_to_pawn',
    KNIGHT_FORK: 'crime_knight_fork',
  },
};

// Registra logros que dependen de un instante concreto de la partida y no
// se pueden reconstruir sólo mirando rating/torneo. Devuelve los objetos
// recién desbloqueados para poder enseñar un aviso inmediato en GameScreen.
export function recordNoteworthyAchievement(event, actor = 'human') {
  const id = event?.type ? EVENT_ACHIEVEMENTS[actor]?.[event.type] : null;
  if (!id) return [];
  const unlocked = loadUnlocked();
  if (unlocked.has(id)) return [];
  unlocked.add(id);
  saveUnlocked(unlocked);
  const achievement = ACHIEVEMENTS.find((a) => a.id === id);
  return achievement ? [achievement] : [];
}
