import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from '../safeStorage.js';
import {
  CHRONICLES_FIRST_PERSON_RUN_STORAGE_KEY,
  CHRONICLES_TACTICS_RUN_STORAGE_KEY,
  beginChroniclesRun,
  ensureChroniclesRun,
  finishChroniclesRun,
  renewChroniclesRun,
} from './chroniclesRunIdentity.js';

describe('Chronicles scoped run identity', () => {
  beforeEach(() => {
    clearStorageMemoryFallback();
    localStorage.clear();
    localStorage.setItem('chess-study-auth-username', 'alice');
  });

  it('preserves the legacy Tactics storage key while isolating first person', () => {
    expect(CHRONICLES_TACTICS_RUN_STORAGE_KEY).toBe('chess-study-chronicles-tactics-run-v2');
    expect(CHRONICLES_FIRST_PERSON_RUN_STORAGE_KEY).toBe('chess-study-chronicles-first-person-run-v1');

    const tactics = ensureChroniclesRun('tactics');
    const firstPerson = ensureChroniclesRun('first-person');

    expect(firstPerson).not.toBe(tactics);
    expect(JSON.parse(localStorage.getItem(CHRONICLES_TACTICS_RUN_STORAGE_KEY)).id).toBe(tactics);
    expect(JSON.parse(localStorage.getItem(CHRONICLES_FIRST_PERSON_RUN_STORAGE_KEY)).id).toBe(firstPerson);
  });

  it('keeps one active first-person expedition across remounts', () => {
    const first = beginChroniclesRun('first-person');
    expect(ensureChroniclesRun('first-person')).toBe(first);
    expect(ensureChroniclesRun('first-person')).toBe(first);
  });

  it('finishes an expedition so the next entry gets a fresh identity', () => {
    const first = beginChroniclesRun('first-person');
    expect(finishChroniclesRun('first-person', first)).toBe(true);

    const second = ensureChroniclesRun('first-person');
    expect(second).not.toBe(first);
    expect(ensureChroniclesRun('first-person')).toBe(second);
  });

  it('renews a stale identity once without clobbering a newer replacement', () => {
    const stale = beginChroniclesRun('first-person');
    const replacement = renewChroniclesRun('first-person', stale);

    expect(replacement).not.toBe(stale);
    expect(ensureChroniclesRun('first-person')).toBe(replacement);
    expect(renewChroniclesRun('first-person', stale)).toBe(replacement);
  });

  it('never inherits an active expedition across authenticated users', () => {
    const aliceRun = beginChroniclesRun('first-person');

    localStorage.setItem('chess-study-auth-username', 'bob');
    const bobRun = ensureChroniclesRun('first-person');

    expect(bobRun).not.toBe(aliceRun);
    expect(JSON.parse(localStorage.getItem(CHRONICLES_FIRST_PERSON_RUN_STORAGE_KEY)).owner).toBe('bob');
  });
});
