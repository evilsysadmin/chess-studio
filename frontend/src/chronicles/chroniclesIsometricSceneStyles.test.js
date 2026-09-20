import { describe, expect, it } from 'vitest';
import {
  CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION,
  chroniclesIsometricSceneStyle,
} from './chroniclesIsometricSceneStyles.js';

describe('Chronicles isometric scene styles', () => {
  it('keeps the crypt look stable while giving authored rooms distinct palettes and dressing', () => {
    const crypt = chroniclesIsometricSceneStyle('crypt-eight-squares');
    const gallery = chroniclesIsometricSceneStyle('gallery-of-forks');
    const menagerie = chroniclesIsometricSceneStyle('menagerie-of-ash');

    expect(CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION).toBe(3);
    expect(crypt.dressing).toBe('crypt-legacy');
    expect(gallery.dressing).toBe('gallery-forked-v3');
    expect(menagerie.dressing).toBe('menagerie-ash-v3');
    expect(crypt.palette.background).toBe(0x100c09);
    expect(crypt.palette.floor).toEqual([0x4e4a43, 0x575249, 0x45423d, 0x5b554b]);
    expect(gallery.palette).not.toBe(crypt.palette);
    expect(menagerie.palette).not.toBe(crypt.palette);
    expect(menagerie.palette).not.toBe(gallery.palette);
    expect(menagerie.palette.floor[3]).toBeGreaterThan(menagerie.palette.floor[0]);
  });

  it('freezes palette collections and keeps the neutral fallback renderable', () => {
    const gallery = chroniclesIsometricSceneStyle('gallery-of-forks');
    const fallback = chroniclesIsometricSceneStyle('missing-room');

    expect(Object.isFrozen(gallery.palette)).toBe(true);
    expect(Object.isFrozen(gallery.palette.floor)).toBe(true);
    expect(Object.isFrozen(gallery.palette.wall)).toBe(true);
    expect(fallback.id).toBe('neutral');
    expect(fallback.palette.floor.length).toBeGreaterThan(0);
    expect(fallback.palette.wall.length).toBeGreaterThan(0);
  });
});
