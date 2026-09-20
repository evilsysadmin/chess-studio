import { describe, expect, it } from 'vitest';
import {
  HOME_BLENDER_CAMERA_FOV,
  homeBlenderCameraFovForAspect,
} from './HomeBlenderScene3D.jsx';

describe('HomeBlenderScene3D portrait framing', () => {
  it('preserves the authored lens on landscape and desktop aspects', () => {
    expect(homeBlenderCameraFovForAspect(16 / 9)).toBe(HOME_BLENDER_CAMERA_FOV);
    expect(homeBlenderCameraFovForAspect(1)).toBe(HOME_BLENDER_CAMERA_FOV);
  });

  it('widens portrait Android framing without exceeding the mobile cap', () => {
    const portrait390 = homeBlenderCameraFovForAspect(390 / 844);
    const portrait430 = homeBlenderCameraFovForAspect(430 / 932);

    expect(portrait390).toBeGreaterThan(37);
    expect(portrait390).toBeLessThanOrEqual(42);
    expect(portrait430).toBeGreaterThan(37);
    expect(portrait430).toBeLessThanOrEqual(42);
  });

  it('blends gently near square layouts instead of jumping lenses', () => {
    const nearSquare = homeBlenderCameraFovForAspect(0.9);
    expect(nearSquare).toBe(HOME_BLENDER_CAMERA_FOV);
  });
});
