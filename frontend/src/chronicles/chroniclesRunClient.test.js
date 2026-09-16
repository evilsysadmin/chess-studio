import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth.js', () => ({
  authHeader: () => ({ Authorization: 'Bearer test-token' }),
}));

const { requestJson } = vi.hoisted(() => ({ requestJson: vi.fn() }));
vi.mock('../http.js', () => ({ requestJson }));

import { chroniclesCreateRun } from './chroniclesRunClient.js';

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
});
