import { describe, expect, it } from 'vitest';
import { chroniclesMapById } from './chroniclesMapCatalog.js';
import {
  chroniclesContentActivated,
  chroniclesContentVisualStateById,
  chroniclesContentVisualStates,
} from './chroniclesContentVisualState.js';

describe('Chronicles authored content visual state', () => {
  it('keeps persistent props visible while their authored action state changes', () => {
    const crypt = chroniclesMapById('crypt-eight-squares');
    const sleeping = {
      mapId: crypt.id,
      sigilAwake: false,
      runeCacheOpened: false,
      runeCoreCollected: false,
    };

    expect(chroniclesContentVisualStateById(sleeping, 'ancient-sigil', crypt)).toMatchObject({
      kind: 'trigger',
      available: true,
      activated: false,
      visible: true,
    });
    expect(chroniclesContentVisualStateById(sleeping, 'rune-cache-lever', crypt)).toMatchObject({
      kind: 'lever',
      available: true,
      activated: false,
      visible: true,
    });
    expect(chroniclesContentVisualStateById(sleeping, 'rune-core', crypt)).toMatchObject({
      kind: 'pickup',
      available: false,
      activated: false,
      visible: false,
    });

    const opened = {
      ...sleeping,
      sigilAwake: true,
      runeCacheOpened: true,
    };
    expect(chroniclesContentVisualStateById(opened, 'ancient-sigil', crypt)).toMatchObject({
      available: false,
      activated: true,
      visible: true,
    });
    expect(chroniclesContentVisualStateById(opened, 'rune-cache-lever', crypt)).toMatchObject({
      available: false,
      activated: true,
      visible: true,
    });
    expect(chroniclesContentVisualStateById(opened, 'rune-core', crypt)).toMatchObject({
      available: true,
      activated: false,
      visible: true,
    });

    const collected = { ...opened, runeCoreCollected: true };
    expect(chroniclesContentVisualStateById(collected, 'rune-core', crypt)).toMatchObject({
      available: false,
      activated: true,
      visible: false,
    });
  });

  it('derives Gallery visual state from Gallery authored flags, not Crypt aliases', () => {
    const gallery = chroniclesMapById('gallery-of-forks');
    const state = {
      mapId: gallery.id,
      galleryLeverPulled: true,
      galleryRelicCollected: false,
      runeCacheOpened: false,
      runeCoreCollected: false,
    };

    const lever = chroniclesContentVisualStateById(state, 'gallery-lever', gallery);
    const relic = chroniclesContentVisualStateById(state, 'gallery-relic', gallery);

    expect(lever).toMatchObject({
      kind: 'lever',
      available: false,
      activated: true,
      visible: true,
    });
    expect(relic).toMatchObject({
      kind: 'pickup',
      available: true,
      activated: false,
      visible: true,
    });
  });

  it('preserves plural authored props and fails closed for unknown ids', () => {
    const map = {
      id: 'synthetic-visual-room',
      grid: ['###', '#.#', '###'],
      triggers: [],
      interactables: [
        {
          id: 'west-lever',
          kind: 'lever',
          x: 1,
          y: 1,
          when: [{ key: 'westPulled', equals: false }],
          action: { effects: [{ type: 'set', key: 'westPulled', value: true }] },
        },
        {
          id: 'east-lever',
          kind: 'lever',
          x: 1,
          y: 1,
          when: [{ key: 'eastPulled', equals: false }],
          action: { effects: [{ type: 'set', key: 'eastPulled', value: true }] },
        },
      ],
      treasures: [],
      traps: [],
      exits: [],
    };
    const state = { westPulled: true, eastPulled: false };
    const visual = chroniclesContentVisualStates(state, map);

    expect(visual).toHaveLength(2);
    expect(visual.map((entry) => entry.id)).toEqual(['west-lever', 'east-lever']);
    expect(visual.map((entry) => entry.activated)).toEqual([true, false]);
    expect(Object.isFrozen(visual)).toBe(true);
    expect(chroniclesContentVisualStateById(state, 'missing', map)).toBeNull();
    expect(chroniclesContentActivated(state, null)).toBe(false);
  });
});
