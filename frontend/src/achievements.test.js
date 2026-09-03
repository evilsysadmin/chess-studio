import { describe, it, expect, beforeEach } from 'vitest';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_LEDGER_VERSION,
  MAX_ACHIEVEMENT_FAVORITES,
  achievementProgress,
  achievementRecord,
  checkAchievements,
  featuredAchievements,
  loadAchievementFavorites,
  loadAchievementLedger,
  loadUnlocked,
  recordNoteworthyAchievement,
  toggleAchievementFavorite,
} from './achievements.js';

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

  it('acredita victoria perfecta con la batalla real cuando el caller la conoce', () => {
    checkAchievements({
      combatFlawlessWin: true,
      achievementEvidence: {
        combat_flawless: {
          source: 'combat-battle',
          battleId: 'combat-42',
          occurredAt: '2026-09-03T21:30:00.000Z',
          difficulty: 78,
          color: 'b',
          mode: 'roguelike',
        },
      },
    });
    const record = achievementRecord('combat_flawless');
    expect(record?.source).toBe('combat-battle');
    expect(record?.provenance).toEqual({
      battleId: 'combat-42',
      mode: 'roguelike',
      color: 'b',
      difficulty: 78,
      occurredAt: '2026-09-03T21:30:00.000Z',
    });
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
    const featured = featuredAchievements(unlocked, 2, []);
    expect(featured.map((item) => item.id)).toEqual(['rivalry_hard_75', 'crime_missed_mate']);
  });

  it('persiste entre llamadas (usa loadUnlocked)', () => {
    localStorage.setItem('chess-study-player-rating', JSON.stringify({ rating: 800, games: 1 }));
    checkAchievements();
    const reloaded = loadUnlocked();
    expect(reloaded.has('first_game')).toBe(true);
  });
});

describe('Logros 2.0 · provenance', () => {
  it('convierte logros antiguos en registros legado sin inventar fecha ni partida', () => {
    localStorage.setItem('chess-study-achievements', JSON.stringify(['feat_mate']));
    const ledger = loadAchievementLedger();
    expect(ledger.version).toBe(ACHIEVEMENT_LEDGER_VERSION);
    expect(achievementRecord('feat_mate', ledger)).toEqual({
      id: 'feat_mate',
      version: ACHIEVEMENT_LEDGER_VERSION,
      source: 'legacy',
      legacy: true,
      recordedAt: null,
      provenance: {},
    });
  });

  it('registra un hito nuevo como observado sin fabricar una partida concreta', () => {
    localStorage.setItem('chess-study-player-rating', JSON.stringify({ rating: 800, games: 1 }));
    checkAchievements();
    const record = achievementRecord('first_game');
    expect(record?.legacy).toBe(false);
    expect(record?.source).toBe('derived-milestone');
    expect(record?.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(record?.provenance).toEqual({});
  });

  it('guarda sólo provenance explícita y factual para un incidente de partida', () => {
    recordNoteworthyAchievement(
      { type: 'PAWN_TAKES_QUEEN' },
      'human',
      {
        gameId: 'game-42',
        difficulty: 73,
        color: 'w',
        ply: 19,
        occurredAt: '2026-09-03T20:15:00.000Z',
        inventedGarbage: 'no entra',
      },
    );
    const record = achievementRecord('feat_pawn_queen');
    expect(record?.source).toBe('noteworthy-game-event');
    expect(record?.legacy).toBe(false);
    expect(record?.provenance).toEqual({
      gameId: 'game-42',
      color: 'w',
      eventType: 'PAWN_TAKES_QUEEN',
      actor: 'human',
      difficulty: 73,
      ply: 19,
      occurredAt: '2026-09-03T20:15:00.000Z',
    });
    expect(record?.provenance?.inventedGarbage).toBeUndefined();
  });

  it('no reatribuye un logro legado a un incidente posterior', () => {
    localStorage.setItem('chess-study-achievements', JSON.stringify(['feat_mate']));
    expect(recordNoteworthyAchievement({ type: 'MATE_FOUND' }, 'human', { gameId: 'new-game' })).toEqual([]);
    const record = achievementRecord('feat_mate');
    expect(record?.legacy).toBe(true);
    expect(record?.provenance).toEqual({});
  });
});

describe('Logros 2.0 · favoritos', () => {
  beforeEach(() => {
    localStorage.setItem('chess-study-achievements', JSON.stringify([
      'feat_mate', 'feat_pawn_queen', 'feat_promotion', 'feat_skewer',
    ]));
  });

  it('permite fijar sólo logros desbloqueados y limita la vitrina a tres', () => {
    expect(MAX_ACHIEVEMENT_FAVORITES).toBe(3);
    expect(toggleAchievementFavorite('feat_mate').favorites).toEqual(['feat_mate']);
    toggleAchievementFavorite('feat_pawn_queen');
    toggleAchievementFavorite('feat_promotion');
    const fourth = toggleAchievementFavorite('feat_skewer');
    expect(fourth.changed).toBe(false);
    expect(fourth.limitReached).toBe(true);
    expect(loadAchievementFavorites()).toEqual(['feat_mate', 'feat_pawn_queen', 'feat_promotion']);
  });

  it('permite quitar un favorito y pone los fijados primero en destacados', () => {
    toggleAchievementFavorite('feat_skewer');
    toggleAchievementFavorite('feat_mate');
    const featured = featuredAchievements(
      new Set(['feat_mate', 'feat_pawn_queen', 'feat_skewer']),
      3,
      loadAchievementFavorites(),
    );
    expect(featured.map((item) => item.id).slice(0, 2)).toEqual(['feat_skewer', 'feat_mate']);
    expect(toggleAchievementFavorite('feat_skewer').favorites).toEqual(['feat_mate']);
  });

  it('ignora intentos de fijar logros bloqueados', () => {
    const result = toggleAchievementFavorite('rivalry_hard_75');
    expect(result.changed).toBe(false);
    expect(result.limitReached).toBe(false);
    expect(result.favorites).toEqual([]);
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
