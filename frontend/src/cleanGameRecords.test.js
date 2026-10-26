import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ readJsonStorage: vi.fn() }));
vi.mock('./safeStorage.js', () => ({
  STORAGE_LOCAL: 'local',
  readJsonStorage: storage.readJsonStorage,
}));

import { CLEAN_GAMES_KEY, loadCleanGameRecords } from './cleanGameRecords.js';

describe('lightweight clean-game records reader', () => {
  beforeEach(() => storage.readJsonStorage.mockReset());

  it('reads the same profile storage key without loading post-game analysis', () => {
    const records = { game1: { clean: true } };
    storage.readJsonStorage.mockReturnValue(records);
    expect(loadCleanGameRecords()).toEqual(records);
    expect(storage.readJsonStorage).toHaveBeenCalledWith('local', CLEAN_GAMES_KEY, { fallback: {} });
  });

  it.each([null, [], 'invalid', 42])('rejects malformed record payload %s', (value) => {
    storage.readJsonStorage.mockReturnValue(value);
    expect(loadCleanGameRecords()).toEqual({});
  });
});
