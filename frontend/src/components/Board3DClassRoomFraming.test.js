import { describe, expect, it } from 'vitest';
import { classRoomCameraFramingProfile } from './Board3DScene.js';
import { resolveBoard3DCameraFov } from './Board3DConfig.js';

function rawDistance(profile, aspect, { mobile = false } = {}) {
  const verticalFov = resolveBoard3DCameraFov(aspect, { mobile }) * Math.PI / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  return (profile.halfSpan / Math.tan(limitingFov / 2)) * profile.padding;
}

describe('Class Room full-board camera framing', () => {
  it('keeps the teaching angle but opens desktop enough to show the complete board frame', () => {
    const profile = classRoomCameraFramingProfile({ aspect: 1.5, coarsePointer: false, viewportWidth: 1440 });
    expect(profile.version).toBe('classroom-overhead-v2');
    expect(profile.cameraY).toBe(10.6);
    expect(profile.cameraZ).toBe(8.15);
    expect(profile.halfSpan).toBeGreaterThanOrEqual(4.95);
    expect(rawDistance(profile, 1.5)).toBeLessThan(profile.maxDistance);
  });

  it('keeps a little more breathing room on phone without reverting to a wide-angle camera', () => {
    const profile = classRoomCameraFramingProfile({ aspect: 0.75, coarsePointer: true, viewportWidth: 390 });
    expect(profile.version).toBe('classroom-overhead-v2');
    expect(profile.cameraY).toBe(10.2);
    expect(profile.cameraZ).toBe(8.6);
    expect(profile.halfSpan).toBeGreaterThanOrEqual(5);
    expect(rawDistance(profile, 0.75, { mobile: true })).toBeLessThan(profile.maxDistance);
  });
});
