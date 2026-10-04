import { describe, expect, it } from 'vitest';
import { CHRONICLES_MINIMUM_VISIBILITY } from './chroniclesLightingPolicy.js';
import {
  CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION,
  chroniclesIsometricSceneStyle,
} from './chroniclesIsometricSceneStyles.js';

describe('Chronicles isometric scene styles', () => {
  it('keeps the crypt look stable while giving authored rooms distinct palettes and dressing', () => {
    const crypt = chroniclesIsometricSceneStyle('crypt-eight-squares');
    const gallery = chroniclesIsometricSceneStyle('gallery-of-forks');
    const menagerie = chroniclesIsometricSceneStyle('menagerie-of-ash');
    const bellTower = chroniclesIsometricSceneStyle('hollow-bell-tower');

    expect(CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION).toBe(4);
    expect(crypt.dressing).toBe('crypt-legacy');
    expect(gallery.dressing).toBe('gallery-forked-v3');
    expect(menagerie.dressing).toBe('menagerie-ash-v3');
    expect(bellTower.dressing).toBe('hollow-bell-v1');
    expect(crypt.palette.background).toBe(0x100c09);
    expect(crypt.palette.floor).toEqual([0x4e4a43, 0x575249, 0x45423d, 0x5b554b]);
    expect(gallery.palette).not.toBe(crypt.palette);
    expect(menagerie.palette).not.toBe(crypt.palette);
    expect(menagerie.palette).not.toBe(gallery.palette);
    expect(bellTower.palette).not.toBe(crypt.palette);
    expect(bellTower.palette).not.toBe(gallery.palette);
    expect(menagerie.palette.floor[3]).toBeGreaterThan(menagerie.palette.floor[0]);
    expect(menagerie.lighting.exposure).toBeGreaterThan(gallery.lighting.exposure);
    expect(menagerie.lighting.fill).toBeGreaterThan(1);
    expect(bellTower.lighting.exposure).toBeGreaterThan(1.1);
    expect(bellTower.lighting.fill).toBeGreaterThan(1.3);
  });

  it('never lets an authored scenario fall below the shared visibility floor', () => {
    const floor = CHRONICLES_MINIMUM_VISIBILITY.isometric;
    const mapIds = [
      'crypt-eight-squares',
      'gallery-of-forks',
      'menagerie-of-ash',
      'hollow-bell-tower',
      'missing-room',
    ];

    mapIds.forEach((mapId) => {
      const lighting = chroniclesIsometricSceneStyle(mapId).lighting;
      expect(lighting.exposure).toBeGreaterThanOrEqual(floor.exposure);
      expect(lighting.hemi).toBeGreaterThanOrEqual(floor.hemi);
      expect(lighting.fill).toBeGreaterThanOrEqual(floor.fill);
      expect(lighting.bounce).toBeGreaterThanOrEqual(floor.bounce);
    });
  });

  it('freezes palette collections and keeps the neutral fallback renderable', () => {
    const gallery = chroniclesIsometricSceneStyle('gallery-of-forks');
    const fallback = chroniclesIsometricSceneStyle('missing-room');

    expect(Object.isFrozen(gallery.palette)).toBe(true);
    expect(Object.isFrozen(gallery.palette.floor)).toBe(true);
    expect(Object.isFrozen(gallery.palette.wall)).toBe(true);
    expect(Object.isFrozen(gallery.lighting)).toBe(true);
    expect(fallback.id).toBe('neutral');
    expect(fallback.palette.floor.length).toBeGreaterThan(0);
    expect(fallback.palette.wall.length).toBeGreaterThan(0);
  });
});
