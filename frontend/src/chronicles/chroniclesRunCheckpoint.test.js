import { describe, expect, it } from 'vitest';

import {
  chroniclesCheckpointSignature,
  chroniclesHydrateRunState,
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

  it('hydrates only the authoritative durable layer onto an initialized map state', () => {
    const initial = createChroniclesState('gallery-of-forks');
    const restored = chroniclesHydrateRunState(initial, {
      currentMapId: 'gallery-of-forks',
      worldFlags: { galleryLeverPulled: true, sigilAwake: true },
      consumedContentIds: ['gallery-lever'],
      claimedRewards: ['reward:gallery'],
    });

    expect(restored.galleryLeverPulled).toBe(true);
    expect(restored.sigilAwake).toBe(true);
    expect(restored.consumedContentIds).toEqual(['gallery-lever']);
    expect(restored.claimedRewards).toEqual(['reward:gallery']);
    expect(restored.x).toBe(initial.x);
    expect(restored.y).toBe(initial.y);
  });

  it('uses a durable signature that ignores movement and UI chatter', () => {
    const initial = createChroniclesState('gallery-of-forks');
    const moved = { ...initial, x: initial.x + 1, turns: 99, message: 'noise' };
    expect(chroniclesCheckpointSignature(moved)).toBe(chroniclesCheckpointSignature(initial));

    const changed = { ...moved, galleryLeverPulled: true };
    expect(chroniclesCheckpointSignature(changed)).not.toBe(chroniclesCheckpointSignature(initial));
  });

});
