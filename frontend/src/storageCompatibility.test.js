import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import {
  DEFAULT_RADIO_RETIRED_ECLECTIC_THEME_IDS,
  DEFAULT_RADIO_RETIRED_THEME_IDS,
  migratePersistentStorage,
  STORAGE_SCHEMA_VERSION,
} from './storageMigrations.js';

// Raw localStorage snapshots used by the compatibility drill.
// Keep the BEFORE literals independent from current implementation constants:
// they represent what an older browser profile actually has on disk before boot.
const PROGRESS = Object.freeze({
  'chess-study-game-history': JSON.stringify([{ id: 'game-42', result: 'win' }]),
  'chess-study-player-rating': '1375',
  'chess-study-personal-puzzles': JSON.stringify([{ id: 'puzzle-9', fen: 'fixture-fen' }]),
  'chess-study-combat-roster': JSON.stringify({ credits: 17, identities: { 'p-a': { alias: 'Rivas' } } }),
  'chess-study-achievements': JSON.stringify(['first-win']),
  'chess-study-unknown-progress-key': JSON.stringify({ keep: true }),
});

const CURRENT_SCHEMA = String(STORAGE_SCHEMA_VERSION);
// AFTER snapshots describe the current client contract, so derive this output
// from the canonical curation lists. BEFORE snapshots above remain historical
// literals and therefore still exercise real legacy-profile migration.
const CURATED_RADIO_EXCLUSIONS = JSON.stringify([
  ...DEFAULT_RADIO_RETIRED_THEME_IDS,
  ...DEFAULT_RADIO_RETIRED_ECLECTIC_THEME_IDS,
]);

function snapshot(extra = {}) {
  return Object.freeze({ ...PROGRESS, ...extra });
}

const STORAGE_COMPATIBILITY_FIXTURES = Object.freeze([
  Object.freeze({
    label: 'schema v0 · legacy mute + retired preferences',
    before: snapshot({
      'chess-study-muted': '1',
      'chess-study-board-renderer': '2d',
      'chess-study-cpu-personality': 'old-sarcastic',
      'chess-study-ambient-theme': 'old-theme',
    }),
    after: snapshot({
      'chess-study-muted': '1',
      'chess-study-music-muted': '1',
      'chess-study-fx-muted': '1',
      'chess-study-board-renderer': '3d',
      'chess-study-music-excluded': CURATED_RADIO_EXCLUSIONS,
      'chess-study-storage-schema-version': CURRENT_SCHEMA,
    }),
    result: Object.freeze({ status: 'ok', from: 0, to: STORAGE_SCHEMA_VERSION, durable: true }),
  }),
  Object.freeze({
    label: 'schema v1 · retired preferences still present',
    before: snapshot({
      'chess-study-storage-schema-version': '1',
      'chess-study-board-renderer': '2d',
      'chess-study-cpu-personality': 'old-sarcastic',
      'chess-study-ambient-theme': 'old-theme',
    }),
    after: snapshot({
      'chess-study-storage-schema-version': CURRENT_SCHEMA,
      'chess-study-board-renderer': '3d',
      'chess-study-music-excluded': CURATED_RADIO_EXCLUSIONS,
    }),
    result: Object.freeze({ status: 'ok', from: 1, to: STORAGE_SCHEMA_VERSION, durable: true }),
  }),
  Object.freeze({
    label: 'schema v2 · renderer migration pending',
    before: snapshot({
      'chess-study-storage-schema-version': '2',
      'chess-study-board-renderer': '2d',
    }),
    after: snapshot({
      'chess-study-storage-schema-version': CURRENT_SCHEMA,
      'chess-study-board-renderer': '3d',
      'chess-study-music-excluded': CURATED_RADIO_EXCLUSIONS,
    }),
    result: Object.freeze({ status: 'ok', from: 2, to: STORAGE_SCHEMA_VERSION, durable: true }),
  }),
  Object.freeze({
    label: 'schema v3 · radio curation pending',
    before: snapshot({
      'chess-study-storage-schema-version': '3',
      'chess-study-board-renderer': '2d',
      'chess-study-music-muted': '0',
      'chess-study-fx-muted': '1',
    }),
    after: snapshot({
      'chess-study-storage-schema-version': CURRENT_SCHEMA,
      'chess-study-board-renderer': '2d',
      'chess-study-music-muted': '0',
      'chess-study-fx-muted': '1',
      'chess-study-music-excluded': CURATED_RADIO_EXCLUSIONS,
    }),
    result: Object.freeze({ status: 'ok', from: 3, to: STORAGE_SCHEMA_VERSION, durable: true }),
  }),
]);

function seedSnapshot(snapshotValue) {
  for (const [key, value] of Object.entries(snapshotValue)) localStorage.setItem(key, value);
}

function readSnapshot() {
  return Object.fromEntries(
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter(Boolean)
      .sort()
      .map((key) => [key, localStorage.getItem(key)]),
  );
}

describe('legacy save migration snapshot drill', () => {
  beforeEach(() => {
    localStorage.clear();
    clearStorageMemoryFallback();
  });

  for (const fixture of STORAGE_COMPATIBILITY_FIXTURES) {
    it(`${fixture.label} reaches the expected snapshot without collateral data loss`, () => {
      seedSnapshot(fixture.before);

      const result = migratePersistentStorage();

      expect(result).toEqual(fixture.result);
      expect(readSnapshot()).toEqual(fixture.after);
    });
  }
});
