import { beforeEach, describe, expect, it } from 'vitest';
import {
  AI_PLAYER_PORTRAIT_CACHE_KEY,
  PLAYER_PORTRAIT_MAX_CHARS,
  buildPlayerPortraitFacts,
  formatPlayerPortraitCooldown,
  loadCachedPlayerPortrait,
  markPlayerPortraitManualRefresh,
  playerPortraitGenerationKey,
  playerPortraitManualRefreshState,
  saveCachedPlayerPortrait,
  shouldCommitManualPortraitRefresh,
} from './aiPlayerPortrait.js';
import { clearStorageMemoryFallback } from './safeStorage.js';

describe('AI player portrait', () => {
  beforeEach(() => {
    localStorage.clear();
    clearStorageMemoryFallback();
  });

  it('envía sólo hechos agregados y medidos', () => {
    const facts = buildPlayerPortraitFacts({
      totalGames: 9,
      overall: { wins: 4, draws: 1, losses: 4, winPct: 44 },
      byMode: { casual: { total: 5, wins: 3, draws: 0, losses: 2, winPct: 60 }, practice: { total: 2, wins: 2, draws: 0, losses: 0, winPct: 100 } },
      favoriteOpening: { name: 'Defensa Siciliana', count: 5 },
      openingDossier: [{ name: 'Defensa Siciliana', games: 5, wins: 3, draws: 0, losses: 2, winPct: 60 }],
      colorPreference: { white: 6, black: 3 },
      longestWinStreak: 3,
      ratingTrend: { first: 1200, last: 1260, delta: 60, min: 1180, max: 1270 },
      humanCaptures: 31,
    }, {
      record: { games: 9, wins: 4, draws: 1, losses: 4, bestHumanStreak: 2, bestCpuStreak: 2 },
      incidents: { 'human:MISSED_MATE': 2 },
    }, { puzzlesSolved: 12, personalPuzzles: 4 }, { moveReport: { played: 'Qh5', suggested: 'Nf3', loss: 210 } });

    expect(facts.total_games).toBe(9);
    expect(facts.by_mode.casual.win_pct).toBe(60);
    expect(facts.by_mode.practice).toBeUndefined();
    expect(facts.favorite_opening.name).toBe('Defensa Siciliana');
    expect(facts.noteworthy_incidents).toEqual([{ key: 'human:MISSED_MATE', count: 2 }]);
    expect(facts.worst_recorded_move.centipawn_loss).toBe(210);
  });

  it('regenera automáticamente después de cada partida terminada', () => {
    expect(playerPortraitGenerationKey({ totalGames: 3 })).not.toBe(playerPortraitGenerationKey({ totalGames: 4 }));
    expect(playerPortraitGenerationKey({ totalGames: 4 })).not.toBe(playerPortraitGenerationKey({ totalGames: 5 }));
    expect(playerPortraitGenerationKey({ totalGames: 5 })).toBe('6:5');
  });

  it('cachea sólo el retrato de la generación actual', () => {
    const key = playerPortraitGenerationKey({ totalGames: 7 });
    expect(saveCachedPlayerPortrait(key, 'Te defiendes. Milagrosamente.', 'alice')).toBe(true);
    expect(loadCachedPlayerPortrait(key, 'alice')).toBe('Te defiendes. Milagrosamente.');
    expect(loadCachedPlayerPortrait('1:99', 'alice')).toBeNull();
    expect(localStorage.getItem(AI_PLAYER_PORTRAIT_CACHE_KEY)).toContain('Te defiendes');
  });

  it('invalida retratos del schema anterior al cambiar de modelo', () => {
    const key = playerPortraitGenerationKey({ totalGames: 7 });
    localStorage.setItem(AI_PLAYER_PORTRAIT_CACHE_KEY, JSON.stringify({ schema: 5, generationKey: key, text: 'Viejo Llama.' }));
    expect(loadCachedPlayerPortrait(key, 'alice')).toBeNull();
  });

  it('conserva retratos largos completos en cache', () => {
    const key = playerPortraitGenerationKey({ totalGames: 12 });
    const text = `${'Retrato con contexto. '.repeat(24)}Cierre completo.`;
    expect(text.length).toBeGreaterThan(420);
    expect(text.length).toBeLessThan(PLAYER_PORTRAIT_MAX_CHARS);
    expect(saveCachedPlayerPortrait(key, text, 'alice')).toBe(true);
    expect(loadCachedPlayerPortrait(key, 'alice')).toBe(text);
  });

  it('limita la regeneración manual a una cada seis horas y conserva el retrato', () => {
    const key = playerPortraitGenerationKey({ totalGames: 9 });
    expect(saveCachedPlayerPortrait(key, 'Primera lectura.', 'alice')).toBe(true);
    expect(playerPortraitManualRefreshState({ now: 1_000_000, identityScope: 'alice' }).allowed).toBe(true);
    expect(markPlayerPortraitManualRefresh({ now: 1_000_000, identityScope: 'alice' })).toBe(true);
    const blocked = playerPortraitManualRefreshState({ now: 1_000_000 + 60 * 60 * 1000, identityScope: 'alice' });
    expect(blocked.allowed).toBe(false);
    expect(formatPlayerPortraitCooldown(blocked.retryAfterMs)).toBe('5 h');
    expect(loadCachedPlayerPortrait(key, 'alice')).toBe('Primera lectura.');
    expect(playerPortraitManualRefreshState({ now: 1_000_000 + 6 * 60 * 60 * 1000, identityScope: 'alice' }).allowed).toBe(true);
  });

  it('nunca reutiliza el retrato cacheado de otra identidad', () => {
    const key = playerPortraitGenerationKey({ totalGames: 9 });
    expect(saveCachedPlayerPortrait(key, 'Lectura de Alice.', 'Alice')).toBe(true);
    expect(loadCachedPlayerPortrait(key, 'alice')).toBe('Lectura de Alice.');
    expect(loadCachedPlayerPortrait(key, 'bob')).toBeNull();
    expect(playerPortraitManualRefreshState({ now: 1_000_000, identityScope: 'bob' }).allowed).toBe(true);
  });

  it('confirma el cooldown manual sólo después de una lectura remota válida', () => {
    expect(shouldCommitManualPortraitRefresh('portrait_manual', 'Lectura remota válida')).toBe(true);
    expect(shouldCommitManualPortraitRefresh('portrait_auto', 'Lectura remota válida')).toBe(false);
    expect(shouldCommitManualPortraitRefresh('portrait_manual', '')).toBe(false);
    expect(shouldCommitManualPortraitRefresh('portrait_manual', null)).toBe(false);
  });

});
