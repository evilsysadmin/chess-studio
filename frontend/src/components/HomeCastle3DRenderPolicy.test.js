import { describe, expect, it } from 'vitest';
import {
  HOME_CASTLE_3D_LITE_MIN_WIDTH,
  HOME_CASTLE_3D_MIN_WIDTH,
  homeCastle3DRenderPolicy,
} from './HomeCastle3DRenderPolicy.js';

describe('HomeCastle3DRenderPolicy', () => {
  it('keeps WebGL disabled below the desktop breakpoint', () => {
    expect(homeCastle3DRenderPolicy({ viewportWidth: HOME_CASTLE_3D_MIN_WIDTH - 1 }).enabled).toBe(false);
    expect(homeCastle3DRenderPolicy({ viewportWidth: HOME_CASTLE_3D_MIN_WIDTH }).enabled).toBe(true);
  });

  it('classifies common mobile widths as lite candidates without enabling WebGL yet', () => {
    for (const viewportWidth of [360, 390, 430, 768]) {
      const policy = homeCastle3DRenderPolicy({
        viewportWidth,
        devicePixelRatio: 3,
        hardwareConcurrency: 8,
      });
      expect(policy.enabled).toBe(false);
      expect(policy.lod).toBe('lite');
      expect(policy.pixelRatio).toBe(1.25);
      expect(policy.minFrameIntervalMs).toBeGreaterThan(33);
      expect(policy.minFrameIntervalMs).toBeLessThan(34);
    }
  });

  it('keeps very narrow or severely constrained devices on the 2D tier', () => {
    expect(homeCastle3DRenderPolicy({
      viewportWidth: HOME_CASTLE_3D_LITE_MIN_WIDTH - 1,
      hardwareConcurrency: 8,
    }).lod).toBe('2d');
    expect(homeCastle3DRenderPolicy({
      viewportWidth: 430,
      hardwareConcurrency: 2,
    }).lod).toBe('2d');
  });

  it('uses full LOD only on roomy desktops with more than four cores', () => {
    expect(homeCastle3DRenderPolicy({
      viewportWidth: 1600,
      devicePixelRatio: 3,
      hardwareConcurrency: 8,
    })).toMatchObject({ enabled: true, lod: 'full', pixelRatio: 1.5, minFrameIntervalMs: 0 });
  });

  it('uses lite LOD, lower DPR and a 30fps frame budget on narrower or low-core desktops', () => {
    const narrow = homeCastle3DRenderPolicy({
      viewportWidth: 1100,
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
    });
    const lowCore = homeCastle3DRenderPolicy({
      viewportWidth: 1600,
      devicePixelRatio: 2,
      hardwareConcurrency: 4,
    });
    for (const policy of [narrow, lowCore]) {
      expect(policy).toMatchObject({ enabled: true, lod: 'lite', pixelRatio: 1.25 });
      expect(policy.minFrameIntervalMs).toBeGreaterThan(33);
      expect(policy.minFrameIntervalMs).toBeLessThan(34);
    }
  });

  it('never upscales a low-DPR display', () => {
    expect(homeCastle3DRenderPolicy({
      viewportWidth: 1600,
      devicePixelRatio: 1,
      hardwareConcurrency: 12,
    }).pixelRatio).toBe(1);
  });
});
