import { describe, expect, it } from 'vitest';
import {
  HOME_BLENDER_RUNTIME_MIN_WIDTH,
  homeBlenderFireKind,
  homeBlenderFireMotion,
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


describe('HomeBlenderScene3D live flame animation', () => {
  it('classifies hearth, candle and wall-torch flames without touching unrelated props', () => {
    expect(homeBlenderFireKind('HOME_PROP_fireplace_left_front_flame_2')).toBe('flame');
    expect(homeBlenderFireKind('HOME_PROP_fireplace_right_front_hot_1')).toBe('hot');
    expect(homeBlenderFireKind('HOME_PROP_fireplace_left_front_tongue_0')).toBe('flame');
    expect(homeBlenderFireKind('HOME_PROP_fireplace_right_ember_bed')).toBe('ember');
    expect(homeBlenderFireKind('HOME_PROP_chandelier_flame_3')).toBe('candle');
    expect(homeBlenderFireKind('HOME_PROP_fireplace_right_mantel_flame_1')).toBe('candle');
    expect(homeBlenderFireKind('HOME_PROP_table_candle_flame')).toBe('candle');
    expect(homeBlenderFireKind('HOME_PROP_torch_flame_2')).toBe('candle');
    expect(homeBlenderFireKind('HOME_PROP_fireplace_left_log_a')).toBeNull();
  });

  it('keeps every live flame motion restrained around the authored silhouette', () => {
    for (const kind of ['flame', 'hot', 'ember', 'candle']) {
      for (const timeMs of [0, 125, 500, 1400, 3200]) {
        const motion = homeBlenderFireMotion({ timeMs, phase: 1.234, kind });
        expect(motion.scaleX).toBeGreaterThan(0.94);
        expect(motion.scaleX).toBeLessThan(1.06);
        expect(motion.scaleY).toBeGreaterThan(0.88);
        expect(motion.scaleY).toBeLessThan(1.12);
        expect(motion.scaleZ).toBeGreaterThan(0.94);
        expect(motion.scaleZ).toBeLessThan(1.06);
        expect(motion.emission).toBeGreaterThan(0.84);
        expect(motion.emission).toBeLessThan(1.08);
        expect(motion.light).toBeGreaterThan(0.84);
        expect(motion.light).toBeLessThan(1.12);
      }
    }
  });
});
