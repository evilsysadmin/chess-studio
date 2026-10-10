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
  CHRONICLES_SAVE_CATALOG_KEY,
  chroniclesListSavedRuns,
  chroniclesMergeRemoteSavedRuns,
  chroniclesMarkSavedRunRemote,
  chroniclesSaveCatalogOwner,
  chroniclesSelectedRunIsRemote,
  chroniclesSelectSavedRun,
  chroniclesRenameSavedRun,
  chroniclesForgetSavedRun,
  chroniclesNoteSavedRunCheckpoint,
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

  it('mints an explicitly selected authored campaign run without rewriting legacy or Tactics identities', () => {
    const legacy = beginChroniclesRun('first-person');
    const campaign = beginChroniclesRun('first-person', { entryMapId: 'swordhaven-campaign' });
    expect(campaign).not.toBe(legacy);
    expect(chroniclesRunEntryMapId('first-person')).toBe('swordhaven-campaign');
    expect(ensureChroniclesRun('tactics')).toBe(campaign);
    expect(chroniclesRunEntryMapId('tactics')).toBe('swordhaven-campaign');
    expect(chroniclesListSavedRuns('first-person')).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: legacy, entryMapId: 'swordhaven-square' }),
      expect.objectContaining({ id: campaign, entryMapId: 'swordhaven-campaign' }),
    ]));
    expect(chroniclesSelectSavedRun('first-person', legacy)).toBe(true);
    expect(chroniclesRunEntryMapId('first-person')).toBe('swordhaven-square');
  });

  it('rejects unsupported fresh-run map choices before changing the selected save', () => {
    const current = beginChroniclesRun('first-person');
    expect(() => beginChroniclesRun('first-person', { entryMapId: 'crypt-eight-squares' })).toThrow(RangeError);
    expect(() => beginChroniclesRun('first-person', { entryMapId: 'unknown' })).toThrow(RangeError);
    expect(() => beginChroniclesRun('tactics', { entryMapId: 'swordhaven-campaign' })).toThrow(RangeError);
    expect(ensureChroniclesRun('first-person')).toBe(current);
    expect(chroniclesListSavedRuns('first-person')).toHaveLength(1);
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


  it('preserves the authored campaign route when renewing a stale first-person run', () => {
    const stale = beginChroniclesRun('first-person', { entryMapId: 'swordhaven-campaign' });
    const renewed = renewChroniclesRun('first-person', stale);
    expect(renewed).not.toBe(stale);
    expect(chroniclesRunEntryMapId('first-person')).toBe('swordhaven-campaign');
    expect(chroniclesListSavedRuns('first-person').map((run) => run.id)).toContain(renewed);
  });

  it('indexes old runs without changing their idempotent server IDs', () => {
    localStorage.setItem(CHRONICLES_RUN_STORAGE_KEY, JSON.stringify({
      id: 'old-run', owner: 'alice', ended: false,
    }));
    const saves = chroniclesListSavedRuns('first-person');
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ id: 'old-run', entryMapId: null, active: true });
    expect(ensureChroniclesRun('first-person')).toBe('old-run');
  });

  it('preserves separate expeditions when switching and starting new ones', () => {
    const first = beginChroniclesRun('first-person');
    chroniclesRenameSavedRun('first-person', first, 'Campaña de Hildegard');
    chroniclesNoteSavedRunCheckpoint('first-person', first, 'crypt-eight-squares');
    const second = beginChroniclesRun('first-person');
    expect(second).not.toBe(first);
    const saves = chroniclesListSavedRuns('first-person');
    expect(saves.map((save) => save.id)).toEqual(expect.arrayContaining([first, second]));
    expect(saves.find((save) => save.id === first)).toMatchObject({
      title: 'Campaña de Hildegard', currentMapId: 'crypt-eight-squares', active: false,
    });
    expect(chroniclesSelectSavedRun('first-person', first)).toBe(true);
    expect(ensureChroniclesRun('tactics')).toBe(first);
    expect(chroniclesRunEntryMapId('first-person')).toBe('swordhaven-square');
    expect(chroniclesListSavedRuns('first-person').find((save) => save.id === first).active).toBe(true);
  });

  it('removes only the chosen local slot without touching another run', () => {
    const first = beginChroniclesRun('first-person');
    const second = beginChroniclesRun('first-person');
    expect(chroniclesForgetSavedRun('first-person', second)).toBe(true);
    expect(chroniclesListSavedRuns('first-person').map((row) => row.id)).toEqual([first]);
    expect(ensureChroniclesRun('first-person')).not.toBe(second);
    expect(chroniclesSelectSavedRun('first-person', first)).toBe(true);
    expect(chroniclesForgetSavedRun('first-person', 'not-my-slot')).toBe(false);
  });

  it('cannot list, load, rename or forget a different account’s saves', () => {
    const aliceId = beginChroniclesRun('first-person');
    localStorage.setItem('chess-study-auth-username', 'bob');
    expect(chroniclesListSavedRuns('first-person')).toEqual([]);
    expect(chroniclesSelectSavedRun('first-person', aliceId)).toBe(false);
    expect(chroniclesRenameSavedRun('first-person', aliceId, 'Malicious')).toBe(false);
    expect(chroniclesForgetSavedRun('first-person', aliceId)).toBe(false);
    expect(JSON.parse(localStorage.getItem(CHRONICLES_SAVE_CATALOG_KEY)).owner).toBe('alice');
  });

  it('treats corrupt catalog data as empty and keeps old runs migratable', () => {
    localStorage.setItem(CHRONICLES_SAVE_CATALOG_KEY, 'not-json');
    localStorage.setItem(CHRONICLES_FIRST_PERSON_RUN_STORAGE_KEY, JSON.stringify({
      id: 'legacy-one', owner: 'alice', ended: false,
    }));
    expect(chroniclesListSavedRuns('first-person').map((row) => row.id)).toEqual(['legacy-one']);
    expect(chroniclesRenameSavedRun('first-person', 'legacy-one', '   ')).toBe(false);
  });


  it('reconciles cross-device server runs, preserves local labels and uses GET selection', () => {
    const pendingId = beginChroniclesRun('first-person');
    const remoteId = 'remote-owned-1';
    const rows = [{ runId: remoteId, currentMapId: 'crypt-eight-squares', status: 'active', updatedAtMs: 1760000000000 }];
    const merged = chroniclesMergeRemoteSavedRuns('first-person', rows);
    expect(merged.map((save) => save.id)).toContain(remoteId);
    expect(merged.map((save) => save.id)).toContain(pendingId);
    expect(merged.find((save) => save.id === remoteId)).toMatchObject({
      remote: true, currentMapId: 'crypt-eight-squares', updatedAt: 1760000000000,
    });
    expect(chroniclesSelectSavedRun('first-person', remoteId)).toBe(true);
    expect(chroniclesSelectedRunIsRemote('first-person', remoteId)).toBe(true);
    expect(chroniclesRenameSavedRun('first-person', remoteId, 'Mi expedición remota')).toBe(true);
    expect(chroniclesMergeRemoteSavedRuns('first-person', rows).find((save) => save.id === remoteId).title).toBe('Mi expedición remota');
    // Server no longer reports the run: a complete list removes its stale slot.
    expect(chroniclesMergeRemoteSavedRuns('first-person', []).some((save) => save.id === remoteId)).toBe(false);
    expect(chroniclesSelectedRunIsRemote('first-person', remoteId)).toBe(false);
  });

  it('never accepts malformed remote inventories or leaks them across owners', () => {
    expect(() => chroniclesMergeRemoteSavedRuns('first-person', {})).toThrow(TypeError);
    chroniclesMergeRemoteSavedRuns('first-person', [{
      runId: 'alice-remote', status: 'active', updatedAtMs: 1760000000000,
    }]);
    localStorage.setItem('chess-study-auth-username', 'bob');
    expect(chroniclesListSavedRuns('first-person')).toEqual([]);
    chroniclesMergeRemoteSavedRuns('first-person', [{
      runId: 'bob-remote', status: 'active', updatedAtMs: 1760000000000,
    }]);
    expect(chroniclesListSavedRuns('first-person').map((save) => save.id)).toEqual(['bob-remote']);
  });

  it('discards a delayed catalog response when the authenticated owner changes', () => {
    const alice = chroniclesSaveCatalogOwner();
    localStorage.setItem('chess-study-auth-username', 'bob');
    expect(chroniclesMergeRemoteSavedRuns('first-person', [
      { runId: 'alice-id', currentMapId: 'swordhaven-square', status: 'active' },
    ], { expectedOwner: alice })).toEqual([]);
    expect(chroniclesListSavedRuns('first-person')).toEqual([]);
  });

  it('reads old unmarked save IDs without ever treating them as new POST slots', () => {
    localStorage.setItem(CHRONICLES_RUN_STORAGE_KEY, JSON.stringify({
      id: 'old-authoritative-run', owner: 'alice', ended: false,
    }));
    const saves = chroniclesListSavedRuns('first-person');
    expect(saves[0]).toMatchObject({ id: 'old-authoritative-run', pending: false });
    expect(chroniclesSelectedRunIsRemote('first-person', 'old-authoritative-run')).toBe(true);
    expect(chroniclesSelectSavedRun('first-person', 'old-authoritative-run')).toBe(true);
    expect(chroniclesSelectedRunIsRemote('first-person', 'old-authoritative-run')).toBe(true);
  });

  it('creates only explicit pending runs, then switches to read-only GET after server confirmation', () => {
    const id = beginChroniclesRun('first-person');
    expect(chroniclesSelectedRunIsRemote('first-person', id)).toBe(false);
    expect(chroniclesListSavedRuns('first-person')[0].pending).toBe(true);
    chroniclesMarkSavedRunRemote('first-person', id);
    expect(chroniclesSelectedRunIsRemote('first-person', id)).toBe(true);
    expect(chroniclesListSavedRuns('first-person')[0]).toMatchObject({
      id, remote: true, pending: false,
    });
  });

  it('never inherits an active expedition across authenticated users', () => {
    const aliceRun = beginChroniclesRun('first-person');

    localStorage.setItem('chess-study-auth-username', 'bob');
    const bobRun = ensureChroniclesRun('tactics');

    expect(bobRun).not.toBe(aliceRun);
    expect(JSON.parse(localStorage.getItem(CHRONICLES_RUN_STORAGE_KEY)).owner).toBe('bob');
  });
});
