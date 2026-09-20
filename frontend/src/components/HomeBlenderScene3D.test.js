import { describe, expect, it } from 'vitest';
import {
  HOME_BLENDER_RUNTIME_MIN_WIDTH,
  homeBlenderPointerParallaxEnabled,
  homeBlenderPolicyNeedsFallback,
  homeBlenderRuntimePolicy,
} from './HomeBlenderScene3D.jsx';

describe('HomeBlenderScene3D mobile runtime policy', () => {
  it('allows the canonical Blender Home from 360px on capable Android-class hardware', () => {
    expect(HOME_BLENDER_RUNTIME_MIN_WIDTH).toBe(360);

    for (const viewportWidth of [360, 390, 430, 768]) {
      expect(homeBlenderRuntimePolicy({
        viewportWidth,
        devicePixelRatio: 3,
        hardwareConcurrency: 8,
      })).toMatchObject({
        enabled: true,
        lod: 'lite',
        pixelRatio: 1.25,
        antialias: false,
        powerPreference: 'low-power',
      });
    }
  });

  it('keeps constrained phones on the existing fallback path', () => {
    expect(homeBlenderRuntimePolicy({
      viewportWidth: 390,
      devicePixelRatio: 3,
      hardwareConcurrency: 4,
    })).toMatchObject({ enabled: false, lod: 'lite' });

    expect(homeBlenderRuntimePolicy({
      viewportWidth: 430,
      devicePixelRatio: 2,
      hardwareConcurrency: 2,
    })).toMatchObject({ enabled: false, lod: '2d' });
  });

  it('preserves full-quality Blender rendering on roomy desktop hardware', () => {
    expect(homeBlenderRuntimePolicy({
      viewportWidth: 1440,
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
    })).toMatchObject({
      enabled: true,
      lod: 'full',
      antialias: true,
      powerPreference: 'high-performance',
    });
  });
});


describe('HomeBlenderScene3D live fallback policy', () => {
  it('falls back when a resize/runtime policy disables 3D', () => {
    expect(homeBlenderPolicyNeedsFallback({ enabled: false, lod: 'lite' })).toBe(true);
    expect(homeBlenderPolicyNeedsFallback({ enabled: false, lod: '2d' })).toBe(true);
    expect(homeBlenderPolicyNeedsFallback({ enabled: true, lod: '2d' })).toBe(true);
  });

  it('keeps the Blender scene mounted while lite/full remain eligible', () => {
    expect(homeBlenderPolicyNeedsFallback({ enabled: true, lod: 'lite' })).toBe(false);
    expect(homeBlenderPolicyNeedsFallback({ enabled: true, lod: 'full' })).toBe(false);
  });
});


describe('HomeBlenderScene3D pointer parallax policy', () => {
  it('keeps camera parallax on fine-pointer desktop when motion is allowed', () => {
    expect(homeBlenderPointerParallaxEnabled({
      reducedMotion: false,
      coarsePointer: false,
    })).toBe(true);
  });

  it('disables camera parallax for touch/coarse pointer and reduced motion', () => {
    expect(homeBlenderPointerParallaxEnabled({
      reducedMotion: false,
      coarsePointer: true,
    })).toBe(false);
    expect(homeBlenderPointerParallaxEnabled({
      reducedMotion: true,
      coarsePointer: false,
    })).toBe(false);
  });
});
