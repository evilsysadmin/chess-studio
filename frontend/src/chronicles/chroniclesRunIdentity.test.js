import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from '../safeStorage.js';
import {
  CHRONICLES_FIRST_PERSON_RUN_STORAGE_KEY,
  CHRONICLES_RUN_STORAGE_KEY,
  CHRONICLES_TACTICS_RUN_STORAGE_KEY,
  beginChroniclesRun,
  ensureChroniclesRun,
  finishChroniclesRun,
  renewChroniclesRun,
  chroniclesRunEntryMapId,
} from './chroniclesRunIdentity.js';

describe('Chronicles shared run identity', () => {
  beforeEach(() => {
    clearStorageMemoryFallback();
    localStorage.clear();
    localStorage.setItem('chess-study-auth-username', 'alice');
  });

  it('uses one canonical active expedition across first person and Tactics', () => {
    expect(CHRONICLES_RUN_STORAGE_KEY).toBe('chess-study-chronicles-run-v1');

    const firstPerson = ensureChroniclesRun('first-person');
    const tactics = ensureChroniclesRun('tactics');

    expect(tactics).toBe(firstPerson);
    expect(JSON.parse(localStorage.getItem(CHRONICLES_RUN_STORAGE_KEY))).toMatchObject({
      id: firstPerson,
      owner: 'alice',
      ended: false,
    });
  });

  it('starts fresh first-person expeditions in Swordhaven and shares the map identity', () => {
    const id = ensureChroniclesRun('first-person');
    expect(chroniclesRunEntryMapId('first-person')).toBe('swordhaven-square');
    expect(ensureChroniclesRun('tactics')).toBe(id);
    expect(chroniclesRunEntryMapId('tactics')).toBe('swordhaven-square');
    expect(JSON.parse(localStorage.getItem(CHRONICLES_RUN_STORAGE_KEY)))
      .toMatchObject({ id, entryMapId: 'swordhaven-square' });
  });

  it('keeps fresh Tactics-first expeditions on the dungeon route for both adapters', () => {
    const id = ensureChroniclesRun('tactics');
    expect(chroniclesRunEntryMapId('tactics')).toBeNull();
    expect(ensureChroniclesRun('first-person')).toBe(id);
    expect(chroniclesRunEntryMapId('first-person')).toBeNull();
  });

  it('preserves legacy crypt run identity and server idempotency fingerprint', () => {
    localStorage.setItem(CHRONICLES_RUN_STORAGE_KEY, JSON.stringify({
      id: 'legacy-active', owner: 'alice', ended: false,
    }));
    expect(ensureChroniclesRun('first-person')).toBe('legacy-active');
    expect(chroniclesRunEntryMapId('first-person')).toBeNull();
  });

  it('migrates the active legacy identity from the adapter entered first', () => {
    localStorage.setItem(CHRONICLES_FIRST_PERSON_RUN_STORAGE_KEY, JSON.stringify({
      id: 'legacy-first-person',
      owner: 'alice',
      ended: false,
    }));
    localStorage.setItem(CHRONICLES_TACTICS_RUN_STORAGE_KEY, JSON.stringify({
      id: 'legacy-tactics',
      owner: 'alice',
      ended: false,
    }));

    expect(ensureChroniclesRun('first-person')).toBe('legacy-first-person');
    expect(ensureChroniclesRun('tactics')).toBe('legacy-first-person');
    expect(JSON.parse(localStorage.getItem(CHRONICLES_RUN_STORAGE_KEY)).id).toBe('legacy-first-person');
  });

  it('can migrate a Tactics-only legacy expedition into the shared identity', () => {
    localStorage.setItem(CHRONICLES_TACTICS_RUN_STORAGE_KEY, JSON.stringify({
      id: 'legacy-tactics',
      owner: 'alice',
      ended: false,
    }));

    expect(ensureChroniclesRun('tactics')).toBe('legacy-tactics');
    expect(ensureChroniclesRun('first-person')).toBe('legacy-tactics');
  });

  it('keeps one active expedition across remounts', () => {
    const first = beginChroniclesRun('first-person');
    expect(ensureChroniclesRun('first-person')).toBe(first);
    expect(ensureChroniclesRun('tactics')).toBe(first);
  });

  it('finishes an expedition so the next entry gets a fresh shared identity', () => {
    const first = beginChroniclesRun('first-person');
    expect(finishChroniclesRun('tactics', first)).toBe(true);

    const second = ensureChroniclesRun('first-person');
    expect(second).not.toBe(first);
    expect(ensureChroniclesRun('tactics')).toBe(second);
  });

  it('renews a stale identity once without clobbering a newer replacement', () => {
    const stale = beginChroniclesRun('first-person');
    const replacement = renewChroniclesRun('tactics', stale);

    expect(replacement).not.toBe(stale);
    expect(ensureChroniclesRun('first-person')).toBe(replacement);
    expect(renewChroniclesRun('first-person', stale)).toBe(replacement);
  });

  it('never inherits an active expedition across authenticated users', () => {
    const aliceRun = beginChroniclesRun('first-person');

    localStorage.setItem('chess-study-auth-username', 'bob');
    const bobRun = ensureChroniclesRun('tactics');

    expect(bobRun).not.toBe(aliceRun);
    expect(JSON.parse(localStorage.getItem(CHRONICLES_RUN_STORAGE_KEY)).owner).toBe('bob');
  });
});
