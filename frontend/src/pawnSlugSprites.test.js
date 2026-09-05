import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PAWN_SLUG_MATTHIAS_POSE_TRACKS,
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

  it('uses the premium Matthias source frames without addressing nonexistent poses', () => {
    expect(PAWN_SLUG_SPRITE_META.matthias.sourceFacing).toBe('right');
    expect(PAWN_SLUG_SPRITE_META.matthias.framesByAction).toEqual({
      idle: 0,
      run: [1, 2],
      crouch: 0,
      fire: 3,
      airborne: 2,
    });
    expect(PAWN_SLUG_SPRITE_META.matthias.motionFrames).toEqual({
      run: 9,
      crouch: 8,
      airborne: 8,
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

  it('builds nine run phases and eight-phase crouch/jump tracks on top of premium art', () => {
    expect(PAWN_SLUG_MATTHIAS_POSE_TRACKS.run).toHaveLength(9);
    expect(PAWN_SLUG_MATTHIAS_POSE_TRACKS.crouch).toHaveLength(8);
    expect(PAWN_SLUG_MATTHIAS_POSE_TRACKS.jump).toHaveLength(8);

    for (const track of Object.values(PAWN_SLUG_MATTHIAS_POSE_TRACKS)) {
      for (const pose of track) {
        expect(pose.frame).toBeGreaterThanOrEqual(0);
        expect(pose.frame).toBeLessThan(PAWN_SLUG_SPRITE_META.matthias.frames);
        expect(Math.abs(pose.x)).toBeLessThan(0.08);
        expect(Math.abs(pose.y)).toBeLessThan(0.08);
        expect(pose.scaleX).toBeGreaterThan(0.9);
        expect(pose.scaleX).toBeLessThan(1.1);
        expect(pose.scaleY).toBeGreaterThan(0.75);
        expect(pose.scaleY).toBeLessThan(1.1);
      }
    }
  });

  it('makes the run gait visibly asymmetric instead of a two-frame bob loop', () => {
    const signatures = PAWN_SLUG_MATTHIAS_POSE_TRACKS.run.map((pose) => (
      [pose.frame, pose.x, pose.y, pose.scaleX, pose.scaleY, pose.rotation].join(':')
    ));
    expect(new Set(signatures).size).toBe(9);
    expect(Math.max(...PAWN_SLUG_MATTHIAS_POSE_TRACKS.run.map((pose) => pose.y)))
      .toBeGreaterThan(0.03);
    expect(Math.min(...PAWN_SLUG_MATTHIAS_POSE_TRACKS.run.map((pose) => pose.rotation)))
      .toBeLessThan(0);
    expect(Math.max(...PAWN_SLUG_MATTHIAS_POSE_TRACKS.run.map((pose) => pose.rotation)))
      .toBeGreaterThan(0);
  });

  it('keeps crouch grounded and jump stretched without dust/ground-effect sprites', () => {
    const crouch = PAWN_SLUG_MATTHIAS_POSE_TRACKS.crouch;
    const jump = PAWN_SLUG_MATTHIAS_POSE_TRACKS.jump;
    expect(crouch.at(-1).scaleY).toBeLessThan(crouch[0].scaleY);
    expect(crouch.at(-1).y).toBeLessThanOrEqual(0);
    expect(Math.max(...jump.map((pose) => pose.scaleY))).toBeGreaterThan(1.03);
    expect(Math.max(...jump.map((pose) => pose.y))).toBeGreaterThan(0.04);
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
