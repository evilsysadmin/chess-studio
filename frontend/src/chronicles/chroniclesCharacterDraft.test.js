import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from '../safeStorage.js';
import {
  createCanonicalChroniclesCharacterBuild,
  createSeededChroniclesCharacterBuild,
} from './chroniclesCharacterBuilds.js';
import {
  clearChroniclesCharacterDraft,
  loadChroniclesCharacterDraft,
  saveChroniclesCharacterDraft,
} from './chroniclesCharacterDraft.js';

const PARTY = [
  { id: 'matthias', name: 'Matthias', maxHp: 7 },
  { id: 'rook', name: 'Hildegard', maxHp: 10 },
  { id: 'bishop', name: 'Aziz', maxHp: 6 },
  { id: 'knight', name: 'Faust', maxHp: 8 },
];

describe('Chronicles character draft', () => {
  beforeEach(() => {
    clearStorageMemoryFallback();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('chess-study-auth-username', 'alice');
  });

  it('restores one unconfirmed custom build across an F5-style reload', () => {
    const build = createSeededChroniclesCharacterBuild('vault-7', PARTY);

    expect(saveChroniclesCharacterDraft({
      seed: 'vault-7',
      activeSlot: 'bishop',
      build,
    }, PARTY)).toBe(true);

    expect(loadChroniclesCharacterDraft(PARTY)).toEqual(expect.objectContaining({
      seed: 'vault-7',
      activeSlot: 'bishop',
      build: expect.objectContaining({ mode: 'custom' }),
    }));
  });

  it('keeps drafts isolated by authenticated user in the same tab session', () => {
    const alice = createSeededChroniclesCharacterBuild('alice-seed', PARTY);
    saveChroniclesCharacterDraft({ seed: 'alice-seed', build: alice }, PARTY);

    localStorage.setItem('chess-study-auth-username', 'bob');
    expect(loadChroniclesCharacterDraft(PARTY)).toBeNull();

    const bob = createSeededChroniclesCharacterBuild('bob-seed', PARTY);
    saveChroniclesCharacterDraft({ seed: 'bob-seed', activeSlot: 'knight', build: bob }, PARTY);
    expect(loadChroniclesCharacterDraft(PARTY)?.seed).toBe('bob-seed');

    localStorage.setItem('chess-study-auth-username', 'alice');
    expect(loadChroniclesCharacterDraft(PARTY)?.seed).toBe('alice-seed');
  });

  it('does not persist canonical selection as an editor draft and clears explicitly', () => {
    expect(saveChroniclesCharacterDraft({
      build: createCanonicalChroniclesCharacterBuild(PARTY),
    }, PARTY)).toBe(false);
    expect(loadChroniclesCharacterDraft(PARTY)).toBeNull();

    saveChroniclesCharacterDraft({
      build: createSeededChroniclesCharacterBuild('discard-me', PARTY),
    }, PARTY);
    expect(loadChroniclesCharacterDraft(PARTY)).not.toBeNull();

    expect(clearChroniclesCharacterDraft()).toBe(true);
    expect(loadChroniclesCharacterDraft(PARTY)).toBeNull();
  });
});
