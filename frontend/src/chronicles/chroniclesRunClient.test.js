import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth.js', () => ({
  authHeader: () => ({ Authorization: 'Bearer test-token' }),
}));

const { requestJson } = vi.hoisted(() => ({ requestJson: vi.fn() }));
vi.mock('../http.js', () => ({ requestJson }));

import { chroniclesCheckpointRun, chroniclesCheckpointState, chroniclesCreateRun } from './chroniclesRunClient.js';

beforeEach(() => {
  requestJson.mockReset();
  requestJson.mockResolvedValue({ runId: 'run-1' });
});

describe('Chronicles run transport', () => {
  it('creates an authenticated run without inventing an idempotency key', async () => {
    await chroniclesCreateRun('crypt-eight-squares');

    expect(requestJson).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/chronicles\/runs$/),
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({ mapId: 'crypt-eight-squares' }),
        signal: undefined,
      }),
    );
  });

  it('forwards a caller-owned idempotency key unchanged', async () => {
    const signal = new AbortController().signal;
    await chroniclesCreateRun('gallery-of-forks', {
      operationId: 'chronicles-bootstrap-0001',
      signal,
    });

    expect(requestJson.mock.calls[0][1]).toMatchObject({
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'chronicles-bootstrap-0001',
        Authorization: 'Bearer test-token',
      },
      signal,
    });
  });

  it('sends authoritative checkpoint payloads with auth and caller cancellation', async () => {
    const signal = new AbortController().signal;
    const checkpoint = {
      expectedWorldVersion: 3,
      currentMapId: 'gallery-of-forks',
      worldFlags: { galleryLeverPulled: true },
      consumedContentIds: ['gallery-lever'],
      claimedRewards: ['reward:gallery-relic'],
    };

    await chroniclesCheckpointRun('run/with spaces', checkpoint, { signal });

    expect(requestJson).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/chronicles\/runs\/run%2Fwith%20spaces\/checkpoint$/),
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify(checkpoint),
        signal,
      },
    );
  });

  it('projects state through the bounded checkpoint contract before sending', async () => {
    await chroniclesCheckpointState(
      'run-2',
      {
        mapId: 'gallery-of-forks',
        galleryLeverPulled: true,
        x: 99,
        message: 'never persist me',
      },
      7,
    );

    const [, options] = requestJson.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      expectedWorldVersion: 7,
      currentMapId: 'gallery-of-forks',
      inventory: {},
      quests: {},
      worldFlags: {
        galleryLeverPulled: true,
        '__chrRuntime.version': 1,
        '__chrRuntime.x': 99,
      },
      consumedContentIds: [],
      claimedRewards: [],
    });
  });

});
