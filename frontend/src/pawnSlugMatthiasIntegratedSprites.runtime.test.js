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
  PAWN_SLUG_MATTHIAS_INTEGRATED_ART,
  PAWN_SLUG_MATTHIAS_PREMIUM_RUNTIME,
  createIntegratedMatthiasSlugSprite,
  pawnSlugPremiumMatthiasAtlasWindow,
} from './pawnSlugMatthiasIntegratedSprites.js';
import {
  applyPawnSlugMatthiasPrimaryAspect,
  createWeaponSprite,
} from './pawnSlugSprites.js';

describe('Pawn Slug integrated Matthias runtime', () => {
  it('switches the premium baked atlas through the existing setWeapon contract', () => {
    const sprite = createIntegratedMatthiasSlugSprite();
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.version).toBe('blender-premium-v2');
    expect(sprite.userData.atlas.weapon).toBe('pistol');
    sprite.userData.setWeapon('shotgun');
    expect(sprite.userData.animation.weapon).toBe('shotgun');
    expect(sprite.userData.atlas.weapon).toBe('shotgun');
    expect(sprite.userData.atlas.source).toBe('primary');
  });

  it('uses the authored foot line and premium world scale', () => {
    const sprite = createIntegratedMatthiasSlugSprite();
    expect(sprite.scale.x).toBeCloseTo(PAWN_SLUG_MATTHIAS_PREMIUM_RUNTIME.scale[0]);
    expect(sprite.scale.y).toBeCloseTo(PAWN_SLUG_MATTHIAS_PREMIUM_RUNTIME.scale[1]);
    expect(sprite.center.y).toBeCloseTo(12 / 96);
    expect(sprite.userData.motionBaseScaleY).toBeCloseTo(3.0);
  });

  it('uses uniform guarded UV cells instead of the legacy jump trim', () => {
    const idle = pawnSlugPremiumMatthiasAtlasWindow('idle', 0, -1);
    const jump = pawnSlugPremiumMatthiasAtlasWindow('jump', 8, -1);
    expect(idle.repeatY).toBeCloseTo(94 / 480);
    expect(jump.repeatY).toBeCloseTo(idle.repeatY);
    expect(jump.frameIndex).toBe(8);
    expect(jump.row).toBe(4);
  });

  it('normalizes Blender left-facing art to the requested world direction', () => {
    const right = pawnSlugPremiumMatthiasAtlasWindow('run', 3, 1);
    const left = pawnSlugPremiumMatthiasAtlasWindow('run', 3, -1);
    expect(right.mirrored).toBe(true);
    expect(right.repeatX).toBeLessThan(0);
    expect(left.mirrored).toBe(false);
    expect(left.repeatX).toBeGreaterThan(0);
  });

  it('does not reapply the compact legacy aspect squeeze to premium Blender art', () => {
    const sprite = createIntegratedMatthiasSlugSprite();
    const before = sprite.scale.y;
    expect(applyPawnSlugMatthiasPrimaryAspect(sprite)).toBe(false);
    expect(sprite.scale.y).toBe(before);
  });

  it('keeps the old weapon model slot as a zero-geometry compatibility shell', () => {
    const shell = createWeaponSprite('pistol');
    expect(shell.userData.pawnSlugIntegratedWeaponShell).toBe(true);
    expect(shell.type).toBe('Object3D');
    expect(shell.children).toHaveLength(0);
  });
});
