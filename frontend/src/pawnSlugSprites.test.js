import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PAWN_SLUG_MATTHIAS_POSE_TRACKS,
  PAWN_SLUG_MOTION_PROFILES,
  PAWN_SLUG_SPRITE_META,
  configurePawnSlugTexture,
  pawnSlugMatthiasAtlasWindow,
} from './pawnSlugSprites.js';

describe('Pawn Slug premium sprite contracts', () => {
  it('uses the raster Matthias motion atlas as the primary runtime source', () => {
    const meta = PAWN_SLUG_SPRITE_META.matthias;
    expect(String(meta.url)).toMatch(/matthias_motion_atlas_v4\.webp(?:\?|$)/);
    expect(String(meta.fallbackUrl)).toMatch(/matthias_atlas_v2\.webp(?:\?|$)/);
    expect(String(meta.vectorFallbackUrl)).toMatch(/\.svg(?:\?|$)/);
    expect(meta.url).not.toBe(meta.fallbackUrl);
  });

  it('describes the real 9x5 raster grid without addressing padding cells', () => {
    const meta = PAWN_SLUG_SPRITE_META.matthias;
    expect(meta.frames).toBe(40);
    expect(meta.cells).toBe(45);
    expect(meta.columns).toBe(9);
    expect(meta.rows).toBe(5);
    expect(meta.frameWidth).toBe(160);
    expect(meta.frameHeight).toBe(160);
    expect(meta.sourceFacing).toBe('right');
    expect(meta.motionFrames).toEqual({
      idle: 6,
      walk: 9,
      run: 9,
      crouch: 8,
      airborne: 8,
    });
    expect(meta.actions).toEqual({
      idle: { row: 0, count: 6 },
      walk: { row: 1, count: 9 },
      run: { row: 2, count: 9 },
      crouch: { row: 3, count: 8 },
      jump: { row: 4, count: 8 },
    });
  });

  it('uses real raster frames for every Matthias motion track', () => {
    expect(PAWN_SLUG_MATTHIAS_POSE_TRACKS.idle).toHaveLength(6);
    expect(PAWN_SLUG_MATTHIAS_POSE_TRACKS.walk).toHaveLength(9);
    expect(PAWN_SLUG_MATTHIAS_POSE_TRACKS.run).toHaveLength(9);
    expect(PAWN_SLUG_MATTHIAS_POSE_TRACKS.crouch).toHaveLength(8);
    expect(PAWN_SLUG_MATTHIAS_POSE_TRACKS.jump).toHaveLength(8);

    for (const track of Object.values(PAWN_SLUG_MATTHIAS_POSE_TRACKS)) {
      expect(new Set(track).size).toBe(track.length);
      expect(track[0]).toBe(0);
      expect(track.at(-1)).toBe(track.length - 1);
    }
  });

  it('maps each action to its own atlas row and clamps indices within the action', () => {
    const cases = [
      ['idle', 5, 0, 5, 5 / 9, 4 / 5],
      ['walk', 8, 1, 8, 8 / 9, 3 / 5],
      ['run', 8, 2, 8, 8 / 9, 2 / 5],
      ['crouch', 7, 3, 7, 7 / 9, 1 / 5],
      ['jump', 7, 4, 7, 7 / 9, 0],
    ];

    for (const [action, frame, row, column, offsetX, offsetY] of cases) {
      const window = pawnSlugMatthiasAtlasWindow(action, frame);
      expect(window).toMatchObject({ row, column });
      expect(window.offsetX).toBeCloseTo(offsetX, 12);
      expect(window.offsetY).toBeCloseTo(offsetY, 12);
      expect(window.repeatX).toBeCloseTo(1 / 9, 12);
      expect(window.repeatY).toBeCloseTo(1 / 5, 12);
    }

    expect(pawnSlugMatthiasAtlasWindow('run', 9).column).toBe(0);
    expect(pawnSlugMatthiasAtlasWindow('crouch', 8).column).toBe(0);
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

  it('uses local runtime assets instead of remote sprites', () => {
    for (const meta of Object.values(PAWN_SLUG_SPRITE_META)) {
      expect(meta.url).toBeTruthy();
      expect(String(meta.url)).not.toMatch(/^https?:\/\//);
      if (meta.fallbackUrl) expect(String(meta.fallbackUrl)).not.toMatch(/^https?:\/\//);
      if (meta.vectorFallbackUrl) expect(String(meta.vectorFallbackUrl)).not.toMatch(/^https?:\/\//);
    }
  });
});