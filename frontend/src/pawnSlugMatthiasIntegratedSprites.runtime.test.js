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
  PAWN_SLUG_MATTHIAS_CANONICAL_IDENTITY,
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
  it('locks Pawn Slug Matthias to the approved human-soldier identity', () => {
    expect(PAWN_SLUG_MATTHIAS_CANONICAL_IDENTITY.version).toBe('pawn-slug-matthias-canon-v1');
    expect(PAWN_SLUG_MATTHIAS_CANONICAL_IDENTITY.bodyForm).toBe('human-tactical-soldier');
    expect(PAWN_SLUG_MATTHIAS_CANONICAL_IDENTITY.uniform).toBe('black-tactical');
    expect(PAWN_SLUG_MATTHIAS_CANONICAL_IDENTITY.face).toBe('canonical-matthias-spherical-pawn-face');
    expect(PAWN_SLUG_MATTHIAS_CANONICAL_IDENTITY.headgear).toBe('canonical-black-officer-cap');
    expect(PAWN_SLUG_MATTHIAS_CANONICAL_IDENTITY.forbiddenBodyForms).toContain('chess-pawn-body');
    expect(PAWN_SLUG_MATTHIAS_CANONICAL_IDENTITY.forbiddenFaces).toContain('generic-human-face');

    const sprite = createIntegratedMatthiasSlugSprite();
    expect(sprite.userData.pawnSlugCanonicalMatthias).toBe(true);
    expect(sprite.userData.pawnSlugCanonicalIdentity).toBe(PAWN_SLUG_MATTHIAS_CANONICAL_IDENTITY);
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.canonicalIdentity).toBe(PAWN_SLUG_MATTHIAS_CANONICAL_IDENTITY);
  });

  it('switches the canonical baked atlas through the existing setWeapon contract', () => {
    const sprite = createIntegratedMatthiasSlugSprite();
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.version).toBe('blender-premium-v3');
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.atlasRevision).toBe('blender-premium-v3');
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.frameWidth).toBe(192);
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.frameHeight).toBe(192);
    expect(sprite.userData.atlas.weapon).toBe('pistol');
    sprite.userData.setWeapon('shotgun');
    expect(sprite.userData.animation.weapon).toBe('shotgun');
    expect(sprite.userData.atlas.weapon).toBe('shotgun');
    expect(sprite.userData.atlas.source).toBe('primary');
    expect(sprite.userData.atlas.assetVersion).toBe('blender-premium-v3');
    expect(sprite.userData.atlas.atlasRevision).toBe('blender-premium-v3');
  });

  it('preserves the authored foot line and world scale at double raster resolution', () => {
    const sprite = createIntegratedMatthiasSlugSprite();
    expect(sprite.scale.x).toBeCloseTo(PAWN_SLUG_MATTHIAS_PREMIUM_RUNTIME.scale[0]);
    expect(sprite.scale.y).toBeCloseTo(PAWN_SLUG_MATTHIAS_PREMIUM_RUNTIME.scale[1]);
    expect(PAWN_SLUG_MATTHIAS_PREMIUM_RUNTIME.authoredBottomGutterPx).toBe(24);
    expect(sprite.center.y).toBeCloseTo(24 / 192);
    expect(sprite.userData.motionBaseScaleY).toBeCloseTo(3.0);
  });

  it('uses uniform guarded UV cells at 192px without legacy jump trim', () => {
    const idle = pawnSlugPremiumMatthiasAtlasWindow('idle', 0, -1);
    const jump = pawnSlugPremiumMatthiasAtlasWindow('jump', 8, -1);
    expect(PAWN_SLUG_MATTHIAS_PREMIUM_RUNTIME.uvGuardTexels).toBe(2);
    expect(idle.repeatY).toBeCloseTo(188 / 960);
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

  it('does not reapply the compact legacy aspect squeeze to canonical premium art', () => {
    const sprite = createIntegratedMatthiasSlugSprite();
    const before = sprite.scale.y;
    expect(applyPawnSlugMatthiasPrimaryAspect(sprite)).toBe(false);
    expect(sprite.scale.y).toBe(before);
  });

  it('keeps the runtime weapon slot as a renderable separate attachment', () => {
    const weapon = createWeaponSprite('pistol');
    expect(weapon.type).toBe('Sprite');
    expect(weapon.userData.weaponId).toBe('pistol');
    expect(weapon.userData.pawnSlugSeparateWeaponAttachment).toBe(true);
    expect(weapon.userData.pawnSlugGripAnchored).toBe(true);
    expect(weapon.userData.pawnSlugIntegratedWeaponShell).toBeUndefined();
  });
});
