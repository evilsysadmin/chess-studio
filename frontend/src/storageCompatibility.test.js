import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import { STORAGE_COMPATIBILITY_FIXTURES } from './storageCompatibility.fixtures.js';
import { migratePersistentStorage } from './storageMigrations.js';

function seedSnapshot(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value);
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
