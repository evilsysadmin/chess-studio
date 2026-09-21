import { describe, expect, it, vi } from 'vitest';

import { createChroniclesState } from '../chroniclesOfMatthias.js';
import { createChroniclesCheckpointWriter } from './chroniclesCheckpointWriter.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Chronicles checkpoint writer', () => {
  it('does not emit HTTP for movement-only state changes', async () => {
    const initial = createChroniclesState('gallery-of-forks');
    const checkpointState = vi.fn();
    const writer = createChroniclesCheckpointWriter({
      runId: 'run-1',
      worldVersion: 0,
      initialState: initial,
      checkpointState,
    });

    expect(writer.offer({ ...initial, x: initial.x + 1, turns: 1, message: 'moved' })).toBe(false);
    await Promise.resolve();
    expect(checkpointState).not.toHaveBeenCalled();
  });

  it('serializes and coalesces durable writes with monotonic CAS versions', async () => {
    const initial = createChroniclesState('gallery-of-forks');
    const first = deferred();
    const second = deferred();
    const checkpointState = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const writer = createChroniclesCheckpointWriter({
      runId: 'run-2',
      worldVersion: 0,
      initialState: initial,
      checkpointState,
    });

    writer.offer({ ...initial, galleryLeverPulled: true });
    writer.offer({ ...initial, galleryLeverPulled: true, galleryRelicCollected: true });
    expect(checkpointState).toHaveBeenCalledTimes(1);
    expect(checkpointState.mock.calls[0][2]).toBe(0);

    first.resolve({ worldVersion: 1 });
    await vi.waitFor(() => expect(checkpointState).toHaveBeenCalledTimes(2));
    expect(checkpointState.mock.calls[1][2]).toBe(1);

    second.resolve({ worldVersion: 2 });
    await vi.waitFor(() => expect(writer.worldVersion()).toBe(2));
  });

  it('surfaces CAS conflicts without retry storms', async () => {
    const initial = createChroniclesState('gallery-of-forks');
    const conflict = Object.assign(new Error('stale'), { status: 409 });
    const onConflict = vi.fn();
    const checkpointState = vi.fn().mockRejectedValue(conflict);
    const writer = createChroniclesCheckpointWriter({
      runId: 'run-3',
      worldVersion: 4,
      initialState: initial,
      checkpointState,
      onConflict,
    });

    writer.offer({ ...initial, galleryLeverPulled: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(checkpointState).toHaveBeenCalledTimes(1);
    expect(onConflict).toHaveBeenCalledWith(conflict);
  });
});
