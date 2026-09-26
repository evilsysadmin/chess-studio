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

  it('keeps portrait Android framing contextual without exposing empty ceiling runway', () => {
    const portrait390 = homeBlenderCameraFovForAspect(390 / 844);
    const portrait430 = homeBlenderCameraFovForAspect(430 / 932);

    expect(portrait390).toBeGreaterThan(HOME_BLENDER_CAMERA_FOV);
    expect(portrait390).toBe(33);
    expect(portrait430).toBeGreaterThan(HOME_BLENDER_CAMERA_FOV);
    expect(portrait430).toBe(33);
  });

  it('blends gently near square layouts instead of jumping lenses', () => {
    const nearSquare = homeBlenderCameraFovForAspect(0.9);
    expect(nearSquare).toBe(HOME_BLENDER_CAMERA_FOV);
  });
});
