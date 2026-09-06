import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PAWN_SLUG_MATTHIAS_POSE_TRACKS,
  PAWN_SLUG_MOTION_PROFILES,
  PAWN_SLUG_SPRITE_META,
  configurePawnSlugTexture,
  pawnSlugMatthiasAtlasWindow,
  pawnSlugMatthiasVisualDirection,
} from './pawnSlugSprites.js';

describe('Pawn Slug premium sprite contracts', () => {
  it('uses the approved Matthias v5 mock atlas as the primary runtime source', () => {
    const meta = PAWN_SLUG_SPRITE_META.matthias;
    expect(meta.assetVersion).toBe('v5-approved-mock');
    expect(meta.assetName).toMatch(/matthias_motion_atlas_v5_payload\.b64$/);
    expect(String(meta.url)).toMatch(/^data:image\/webp;base64,/);
    expect(String(meta.fallbackUrl)).toMatch(/matthias_atlas_v2\.webp(?:\?|$)/);
    expect(String(meta.vectorFallbackUrl)).toMatch(/\.svg(?:\?|$)/);
    expect(meta.url).not.toBe(meta.fallbackUrl);
  });

  it('describes the real 16x5 v5 raster grid without addressing padding cells', () => {
    const meta = PAWN_SLUG_SPRITE_META.matthias;
    expect(meta.frames).toBe(55);
    expect(meta.cells).toBe(80);
    expect(meta.columns).toBe(16);
    expect(meta.rows).toBe(5);
    expect(meta.frameWidth).toBe(96);
    expect(meta.frameHeight).toBe(96);
    expect(meta.sourceFacing).toBe('right');
    expect(meta.sourceFacingByAction).toEqual({
      idle: 'right',
      walk: 'right',
      run: 'right',
      crouch: 'right',
      jump: 'right',
    });
    expect(meta.runtimeFacings).toEqual(['right', 'left']);
    expect(meta.directionMode).toBe('atlas-uv-mirror');
    expect(meta.uvGuardTexels).toBe(1);
    expect(meta.motionFrames).toEqual({
      idle: 10,
      walk: 10,
      run: 16,
      crouch: 10,
      airborne: 9,
    });
    expect(meta.actions).toEqual({
      idle: { row: 0, count: 10 },
      walk: { row: 1, count: 10 },
      run: { row: 2, count: 16 },
      crouch: { row: 3, count: 10 },
      jump: { row: 4, count: 9 },
    });
  });

  it('uses every approved raster frame and gives running the richer cycle', () => {
    expect(PAWN_SLUG_MATTHIAS_POSE_TRACKS.idle).toHaveLength(10);
    expect(PAWN_SLUG_MATTHIAS_POSE_TRACKS.walk).toHaveLength(10);
    expect(PAWN_SLUG_MATTHIAS_POSE_TRACKS.run).toHaveLength(16);
    expect(PAWN_SLUG_MATTHIAS_POSE_TRACKS.crouch).toHaveLength(10);
    expect(PAWN_SLUG_MATTHIAS_POSE_TRACKS.jump).toHaveLength(9);
    expect(PAWN_SLUG_MATTHIAS_POSE_TRACKS.run.length)
      .toBeGreaterThan(PAWN_SLUG_MATTHIAS_POSE_TRACKS.walk.length);

    for (const track of Object.values(PAWN_SLUG_MATTHIAS_POSE_TRACKS)) {
      expect(new Set(track).size).toBe(track.length);
      expect(track[0]).toBe(0);
      expect(track.at(-1)).toBe(track.length - 1);
    }
  });

  it('maps each action to its own guarded v5 atlas row and wraps indices within the action', () => {
    const atlasWidth = 16 * 96;
    const atlasHeight = 5 * 96;
    const guardedRepeatX = 94 / atlasWidth;
    const guardedRepeatY = 94 / atlasHeight;
    const cases = [
      ['idle', 9, 0, 9],
      ['walk', 9, 1, 9],
      ['run', 15, 2, 15],
      ['crouch', 9, 3, 9],
      ['jump', 8, 4, 8],
    ];

    for (const [action, frame, row, column] of cases) {
      const window = pawnSlugMatthiasAtlasWindow(action, frame, 1);
      expect(window).toMatchObject({ row, column, direction: 1, mirrored: false });
      expect(window.offsetX).toBeCloseTo(((column * 96) + 1) / atlasWidth, 12);
      expect(window.offsetY).toBeCloseTo((atlasHeight - ((row + 1) * 96) + 1) / atlasHeight, 12);
      expect(window.repeatX).toBeCloseTo(guardedRepeatX, 12);
      expect(window.repeatY).toBeCloseTo(guardedRepeatY, 12);
    }

    expect(pawnSlugMatthiasAtlasWindow('run', 16).column).toBe(0);
    expect(pawnSlugMatthiasAtlasWindow('crouch', 10).column).toBe(0);
    expect(pawnSlugMatthiasAtlasWindow('jump', 9).column).toBe(0);
  });

  it('samples the same Matthias frame in both directions instead of flipping the whole sprite', () => {
    const atlasWidth = 16 * 96;
    const right = pawnSlugMatthiasAtlasWindow('walk', 7, 1);
    const left = pawnSlugMatthiasAtlasWindow('walk', 7, -1);

    expect(right).toMatchObject({ action: 'walk', row: 1, column: 7, direction: 1, mirrored: false });
    expect(left).toMatchObject({ action: 'walk', row: 1, column: 7, direction: -1, mirrored: true });
    expect(right.repeatX).toBeGreaterThan(0);
    expect(left.repeatX).toBeLessThan(0);
    expect(Math.abs(left.repeatX)).toBeCloseTo(right.repeatX, 12);
    expect(right.offsetX).toBeCloseTo(((7 * 96) + 1) / atlasWidth, 12);
    expect(left.offsetX).toBeCloseTo(((8 * 96) - 1) / atlasWidth, 12);
    expect(left.offsetY).toBeCloseTo(right.offsetY, 12);
    expect(left.repeatY).toBeCloseTo(right.repeatY, 12);
  });

  it('keeps every v5 source pose canonically right-facing while exposing both runtime facings', () => {
    for (const action of ['idle', 'walk', 'run', 'crouch', 'jump']) {
      expect(pawnSlugMatthiasVisualDirection(action, 1)).toBe(1);
      expect(pawnSlugMatthiasVisualDirection(action, -1)).toBe(-1);
      expect(pawnSlugMatthiasAtlasWindow(action, 0, 1).mirrored).toBe(false);
      expect(pawnSlugMatthiasAtlasWindow(action, 0, -1).mirrored).toBe(true);
    }
    expect(PAWN_SLUG_MOTION_PROFILES.matthias.crouchScaleY).toBeLessThan(0.85);
    expect(PAWN_SLUG_MOTION_PROFILES.matthias.crouchScaleX).toBeGreaterThan(1);
    expect(PAWN_SLUG_MOTION_PROFILES.matthias.crouchDrop).toBeGreaterThan(0);
  });

  it('keeps pawn, knight and rook on their premium silhouettes', () => {
    expect(PAWN_SLUG_SPRITE_META.enemies.sourceFacing).toBe('right');
    expect(PAWN_SLUG_SPRITE_META.enemies.frameByType).toEqual({ pawn: 0, knight: 1, rook: 2 });
    expect(Math.max(...Object.values(PAWN_SLUG_SPRITE_META.enemies.frameByType)))
      .toBeLessThan(PAWN_SLUG_SPRITE_META.enemies.frames);
  });

  it('gives every battlefield class a deliberately different motion signature', () => {
    expect(PAWN_SLUG_MOTION_PROFILES.knight.moveBob).toBeGreaterThan(PAWN_SLUG_MOTION_PROFILES.pawn.moveBob);
    expect(PAWN_SLUG_MOTION_PROFILES.pawn.moveBob).toBeGreaterThan(PAWN_SLUG_MOTION_PROFILES.rook.moveBob);
    expect(PAWN_SLUG_MOTION_PROFILES.knight.moveLean).toBeGreaterThan(PAWN_SLUG_MOTION_PROFILES.pawn.moveLean);
    expect(PAWN_SLUG_MOTION_PROFILES.rook.moveRate).toBeLessThan(PAWN_SLUG_MOTION_PROFILES.pawn.moveRate);
    expect(PAWN_SLUG_MOTION_PROFILES.boss.idleBob).toBeGreaterThan(0);
    expect(PAWN_SLUG_MOTION_PROFILES.matthias.runRate).toBeGreaterThan(14);
    expect(PAWN_SLUG_MOTION_PROFILES.matthias.recoilByWeapon.panzerfaust)
      .toBeGreaterThan(PAWN_SLUG_MOTION_PROFILES.matthias.recoilByWeapon.pistol);
  });

  it('uses WebGL1-safe clamp wrapping for actor atlases', () => {
    const texture = {};
    configurePawnSlugTexture(texture);
    expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.minFilter).toBe(THREE.LinearFilter);
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
  });

  it('uses embedded or local runtime assets instead of remote sprites', () => {
    for (const meta of Object.values(PAWN_SLUG_SPRITE_META)) {
      expect(meta.url).toBeTruthy();
      expect(String(meta.url)).not.toMatch(/^https?:\/\//);
      if (meta.fallbackUrl) expect(String(meta.fallbackUrl)).not.toMatch(/^https?:\/\//);
      if (meta.vectorFallbackUrl) expect(String(meta.vectorFallbackUrl)).not.toMatch(/^https?:\/\//);
    }
  });
});
