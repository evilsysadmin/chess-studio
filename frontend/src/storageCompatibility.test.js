import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import { migratePersistentStorage, STORAGE_SCHEMA_KEY, STORAGE_SCHEMA_VERSION } from './storageMigrations.js';

describe('save compatibility N / N-1 / N-2', () => {
  beforeEach(() => {
    localStorage.clear();
    clearStorageMemoryFallback();
  });

  const fixtures = [
    {
      label: 'N-2 · schema v1',
      version: 1,
      renderer: '2d',
      expectedRenderer: '3d',
    },
    {
      label: 'N-1 · schema v2',
      version: 2,
      renderer: '2d',
      expectedRenderer: '3d',
    },
    {
      label: 'N · schema v3',
      version: 3,
      renderer: '3d',
      expectedRenderer: '3d',
    },
  ];

  for (const fixture of fixtures) {
    it(`${fixture.label} preserves representative user progress while reaching current schema`, () => {
      localStorage.setItem(STORAGE_SCHEMA_KEY, String(fixture.version));
      localStorage.setItem('chess-study-board-renderer', fixture.renderer);
      localStorage.setItem('chess-study-game-history', JSON.stringify([{ id: 'game-42', result: 'win' }]));
      localStorage.setItem('chess-study-player-rating', '1375');
      localStorage.setItem('chess-study-personal-puzzles', JSON.stringify([{ id: 'puzzle-9', fen: 'fixture-fen' }]));
      localStorage.setItem('chess-study-combat-roster', JSON.stringify({ credits: 17, identities: { 'p-a': { alias: 'Rivas' } } }));
      localStorage.setItem('chess-study-achievements', JSON.stringify(['first-win']));

      const result = migratePersistentStorage();

      expect(result).toMatchObject({ status: 'ok', from: fixture.version, to: STORAGE_SCHEMA_VERSION });
      expect(localStorage.getItem(STORAGE_SCHEMA_KEY)).toBe(String(STORAGE_SCHEMA_VERSION));
      expect(localStorage.getItem('chess-study-board-renderer')).toBe(fixture.expectedRenderer);
      expect(JSON.parse(localStorage.getItem('chess-study-game-history'))).toEqual([{ id: 'game-42', result: 'win' }]);
      expect(localStorage.getItem('chess-study-player-rating')).toBe('1375');
      expect(JSON.parse(localStorage.getItem('chess-study-personal-puzzles'))).toEqual([{ id: 'puzzle-9', fen: 'fixture-fen' }]);
      expect(JSON.parse(localStorage.getItem('chess-study-combat-roster'))).toEqual({ credits: 17, identities: { 'p-a': { alias: 'Rivas' } } });
      expect(JSON.parse(localStorage.getItem('chess-study-achievements'))).toEqual(['first-win']);
    });
  }
});
