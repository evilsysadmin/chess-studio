import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PAWN_SLUG_MOTION_PROFILES,
  PAWN_SLUG_SPRITE_META,
  configurePawnSlugTexture,
} from './pawnSlugSprites.js';

describe('Pawn Slug premium sprite contracts', () => {
  it('keeps the known-good premium actor atlas geometry', () => {
    expect(PAWN_SLUG_SPRITE_META.matthias.frames).toBe(4);
    expect(PAWN_SLUG_SPRITE_META.enemies.frames).toBe(3);
    expect(PAWN_SLUG_SPRITE_META.boss.frames).toBe(1);
    expect(PAWN_SLUG_SPRITE_META.weapons.frames).toBe(4);
    expect(PAWN_SLUG_SPRITE_META.matthias.frameWidth).toBe(72);
    expect(PAWN_SLUG_SPRITE_META.matthias.frameHeight).toBe(104);
    expect(PAWN_SLUG_SPRITE_META.enemies.frameWidth).toBe(104);
    expect(PAWN_SLUG_SPRITE_META.enemies.frameHeight).toBe(104);
    expect(PAWN_SLUG_SPRITE_META.boss.frameWidth).toBe(192);
    expect(PAWN_SLUG_SPRITE_META.boss.frameHeight).toBe(192);
    expect(PAWN_SLUG_SPRITE_META.weapons.frameHeight).toBe(128);
  });

  it('uses the premium Matthias run/fire frames without addressing nonexistent poses', () => {
    expect(PAWN_SLUG_SPRITE_META.matthias.sourceFacing).toBe('right');
    expect(PAWN_SLUG_SPRITE_META.matthias.framesByAction).toEqual({
      idle: 0,
      run: [1, 2],
      crouch: 0,
      fire: 3,
      airborne: 2,
    });
    const addressed = [
      PAWN_SLUG_SPRITE_META.matthias.framesByAction.idle,
      ...PAWN_SLUG_SPRITE_META.matthias.framesByAction.run,
      PAWN_SLUG_SPRITE_META.matthias.framesByAction.crouch,
      PAWN_SLUG_SPRITE_META.matthias.framesByAction.fire,
      PAWN_SLUG_SPRITE_META.matthias.framesByAction.airborne,
    ];
    expect(Math.max(...addressed)).toBeLessThan(PAWN_SLUG_SPRITE_META.matthias.frames);
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

  it('requires premium raster primaries and keeps vector art only as fallback', () => {
    const localSvg = /(?:\.svg(?:\?|$)|^data:image\/svg\+xml(?:[,;]))/;
    for (const actor of [PAWN_SLUG_SPRITE_META.matthias, PAWN_SLUG_SPRITE_META.enemies]) {
      expect(String(actor.url)).toMatch(/\.webp(?:\?|$)/);
      expect(String(actor.url)).not.toMatch(localSvg);
      expect(String(actor.fallbackUrl)).toMatch(localSvg);
      expect(actor.fallbackUrl).not.toBe(actor.url);
    }
  });

  it('uses local runtime assets instead of remote sprites', () => {
    for (const meta of Object.values(PAWN_SLUG_SPRITE_META)) {
      expect(meta.url).toBeTruthy();
      expect(String(meta.url)).not.toMatch(/^https?:\/\//);
      if (meta.fallbackUrl) expect(String(meta.fallbackUrl)).not.toMatch(/^https?:\/\//);
    }
  });
});
