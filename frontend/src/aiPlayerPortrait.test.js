import { beforeEach, describe, expect, it } from 'vitest';
import {
  AI_PLAYER_PORTRAIT_CACHE_KEY,
  buildPlayerPortraitFacts,
  loadCachedPlayerPortrait,
  playerPortraitGenerationKey,
  saveCachedPlayerPortrait,
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

  it('regenera automáticamente sólo cada tres partidas', () => {
    expect(playerPortraitGenerationKey({ totalGames: 3 })).toBe(playerPortraitGenerationKey({ totalGames: 5 }));
    expect(playerPortraitGenerationKey({ totalGames: 6 })).not.toBe(playerPortraitGenerationKey({ totalGames: 5 }));
  });

  it('cachea sólo el retrato de la generación actual', () => {
    const key = playerPortraitGenerationKey({ totalGames: 7 });
    expect(saveCachedPlayerPortrait(key, 'Te defiendes. Milagrosamente.')).toBe(true);
    expect(loadCachedPlayerPortrait(key)).toBe('Te defiendes. Milagrosamente.');
    expect(loadCachedPlayerPortrait('1:99')).toBeNull();
    expect(localStorage.getItem(AI_PLAYER_PORTRAIT_CACHE_KEY)).toContain('Te defiendes');
  });
});
