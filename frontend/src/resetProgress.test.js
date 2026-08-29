import { describe, it, expect, beforeEach } from 'vitest';
import { resetAllProgress } from './resetProgress.js';
import { DERIVED_LOCAL_CACHE_KEYS, PROFILE_PROGRESS_KEYS, PROFILE_PREFERENCE_KEYS } from './profileKeys.js';

const UNTOUCHED_SESSION_KEYS = [
  'chess-study-auth-token',
  'chess-study-auth-username',
  'chess-study-active-game',
  'chess-study-active-game-learning',
  'chess-study-active-game-session-v1',
];

beforeEach(() => localStorage.clear());

describe('resetAllProgress', () => {
  it('borra todas las claves clasificadas como progreso desde una única fuente de verdad', () => {
    for (const key of PROFILE_PROGRESS_KEYS) localStorage.setItem(key, 'algo');
    resetAllProgress();
    for (const key of PROFILE_PROGRESS_KEYS) {
      expect(localStorage.getItem(key), `${key} debería haberse borrado`).toBeNull();
    }
  });

  it('borra también caches derivados del progreso para que no reaparezcan retratos viejos', () => {
    for (const key of DERIVED_LOCAL_CACHE_KEYS) localStorage.setItem(key, 'viejo');
    resetAllProgress();
    for (const key of DERIVED_LOCAL_CACHE_KEYS) expect(localStorage.getItem(key)).toBeNull();
  });

  it('NO toca preferencias ni sesión activa/login', () => {
    const untouched = [...PROFILE_PREFERENCE_KEYS, ...UNTOUCHED_SESSION_KEYS];
    for (const key of untouched) localStorage.setItem(key, 'algo');
    resetAllProgress();
    for (const key of untouched) {
      expect(localStorage.getItem(key), `${key} NO debería haberse tocado`).toBe('algo');
    }
  });

  it('incluye progreso moderno que antes escapaba al reset', () => {
    expect(PROFILE_PROGRESS_KEYS).toContain('chess-study-daily-challenge');
    expect(PROFILE_PROGRESS_KEYS).toContain('chess-study-game-activity');
    expect(PROFILE_PROGRESS_KEYS).toContain('chess-study-meta-progress');
    expect(PROFILE_PROGRESS_KEYS).toContain('chess-study-career-meta');
    expect(PROFILE_PROGRESS_KEYS).toContain('chess-study-matthias-school-v1');
  });

  it('no revienta si se llama sin que haya nada guardado todavía', () => {
    expect(() => resetAllProgress()).not.toThrow();
  });
});
