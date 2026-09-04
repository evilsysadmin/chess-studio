import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PAWN_SLUG_SPRITE_META,
  configurePawnSlugTexture,
} from './pawnSlugSprites.js';

describe('Pawn Slug premium sprite contracts', () => {
  it('keeps approved player/enemy atlases isolated in lazy-owned assets', () => {
    expect(PAWN_SLUG_SPRITE_META.matthias.frames).toBe(4);
    expect(PAWN_SLUG_SPRITE_META.enemies.frames).toBe(3);
    expect(PAWN_SLUG_SPRITE_META.boss.frames).toBe(1);
    expect(PAWN_SLUG_SPRITE_META.weapons.frames).toBe(4);
    expect(PAWN_SLUG_SPRITE_META.matthias.frameWidth).toBe(192);
    expect(PAWN_SLUG_SPRITE_META.enemies.frameWidth).toBe(192);
    expect(PAWN_SLUG_SPRITE_META.weapons.frameHeight).toBe(128);
  });

  it('locks source art to face right so visual aim matches projectile direction', () => {
    expect(PAWN_SLUG_SPRITE_META.matthias.sourceFacing).toBe('right');
    expect(PAWN_SLUG_SPRITE_META.enemies.sourceFacing).toBe('right');
    expect(PAWN_SLUG_SPRITE_META.matthias.framesByAction).toEqual({
      idle: 0,
      runA: 1,
      runB: 2,
      fire: 3,
    });
  });

  it('keeps pawn, knight and rook as distinct silhouettes', () => {
    expect(PAWN_SLUG_SPRITE_META.enemies.frameByType).toEqual({
      pawn: 0,
      knight: 1,
      rook: 2,
    });
  });

  it('uses WebGL1-safe clamp wrapping for NPOT actor atlases', () => {
    const texture = {};
    configurePawnSlugTexture(texture);
    expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.minFilter).toBe(THREE.LinearFilter);
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
  });

  it('keeps local SVG fallbacks for premium WebP actor atlases', () => {
    const localSvg = /(?:\.svg(?:\?|$)|^data:image\/svg\+xml(?:[,;]))/;
    expect(String(PAWN_SLUG_SPRITE_META.matthias.url)).toMatch(/\.webp(?:\?|$)/);
    expect(String(PAWN_SLUG_SPRITE_META.enemies.url)).toMatch(/\.webp(?:\?|$)/);
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
