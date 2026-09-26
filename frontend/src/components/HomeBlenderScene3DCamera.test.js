import { describe, expect, it } from 'vitest';
import {
  HOME_BLENDER_CAMERA_FOV,
  homeBlenderCameraFovForAspect,
  homeBlenderCameraPoseForAspect,
} from './HomeBlenderScene3D.jsx';

describe('HomeBlenderScene3D portrait framing', () => {
  it('pulls portrait phones back slightly without moving the canonical desktop camera', () => {
    const desktop = homeBlenderCameraPoseForAspect(16 / 9);
    const phone390 = homeBlenderCameraPoseForAspect(390 / 844);
    const phone430 = homeBlenderCameraPoseForAspect(430 / 932);

    expect(desktop.position.z).toBe(16);
    expect(phone390.position.z).toBeCloseTo(16.45, 5);
    expect(phone430.position.z).toBeCloseTo(16.45, 5);
    expect(phone390.target).toEqual(desktop.target);
  });

  it('preserves the authored lens on landscape and desktop aspects', () => {
    expect(homeBlenderCameraFovForAspect(16 / 9)).toBe(HOME_BLENDER_CAMERA_FOV);
    expect(homeBlenderCameraFovForAspect(1)).toBe(HOME_BLENDER_CAMERA_FOV);
  });

  it('keeps portrait Android framing contextual without exposing empty ceiling runway', () => {
    const portrait390 = homeBlenderCameraFovForAspect(390 / 844);
    const portrait430 = homeBlenderCameraFovForAspect(430 / 932);

    expect(portrait390).toBeGreaterThan(HOME_BLENDER_CAMERA_FOV);
    expect(portrait390).toBe(35.5);
    expect(portrait430).toBeGreaterThan(HOME_BLENDER_CAMERA_FOV);
    expect(portrait430).toBe(35.5);
  });

  it('blends gently near square layouts instead of jumping lenses', () => {
    const nearSquare = homeBlenderCameraFovForAspect(0.9);
    expect(nearSquare).toBe(HOME_BLENDER_CAMERA_FOV);
  });
});
