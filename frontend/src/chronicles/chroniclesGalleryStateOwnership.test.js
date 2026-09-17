import { describe, expect, it } from 'vitest';
import { chroniclesMapById } from './chroniclesMapCatalog.js';
import { chroniclesContentVisualStateById } from './chroniclesContentVisualState.js';

function authoredSetKeys(map) {
  return [
    ...(map.triggers || []),
    ...(map.interactables || []),
    ...(map.treasures || []),
    ...(map.traps || []),
    ...(map.exits || []),
  ].flatMap((entry) => entry?.action?.effects || [])
    .filter((effect) => effect?.type === 'set')
    .map((effect) => effect.key);
}

describe('Chronicles Gallery authored state ownership', () => {
  it('owns its lever and relic state without Crypt compatibility aliases', () => {
    const gallery = chroniclesMapById('gallery-of-forks');

    expect(gallery.version).toBe(3);
    expect(gallery.initialFlags).toMatchObject({
      galleryLeverPulled: false,
      galleryRelicCollected: false,
    });
    expect(gallery.initialFlags).not.toHaveProperty('runeCacheOpened');
    expect(gallery.initialFlags).not.toHaveProperty('runeCoreCollected');
    expect(authoredSetKeys(gallery)).not.toContain('runeCacheOpened');
    expect(authoredSetKeys(gallery)).not.toContain('runeCoreCollected');
  });

  it('still drives lever and relic visuals solely from Gallery flags', () => {
    const gallery = chroniclesMapById('gallery-of-forks');
    const initial = { mapId: gallery.id, ...gallery.initialFlags };
    const leverPulled = { ...initial, galleryLeverPulled: true };
    const relicCollected = { ...leverPulled, galleryRelicCollected: true };

    expect(chroniclesContentVisualStateById(initial, 'gallery-lever', gallery)).toMatchObject({
      activated: false,
      visible: true,
    });
    expect(chroniclesContentVisualStateById(initial, 'gallery-relic', gallery)).toMatchObject({
      activated: false,
      visible: false,
    });
    expect(chroniclesContentVisualStateById(leverPulled, 'gallery-lever', gallery)).toMatchObject({
      activated: true,
      visible: true,
    });
    expect(chroniclesContentVisualStateById(leverPulled, 'gallery-relic', gallery)).toMatchObject({
      activated: false,
      visible: true,
    });
    expect(chroniclesContentVisualStateById(relicCollected, 'gallery-relic', gallery)).toMatchObject({
      activated: true,
      visible: false,
    });
  });
});
