import { describe, expect, it } from 'vitest';
import { HOME_CASTLE_3D_MIN_WIDTH, homeCastle3DRenderPolicy } from './HomeCastle3DRenderPolicy.js';

describe('HomeCastle3DRenderPolicy', () => {
  it('keeps WebGL disabled below the desktop breakpoint', () => {
    expect(homeCastle3DRenderPolicy({ viewportWidth: HOME_CASTLE_3D_MIN_WIDTH - 1 }).enabled).toBe(false);
    expect(homeCastle3DRenderPolicy({ viewportWidth: HOME_CASTLE_3D_MIN_WIDTH }).enabled).toBe(true);
  });

  it('caps dense desktop rendering at 1.5 DPR', () => {
    expect(homeCastle3DRenderPolicy({
      viewportWidth: 1600,
      devicePixelRatio: 3,
      hardwareConcurrency: 8,
    }).pixelRatio).toBe(1.5);
  });

  it('uses the cheaper 1.25 DPR budget on narrower or low-core desktops', () => {
    expect(homeCastle3DRenderPolicy({
      viewportWidth: 1100,
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
    }).pixelRatio).toBe(1.25);
    expect(homeCastle3DRenderPolicy({
      viewportWidth: 1600,
      devicePixelRatio: 2,
      hardwareConcurrency: 4,
    }).pixelRatio).toBe(1.25);
  });

  it('never upscales a low-DPR display', () => {
    expect(homeCastle3DRenderPolicy({
      viewportWidth: 1600,
      devicePixelRatio: 1,
      hardwareConcurrency: 12,
    }).pixelRatio).toBe(1);
  });
});
