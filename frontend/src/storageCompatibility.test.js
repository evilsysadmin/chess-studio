import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import { migratePersistentStorage, STORAGE_SCHEMA_KEY, STORAGE_SCHEMA_VERSION } from './storageMigrations.js';

const REPRESENTATIVE_PROFILE = Object.freeze({
  'chess-study-game-history': JSON.stringify([{ id: 'g-17', result: 'win', date: '2026-08-31T20:00:00.000Z' }]),
  'chess-study-daily-challenge': JSON.stringify({ solvedDates: ['2026-08-31'], results: { '2026-08-31': { solved: 3 } } }),
  'chess-study-combat-roster': JSON.stringify({ unitRecords: { 'p-a': { identityId: 'unit-rivas', alias: 'Rivas', level: 4 } } }),
  'chess-study-reduced-motion': '1',
});

function seedSnapshot(schema, extra = {}) {
  localStorage.setItem(STORAGE_SCHEMA_KEY, String(schema));
  for (const [key, value] of Object.entries({ ...REPRESENTATIVE_PROFILE, ...extra })) {
    localStorage.setItem(key, value);
  }
}

function expectRepresentativeProfilePreserved() {
  for (const [key, value] of Object.entries(REPRESENTATIVE_PROFILE)) {
    expect(localStorage.getItem(key), key).toBe(value);
  }
}

beforeEach(() => {
  localStorage.clear();
  clearStorageMemoryFallback();
});

describe('storage compatibility · N / N-1 / N-2', () => {
  it('migrates an N-2 (schema 1) snapshot without losing unrelated progress or preferences', () => {
    seedSnapshot(1, {
      'chess-study-cpu-personality': 'legacy-personality',
      'chess-study-ambient-theme': 'legacy-theme',
      'chess-study-board-renderer': '3d',
    });

    const result = migratePersistentStorage();

    expect(result).toMatchObject({ status: 'ok', from: 1, to: STORAGE_SCHEMA_VERSION });
    expectRepresentativeProfilePreserved();
    expect(localStorage.getItem('chess-study-board-renderer')).toBe('3d');
    expect(localStorage.getItem('chess-study-cpu-personality')).toBeNull();
    expect(localStorage.getItem('chess-study-ambient-theme')).toBeNull();
  });

  it('migrates an N-1 (schema 2) snapshot and changes only the intentional legacy renderer value', () => {
    seedSnapshot(2, { 'chess-study-board-renderer': '2d' });

    const before = Object.fromEntries(Object.keys(REPRESENTATIVE_PROFILE).map((key) => [key, localStorage.getItem(key)]));
    const result = migratePersistentStorage();

    expect(result).toMatchObject({ status: 'ok', from: 2, to: STORAGE_SCHEMA_VERSION });
    expectRepresentativeProfilePreserved();
    expect(Object.fromEntries(Object.keys(REPRESENTATIVE_PROFILE).map((key) => [key, localStorage.getItem(key)]))).toEqual(before);
    expect(localStorage.getItem('chess-study-board-renderer')).toBe('3d');
  });

  it('leaves an N (schema 3) snapshot byte-for-byte unchanged apart from no-op schema confirmation', () => {
    seedSnapshot(STORAGE_SCHEMA_VERSION, { 'chess-study-board-renderer': '2d-explicit' });
    const before = Object.fromEntries([...Object.keys(REPRESENTATIVE_PROFILE), 'chess-study-board-renderer'].map((key) => [key, localStorage.getItem(key)]));

    const result = migratePersistentStorage();

    expect(result).toMatchObject({ status: 'ok', from: STORAGE_SCHEMA_VERSION, to: STORAGE_SCHEMA_VERSION });
    const after = Object.fromEntries([...Object.keys(REPRESENTATIVE_PROFILE), 'chess-study-board-renderer'].map((key) => [key, localStorage.getItem(key)]));
    expect(after).toEqual(before);
  });
});
