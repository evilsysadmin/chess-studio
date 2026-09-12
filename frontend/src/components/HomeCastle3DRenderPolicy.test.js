import { describe, expect, it } from 'vitest';
import {
  HOME_CASTLE_3D_LITE_MIN_WIDTH,
  HOME_CASTLE_3D_MOBILE_ENABLE_MIN_WIDTH,
  homeCastle3DRenderPolicy,
} from './HomeCastle3DRenderPolicy.js';

describe('HomeCastle3DRenderPolicy', () => {
  it('keeps 360px mobile on 2D during the first staged rollout', () => {
    const policy = homeCastle3DRenderPolicy({
      viewportWidth: 360,
      devicePixelRatio: 3,
      hardwareConcurrency: 8,
    });
    expect(policy).toMatchObject({ enabled: false, lod: 'lite', pixelRatio: 1.25 });
  });

  it('enables lite rendering from 390px on mobile hardware with more than four cores', () => {
    for (const viewportWidth of [HOME_CASTLE_3D_MOBILE_ENABLE_MIN_WIDTH, 430, 768]) {
      const policy = homeCastle3DRenderPolicy({
        viewportWidth,
        devicePixelRatio: 3,
        hardwareConcurrency: 8,
      });
      expect(policy).toMatchObject({
        enabled: true,
        lod: 'lite',
        pixelRatio: 1.25,
        antialias: false,
        powerPreference: 'low-power',
      });
      expect(policy.minFrameIntervalMs).toBeGreaterThan(33);
      expect(policy.minFrameIntervalMs).toBeLessThan(34);
    }
  });

  it('keeps constrained mobile hardware on the fallback even at eligible widths', () => {
    expect(homeCastle3DRenderPolicy({
      viewportWidth: 430,
      hardwareConcurrency: 4,
    }).enabled).toBe(false);
    expect(homeCastle3DRenderPolicy({
      viewportWidth: 430,
      hardwareConcurrency: 2,
    })).toMatchObject({ enabled: false, lod: '2d' });
  });

  it('keeps very narrow devices on the 2D tier', () => {
    expect(homeCastle3DRenderPolicy({
      viewportWidth: HOME_CASTLE_3D_LITE_MIN_WIDTH - 1,
      hardwareConcurrency: 8,
    })).toMatchObject({ enabled: false, lod: '2d' });
  });

  it('uses full LOD only on roomy desktops with more than four cores', () => {
    expect(homeCastle3DRenderPolicy({
      viewportWidth: 1600,
      devicePixelRatio: 3,
      hardwareConcurrency: 8,
    })).toMatchObject({
      enabled: true,
      lod: 'full',
      pixelRatio: 1.5,
      minFrameIntervalMs: 0,
      antialias: true,
      powerPreference: 'high-performance',
    });
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
      expect(policy).toMatchObject({
        enabled: true,
        lod: 'lite',
        pixelRatio: 1.25,
        antialias: false,
        powerPreference: 'low-power',
      });
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
