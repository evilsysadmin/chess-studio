import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PAWN_SLUG_MOTION_PROFILES,
  PAWN_SLUG_SPRITE_META,
  configurePawnSlugTexture,
} from './pawnSlugSprites.js';

describe('Pawn Slug premium sprite contracts', () => {
  it('keeps expanded player/enemy atlases isolated in lazy-owned assets', () => {
    expect(PAWN_SLUG_SPRITE_META.matthias.frames).toBe(8);
    expect(PAWN_SLUG_SPRITE_META.enemies.frames).toBe(12);
    expect(PAWN_SLUG_SPRITE_META.boss.frames).toBe(1);
    expect(PAWN_SLUG_SPRITE_META.weapons.frames).toBe(4);
    expect(PAWN_SLUG_SPRITE_META.matthias.frameWidth).toBe(256);
    expect(PAWN_SLUG_SPRITE_META.matthias.frameHeight).toBe(256);
    expect(PAWN_SLUG_SPRITE_META.enemies.frameWidth).toBe(256);
    expect(PAWN_SLUG_SPRITE_META.enemies.frameHeight).toBe(256);
    expect(PAWN_SLUG_SPRITE_META.boss.frameWidth).toBe(192);
    expect(PAWN_SLUG_SPRITE_META.boss.frameHeight).toBe(192);
    expect(PAWN_SLUG_SPRITE_META.weapons.frameHeight).toBe(128);
  });

  it('locks Matthias to a four-frame run gait plus explicit combat poses', () => {
    expect(PAWN_SLUG_SPRITE_META.matthias.sourceFacing).toBe('right');
    expect(PAWN_SLUG_SPRITE_META.matthias.framesByAction).toEqual({
      idle: 0,
      run: [1, 2, 3, 4],
      crouch: 5,
      fire: 6,
      airborne: 7,
    });
  });

  it('gives pawn, knight and rook their own four-frame animation banks', () => {
    expect(PAWN_SLUG_SPRITE_META.enemies.sourceFacing).toBe('right');
    expect(PAWN_SLUG_SPRITE_META.enemies.framesByType).toEqual({
      pawn: [0, 1, 2, 3],
      knight: [4, 5, 6, 7],
      rook: [8, 9, 10, 11],
    });
    const frames = Object.values(PAWN_SLUG_SPRITE_META.enemies.framesByType).flat();
    expect(new Set(frames).size).toBe(12);
    expect(Math.max(...frames)).toBeLessThan(PAWN_SLUG_SPRITE_META.enemies.frames);
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

  it('uses WebGL1-safe clamp wrapping for wide actor atlases', () => {
    const texture = {};
    configurePawnSlugTexture(texture);
    expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.minFilter).toBe(THREE.LinearFilter);
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
  });

  it('serves the premium actor atlases from local vector assets', () => {
    const localSvg = /(?:\.svg(?:\?|$)|^data:image\/svg\+xml(?:[,;]))/;
    expect(String(PAWN_SLUG_SPRITE_META.matthias.url)).toMatch(localSvg);
    expect(String(PAWN_SLUG_SPRITE_META.enemies.url)).toMatch(localSvg);
    expect(String(PAWN_SLUG_SPRITE_META.matthias.fallbackUrl)).toMatch(localSvg);
    expect(String(PAWN_SLUG_SPRITE_META.enemies.fallbackUrl)).toMatch(localSvg);
  });

  it('uses local runtime assets instead of remote sprites', () => {
    for (const meta of Object.values(PAWN_SLUG_SPRITE_META)) {
      expect(meta.url).toBeTruthy();
      expect(String(meta.url)).not.toMatch(/^https?:\/\//);
      if (meta.fallbackUrl) expect(String(meta.fallbackUrl)).not.toMatch(/^https?:\/\//);
    }
  });
});
