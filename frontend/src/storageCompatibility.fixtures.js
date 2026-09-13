// Raw localStorage snapshots used by the compatibility drill.
// Keep these literals independent from current implementation constants: they
// represent what an older browser profile actually has on disk before boot.
const PROGRESS = Object.freeze({
  'chess-study-game-history': JSON.stringify([{ id: 'game-42', result: 'win' }]),
  'chess-study-player-rating': '1375',
  'chess-study-personal-puzzles': JSON.stringify([{ id: 'puzzle-9', fen: 'fixture-fen' }]),
  'chess-study-combat-roster': JSON.stringify({ credits: 17, identities: { 'p-a': { alias: 'Rivas' } } }),
  'chess-study-achievements': JSON.stringify(['first-win']),
  'chess-study-unknown-progress-key': JSON.stringify({ keep: true }),
});

function snapshot(extra = {}) {
  return Object.freeze({ ...PROGRESS, ...extra });
}

export const STORAGE_COMPATIBILITY_FIXTURES = Object.freeze([
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
      'chess-study-storage-schema-version': '3',
    }),
    result: Object.freeze({ status: 'ok', from: 0, to: 3, durable: true }),
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
      'chess-study-storage-schema-version': '3',
      'chess-study-board-renderer': '3d',
    }),
    result: Object.freeze({ status: 'ok', from: 1, to: 3, durable: true }),
  }),
  Object.freeze({
    label: 'schema v2 · renderer migration pending',
    before: snapshot({
      'chess-study-storage-schema-version': '2',
      'chess-study-board-renderer': '2d',
    }),
    after: snapshot({
      'chess-study-storage-schema-version': '3',
      'chess-study-board-renderer': '3d',
    }),
    result: Object.freeze({ status: 'ok', from: 2, to: 3, durable: true }),
  }),
  Object.freeze({
    label: 'schema v3 · current snapshot is stable',
    before: snapshot({
      'chess-study-storage-schema-version': '3',
      'chess-study-board-renderer': '2d',
      'chess-study-music-muted': '0',
      'chess-study-fx-muted': '1',
    }),
    after: snapshot({
      'chess-study-storage-schema-version': '3',
      'chess-study-board-renderer': '2d',
      'chess-study-music-muted': '0',
      'chess-study-fx-muted': '1',
    }),
    result: Object.freeze({ status: 'ok', from: 3, to: 3, durable: true }),
  }),
]);
