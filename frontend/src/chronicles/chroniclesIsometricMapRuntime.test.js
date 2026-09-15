import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import {
  chroniclesIsoRenderPlan,
  chroniclesIsoWorldObjectState,
} from './chroniclesIsometricMapRuntime.js';

describe('Chronicles isometric map runtime', () => {
  it('describes distinct room topology and visual roles from the active map', () => {
    const crypt = chroniclesIsoRenderPlan(createChroniclesState('crypt-eight-squares'));
    const gallery = chroniclesIsoRenderPlan(createChroniclesState('gallery-of-forks'));

    expect(gallery.mapId).toBe('gallery-of-forks');
    expect(gallery.grid).not.toEqual(crypt.grid);
    expect(gallery.width).toBe(7);
    expect(gallery.height).toBe(7);
    expect(gallery.enemies).toEqual([
      { id: 'corrupted-pawn', visualType: 'corrupted-pawn' },
      { id: 'gate-jailer', visualType: 'gate-jailer' },
    ]);
    expect(gallery.lever?.position).toEqual({ x: 5, y: 5 });
    expect(gallery.pickup?.position).toEqual({ x: 5, y: 4 });
    expect(gallery.sigil).toBeNull();
  });

  it('derives prop state from each map conditions instead of crypt-specific flags', () => {
    const crypt = createChroniclesState('crypt-eight-squares');
    expect(chroniclesIsoWorldObjectState(crypt)).toEqual({ leverPulled: false, pickupVisible: false });
    expect(chroniclesIsoWorldObjectState({ ...crypt, runeCacheOpened: true })).toEqual({
      leverPulled: true,
      pickupVisible: true,
    });

    const gallery = createChroniclesState('gallery-of-forks');
    expect(chroniclesIsoWorldObjectState(gallery)).toEqual({ leverPulled: false, pickupVisible: false });
    expect(chroniclesIsoWorldObjectState({ ...gallery, galleryLeverPulled: true })).toEqual({
      leverPulled: true,
      pickupVisible: true,
    });
    expect(chroniclesIsoWorldObjectState({ ...gallery, galleryLeverPulled: true, galleryRelicCollected: true })).toEqual({
      leverPulled: true,
      pickupVisible: false,
    });
  });

  it('keeps content identity separate from reusable visual roles', () => {
    const synthetic = {
      id: 'synthetic-room',
      title: 'Synthetic',
      grid: ['###', '#.#', '###'],
      enemies: [{ id: 'fork-warden', visualType: 'gate-jailer' }],
      triggers: [],
      interactables: [],
      treasures: [],
    };

    expect(chroniclesIsoRenderPlan(synthetic).enemies).toEqual([
      { id: 'fork-warden', visualType: 'gate-jailer' },
    ]);
  });
});
