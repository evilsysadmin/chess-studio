import { describe, expect, it, vi } from 'vitest';

vi.mock('three', async () => {
  const actual = await vi.importActual('three');
  return {
    ...actual,
    TextureLoader: class {
      load(_url, onLoad) {
        const texture = {
          repeat: { set: vi.fn() },
          offset: { set: vi.fn() },
          dispose: vi.fn(),
          needsUpdate: false,
        };
        onLoad(texture);
        return texture;
      }
    },
  };
});

import {
  PAWN_SLUG_MATTHIAS_INTEGRATED_SCALE,
  createIntegratedMatthiasSlugSprite,
} from './pawnSlugMatthiasIntegratedSprites.js';
import {
  applyPawnSlugMatthiasPrimaryAspect,
  createWeaponSprite,
} from './pawnSlugSprites.js';

describe('Pawn Slug integrated Matthias runtime', () => {
  it('switches the baked atlas through the existing setWeapon contract', () => {
    const sprite = createIntegratedMatthiasSlugSprite();
    expect(sprite.userData.atlas.weapon).toBe('pistol');
    sprite.userData.setWeapon('shotgun');
    expect(sprite.userData.animation.weapon).toBe('shotgun');
    expect(sprite.userData.atlas.weapon).toBe('shotgun');
    expect(sprite.userData.atlas.source).toBe('primary');
  });

  it('compensates the larger Blender bake cell so Matthias keeps hero-scale presence', () => {
    const sprite = createIntegratedMatthiasSlugSprite();
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_SCALE.bakeCellCompensation).toBe(1.5);
    expect(sprite.scale.x).toBeCloseTo(2.655, 3);
    expect(sprite.scale.y).toBeCloseTo(3.84, 3);
    expect(sprite.userData.motionBaseScaleX).toBeCloseTo(2.655, 3);
    expect(sprite.userData.motionBaseScaleY).toBeCloseTo(3.84, 3);
  });

  it('does not apply the legacy primary-aspect squeeze to Blender-integrated art', () => {
    const sprite = createIntegratedMatthiasSlugSprite();
    const before = sprite.scale.y;
    expect(applyPawnSlugMatthiasPrimaryAspect(sprite)).toBe(false);
    expect(sprite.scale.y).toBe(before);
    expect(sprite.userData.pawnSlugPrimaryAspectScaleY).toBeUndefined();
  });

  it('keeps the old weapon model slot as a zero-geometry compatibility shell', () => {
    const shell = createWeaponSprite('pistol');
    expect(shell.userData.pawnSlugIntegratedWeaponShell).toBe(true);
    expect(shell.type).toBe('Object3D');
    expect(shell.children).toHaveLength(0);
  });
});
