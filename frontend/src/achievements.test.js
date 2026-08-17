import { describe, it, expect, beforeEach } from 'vitest';
import { checkAchievements, loadUnlocked, ACHIEVEMENTS } from './achievements.js';

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
