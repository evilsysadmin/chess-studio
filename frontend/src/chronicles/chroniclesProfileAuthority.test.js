import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  chroniclesHeroProgress,
  createChroniclesProgression,
  grantChroniclesXp,
  loadChroniclesProgression,
  saveChroniclesProgression,
} from '../chroniclesOfMatthiasProgression.js';
import {
  pullProfileFromServer,
  pushProfileToServer,
  resetProfileSyncStateForTests,
} from '../profileBackup.js';
import { clearStorageMemoryFallback } from '../safeStorage.js';

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

describe('Chronicles RPG profile authority', () => {
  beforeEach(() => {
    clearStorageMemoryFallback();
    localStorage.clear();
    localStorage.setItem('chess-study-auth-token', 'alice-token');
    localStorage.setItem('chess-study-auth-username', 'alice');
    resetProfileSyncStateForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips Chronicles progression through the authoritative profile API', async () => {
    const progressed = grantChroniclesXp(
      createChroniclesProgression(),
      'matthias',
      42,
      'fixture:profile-authority',
    ).progression;
    const saved = saveChroniclesProgression(progressed);
    const serialized = JSON.stringify(saved);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, { data: {}, revisions: {} }))
      .mockResolvedValueOnce(response(200, {
        data: { 'chess-study-chronicles-progression-v1': serialized },
        revisions: { 'chess-study-chronicles-progression-v1': 1 },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await pushProfileToServer({ throwOnError: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const patch = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH');
    expect(patch.data['chess-study-chronicles-progression-v1']).toBe(serialized);
    expect(patch.revisions['chess-study-chronicles-progression-v1']).toBe(0);

    localStorage.removeItem('chess-study-chronicles-progression-v1');
    resetProfileSyncStateForTests();
    fetchMock.mockReset().mockResolvedValueOnce(response(200, {
      data: { 'chess-study-chronicles-progression-v1': serialized },
      revisions: { 'chess-study-chronicles-progression-v1': 1 },
    }));

    const restored = await pullProfileFromServer();

    expect(restored.status).toBe('loaded');
    expect(chroniclesHeroProgress(loadChroniclesProgression(), 'matthias').xp).toBe(42);
  });
});
