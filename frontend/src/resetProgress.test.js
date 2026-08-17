import { describe, it, expect, beforeEach } from 'vitest';
import { resetAllProgress } from './resetProgress.js';

const PROGRESS_KEYS = [
  'chess-study-tournament',
  'chess-study-game-history',
  'chess-study-combat-history',
  'chess-study-combat-roster',
  'chess-study-player-rating',
  'chess-study-rating-history',
  'chess-study-achievements',
  'chess-study-puzzles-solved',
  'chess-study-puzzle-streak',
  'chess-study-puzzle-best-streak',
  'chess-study-worst-move-cache',
  'chess-study-selected-title',
  'chess-study-selected-skin',
  'chess-study-roguelike-run',
  'chess-study-roguelike-best-floor',
];

// Estas NUNCA deberían tocarse con un reset de progreso — son sesión de
// login, o preferencias de UI, no avance del juego.
const UNTOUCHED_KEYS = [
  'chess-study-auth-token',
  'chess-study-auth-username',
  'chess-study-muted',
  'chess-study-voice-enabled',
];

beforeEach(() => localStorage.clear());

describe('resetAllProgress', () => {
  it('borra todas las claves de progreso conocidas', () => {
    for (const key of PROGRESS_KEYS) localStorage.setItem(key, 'algo');
    resetAllProgress();
    for (const key of PROGRESS_KEYS) {
      expect(localStorage.getItem(key), `${key} debería haberse borrado`).toBeNull();
    }
  });

  it('NO toca la sesión de login ni las preferencias de UI', () => {
    for (const key of UNTOUCHED_KEYS) localStorage.setItem(key, 'algo');
    resetAllProgress();
    for (const key of UNTOUCHED_KEYS) {
      expect(localStorage.getItem(key), `${key} NO debería haberse tocado`).toBe('algo');
    }
  });

  it('no revienta si se llama sin que haya nada guardado todavía', () => {
    expect(() => resetAllProgress()).not.toThrow();
  });
});
