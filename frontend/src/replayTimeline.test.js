import { describe, expect, it } from 'vitest';
import { DEFAULT_COMBAT_START_FEN } from './combatReplay.js';
import {
  buildCombatReplayTimeline,
  buildStandardReplayTimeline,
} from './replayTimeline.js';

describe('Replay timeline contract', () => {
  it('projects a standard game as frames, events and metadata', () => {
    const record = {
      moves: [
        { from: 'e2', to: 'e4', san: 'e4', piece: 'p' },
        { from: 'e7', to: 'e5', san: 'e5', piece: 'p' },
      ],
    };

    const timeline = buildStandardReplayTimeline(record);

    expect(timeline.events).toEqual(record.moves);
    expect(timeline.frames).toHaveLength(3);
    expect(timeline.metadata).toMatchObject({
      kind: 'standard',
      complete: true,
      failedAt: null,
      invalidInitial: false,
      invalidIndices: [],
    });
    expect(timeline.metadata.initialFen).toBe(timeline.frames[0]);
  });

  it('preserves standard replay corruption evidence in metadata', () => {
    const timeline = buildStandardReplayTimeline({
      moves: [
        { from: 'e2', to: 'e4', san: 'e4', piece: 'p' },
        { from: 'e2', to: 'e5', san: 'illegal', piece: 'p' },
      ],
    });

    expect(timeline.frames).toHaveLength(2);
    expect(timeline.events).toHaveLength(2);
    expect(timeline.metadata.complete).toBe(false);
    expect(timeline.metadata.failedAt).toBe(1);
    expect(timeline.metadata.invalidIndices).toEqual([1]);
  });

  it('projects Combat without replaying chess turns and keeps damaged slots aligned', () => {
    const after = '4k3/8/8/8/4P3/8/8/4K3 b - - 0 1';
    const record = {
      log: [
        { fenBefore: DEFAULT_COMBAT_START_FEN, fenAfter: after, from: 'e2', to: 'e4', san: 'e4' },
        { fenBefore: after, fenAfter: 'broken-fen', from: 'e8', to: 'e7', san: 'Ke7' },
      ],
    };

    const timeline = buildCombatReplayTimeline(record);

    expect(timeline.events).toEqual(record.log);
    expect(timeline.frames).toHaveLength(3);
    expect(timeline.frames[2]).toBe(timeline.frames[1]);
    expect(timeline.metadata).toMatchObject({
      kind: 'combat',
      complete: false,
      failedAt: 1,
      invalidInitial: false,
      invalidIndices: [1],
    });
    expect(timeline.metadata.initialFen).toBe(timeline.frames[0]);
  });
});
