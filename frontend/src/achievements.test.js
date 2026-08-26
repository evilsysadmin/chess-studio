import { describe, it, expect, beforeEach } from 'vitest';
import { achievementProgress, checkAchievements, loadUnlocked, recordNoteworthyAchievement, ACHIEVEMENTS, collectionEntries, distinctionMeta, featuredAchievements, loadSelectedDistinction, selectDistinction, selectedDistinction } from './achievements.js';

beforeEach(() => localStorage.clear());

describe('checkAchievements', () => {
  it('sin progreso no desbloquea nada', () => {
    const { unlocked } = checkAchievements();
    expect(unlocked.size).toBe(0);
  });

  it('desbloquea logros de hito según el progreso guardado', () => {
    localStorage.setItem('chess-study-player-rating', JSON.stringify({ rating: 1650, games: 15 }));
    const { unlocked } = checkAchievements();
    expect(unlocked.has('first_game')).toBe(true);
    expect(unlocked.has('ten_games')).toBe(true);
    expect(unlocked.has('rating_intermediate')).toBe(true);
    expect(unlocked.has('rating_advanced')).toBe(true);
    expect(unlocked.has('rating_master')).toBe(false); // 1650 no llega a 1900
  });

  it('un logro desbloqueado no se vuelve a bloquear si el progreso baja', () => {
    localStorage.setItem('chess-study-player-rating', JSON.stringify({ rating: 1650, games: 15 }));
    checkAchievements();
    localStorage.setItem('chess-study-player-rating', JSON.stringify({ rating: 500, games: 0 }));
    const { unlocked } = checkAchievements();
    expect(unlocked.has('rating_advanced')).toBe(true); // sigue desbloqueado
  });

  it('newlyUnlocked solo es true cuando de verdad se agrega algo nuevo', () => {
    localStorage.setItem('chess-study-player-rating', JSON.stringify({ rating: 800, games: 1 }));
    const first = checkAchievements();
    expect(first.newlyUnlocked).toBe(true);
    const second = checkAchievements();
    expect(second.newlyUnlocked).toBe(false);
  });

  it('el evento puntual "victoria perfecta" se puede desbloquear vía extra', () => {
    const { unlocked } = checkAchievements({ combatFlawlessWin: true });
    expect(unlocked.has('combat_flawless')).toBe(true);
  });

  it('detecta una pieza dorada (nivel 6+) en el roster de combate', () => {
    localStorage.setItem('chess-study-combat-roster', JSON.stringify({
      pieces: { 'n-b': { strengthPoints: 3, speedPoints: 3, bankedXp: 0, alive: true } },
      combatXp: 0,
      revivesUsed: 0,
    }));
    const { unlocked } = checkAchievements();
    expect(unlocked.has('combat_gold_piece')).toBe(true);
  });

  it('no cuenta una pieza dorada si está muerta (no revivida)', () => {
    localStorage.setItem('chess-study-combat-roster', JSON.stringify({
      pieces: { 'n-b': { strengthPoints: 3, speedPoints: 3, bankedXp: 0, alive: false } },
      combatXp: 0,
      revivesUsed: 0,
    }));
    const { unlocked } = checkAchievements();
    expect(unlocked.has('combat_gold_piece')).toBe(false);
  });


  it('registra trofeos tácticos puntuales sin duplicarlos', () => {
    const first = recordNoteworthyAchievement({ type: 'MISSED_MATE' }, 'human');
    const second = recordNoteworthyAchievement({ type: 'MISSED_MATE' }, 'human');
    expect(first[0]?.id).toBe('crime_missed_mate');
    expect(second).toEqual([]);
    expect(loadUnlocked().has('crime_missed_mate')).toBe(true);
  });

  it('distingue una hazaña propia de una humillación causada por la CPU', () => {
    expect(recordNoteworthyAchievement({ type: 'PAWN_TAKES_QUEEN' }, 'human')[0]?.id).toBe('feat_pawn_queen');
    expect(recordNoteworthyAchievement({ type: 'PAWN_TAKES_QUEEN' }, 'cpu')[0]?.id).toBe('crime_queen_to_pawn');
  });

  it('desbloquea hitos de racha diaria medidos', () => {
    localStorage.setItem('chess-study-daily-challenge', JSON.stringify({ solvedDates: [], bestStreak: 8 }));
    const { unlocked } = checkAchievements();
    expect(unlocked.has('daily_streak_3')).toBe(true);
    expect(unlocked.has('daily_streak_7')).toBe(true);
    expect(unlocked.has('daily_streak_30')).toBe(false);
  });

  it('convierte desafíos, plenos y resolución limpia en distintivos medibles', () => {
    const results = {};
    for (let day = 1; day <= 7; day += 1) {
      results[`2026-08-${String(day).padStart(2, '0')}`] = { slots: {
        tactic: { solved: true, clean: true },
        precision: { solved: true, clean: day <= 3 },
        finish: { solved: true, clean: day <= 3 },
      } };
    }
    localStorage.setItem('chess-study-daily-challenge', JSON.stringify({ results, solvedDates: Object.keys(results), bestStreak: 7 }));
    const { unlocked, newAchievements } = checkAchievements();
    expect(unlocked.has('daily_challenges_10')).toBe(true);
    expect(unlocked.has('daily_full_first')).toBe(true);
    expect(unlocked.has('daily_full_7')).toBe(true);
    expect(unlocked.has('daily_clean_full_3')).toBe(true);
    expect(newAchievements.some((item) => item.id === 'daily_full_7')).toBe(true);
  });

  it('expone progreso parcial sólo para hitos diarios cuantificables', () => {
    const daily = { solvedDates: ['2026-08-20'], bestStreak: 2, results: { '2026-08-20': { slots: { tactic: { solved: true } } } } };
    expect(achievementProgress('daily_challenges_10', daily)).toEqual({ current: 1, goal: 10, percent: 10 });
    expect(achievementProgress('daily_streak_3', daily)).toEqual({ current: 2, goal: 3, percent: 67 });
    expect(achievementProgress('first_game', daily)).toBeNull();
  });

  it('desbloquea sólo hitos de rivalidad demostrados por el expediente', () => {
    localStorage.setItem('chess-study-cpu-rivalry', JSON.stringify({
      version: 3,
      totalGames: 25,
      record: {
        games: 25,
        wins: 12,
        draws: 3,
        losses: 10,
        bestHumanStreak: 3,
        milestones: { highestDifficultyWin: 80 },
      },
      incidents: {},
    }));
    const { unlocked } = checkAchievements();
    expect(unlocked.has('rivalry_25')).toBe(true);
    expect(unlocked.has('rivalry_streak_3')).toBe(true);
    expect(unlocked.has('rivalry_hard_75')).toBe(true);
  });

  it('selecciona pocos distintivos destacados y nunca enseña bloqueados', () => {
    const unlocked = new Set(['ten_games', 'crime_missed_mate', 'rivalry_hard_75']);
    const featured = featuredAchievements(unlocked, 2);
    expect(featured.map((item) => item.id)).toEqual(['rivalry_hard_75', 'crime_missed_mate']);
  });

  it('clasifica el archivo con colecciones y rarezas estables', () => {
    expect(distinctionMeta(ACHIEVEMENTS.find((item) => item.id === 'combat_flawless'))).toEqual({ collection: 'Servicio', rarity: 'legendario' });
    expect(distinctionMeta(ACHIEVEMENTS.find((item) => item.id === 'crime_missed_mate'))).toEqual({ collection: 'Incidentes', rarity: 'confidencial' });
    const entries = collectionEntries(new Set(['combat_flawless']));
    expect(entries.find((item) => item.id === 'combat_flawless')).toMatchObject({ unlocked: true, collection: 'Servicio' });
    expect(entries.find((item) => item.id === 'rating_master')).toMatchObject({ unlocked: false, rarity: 'legendario' });
  });

  it('sólo permite exhibir un distintivo realmente desbloqueado', () => {
    const unlocked = new Set(['rivalry_hard_75']);
    expect(selectDistinction('rating_master', unlocked)).toBeNull();
    expect(loadSelectedDistinction()).toBeNull();
    expect(selectDistinction('rivalry_hard_75', unlocked)).toBe('rivalry_hard_75');
    expect(selectedDistinction(unlocked)).toMatchObject({ id: 'rivalry_hard_75', collection: 'Rivalidad', rarity: 'legendario' });
  });

  it('persiste entre llamadas (usa loadUnlocked)', () => {
    localStorage.setItem('chess-study-player-rating', JSON.stringify({ rating: 800, games: 1 }));
    checkAchievements();
    const reloaded = loadUnlocked();
    expect(reloaded.has('first_game')).toBe(true);
  });
});

describe('ACHIEVEMENTS', () => {
  it('todos tienen id, nombre y descripción únicos', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.name).toBeTruthy();
      expect(a.description).toBeTruthy();
    }
  });
});
