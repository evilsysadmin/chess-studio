import { describe, expect, it } from 'vitest';

import {
  chroniclesApplyRunCheckpoint,
  chroniclesRunCheckpointFingerprint,
  chroniclesRunCheckpointPayload,
  chroniclesWorldFlagsForCheckpoint,
} from './chroniclesRunCheckpoint.js';
import { createChroniclesState } from '../chroniclesOfMatthias.js';

describe('Chronicles checkpoint projection', () => {
  it('projects only authored durable world flags, not renderer or combat state', () => {
    const state = {
      ...createChroniclesState('gallery-of-forks'),
      galleryLeverPulled: true,
      x: 9,
      y: 4,
      message: 'ephemeral',
      enemyTurnEvents: [{ kind: 'attack' }],
      arbitraryUiFlag: true,
    };

    const flags = chroniclesWorldFlagsForCheckpoint(state);

    expect(flags.galleryLeverPulled).toBe(true);
    expect(flags).not.toHaveProperty('x');
    expect(flags).not.toHaveProperty('y');
    expect(flags).not.toHaveProperty('message');
    expect(flags).not.toHaveProperty('enemyTurnEvents');
    expect(flags).not.toHaveProperty('arbitraryUiFlag');
  });

  it('keeps authored flags from earlier maps because cross-map consequences survive transitions', () => {
    const payload = chroniclesRunCheckpointPayload({
      ...createChroniclesState('gallery-of-forks'),
      sigilAwake: true,
      galleryLeverPulled: true,
    }, 4);

    expect(payload.expectedWorldVersion).toBe(4);
    expect(payload.currentMapId).toBe('gallery-of-forks');
    expect(payload.worldFlags).toMatchObject({
      sigilAwake: true,
      galleryLeverPulled: true,
    });
  });

  it('normalizes explicit monotonic ledgers without inventing entries', () => {
    const payload = chroniclesRunCheckpointPayload({
      ...createChroniclesState(),
      consumedContentIds: ['crypt-lever', 'crypt-lever', '', null],
      claimedRewards: ['reward:a', ' reward:a ', 'reward:b'],
    }, 0);

    expect(payload.consumedContentIds).toEqual(['crypt-lever']);
    expect(payload.claimedRewards).toEqual(['reward:a', 'reward:b']);
  });

  it('rejects missing map identity or invalid CAS versions', () => {
    expect(() => chroniclesRunCheckpointPayload({}, 0)).toThrow(/current map/i);
    expect(() => chroniclesRunCheckpointPayload({ mapId: 'crypt-eight-squares' }, -1)).toThrow(/worldVersion/i);
  });
});


describe('Chronicles run checkpoint recovery', () => {
  it('reapplies durable flags and ledgers without replacing runtime-only state', () => {
    const base = createChroniclesState('gallery-of-forks');
    const recovered = chroniclesApplyRunCheckpoint(
      { ...base, message: 'runtime-message' },
      {
        worldFlags: { galleryLeverPulled: true, cryptSigilAwake: true },
        consumedContentIds: ['gallery-lever'],
        claimedRewards: ['reward:gallery'],
      },
    );

    expect(recovered.galleryLeverPulled).toBe(true);
    expect(recovered.cryptSigilAwake).toBe(true);
    expect(recovered.message).toBe('runtime-message');
    expect(recovered.consumedContentIds).toEqual(['gallery-lever']);
    expect(recovered.claimedRewards).toEqual(['reward:gallery']);
  });

  it('fingerprints only durable checkpoint state', () => {
    const base = createChroniclesState('gallery-of-forks');
    const left = chroniclesRunCheckpointFingerprint({ ...base, x: 1, y: 2, message: 'uno' });
    const right = chroniclesRunCheckpointFingerprint({ ...base, x: 7, y: 8, message: 'dos' });
    expect(left).toBe(right);

    const changed = chroniclesRunCheckpointFingerprint({ ...base, galleryLeverPulled: true });
    expect(changed).not.toBe(left);
  });
});
