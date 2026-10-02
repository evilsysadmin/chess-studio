import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_CANONICAL_CAMERA_FOV,
  WAR_ROOM_CANONICAL_CAMERA_VERSION,
  WAR_ROOM_CANONICAL_PLAY_PITCH,
  canonicalWarRoomCameraFramingProfile,
  classicWarRoomCameraFramingProfile,
} from './Board3DCameraProfiles.js';

describe('canonical War Room play camera', () => {
  it('locks the War Room v4 wide desktop optical contract', () => {
    const profile = canonicalWarRoomCameraFramingProfile({ aspect: 16 / 9 });

    expect(profile.version).toBe(WAR_ROOM_CANONICAL_CAMERA_VERSION);
    expect(profile.fov).toBe(22);
    expect(profile.fov).toBe(WAR_ROOM_CANONICAL_CAMERA_FOV);
    expect(profile.cameraY).toBe(9.2);
    expect(profile.cameraZ).toBe(9.55);
    expect(profile.cameraY).toBe(WAR_ROOM_CANONICAL_PLAY_PITCH.cameraY);
    expect(profile.cameraZ).toBe(WAR_ROOM_CANONICAL_PLAY_PITCH.cameraZ);
    expect(profile.halfSpan).toBe(5.38);
    expect(profile.padding).toBe(1.07);
    expect(profile.targetY).toBe(2.2);
    expect(profile.targetZ).toBe(-0.16);
  });

  it('keeps lens and pitch fixed when compact framing adapts', () => {
    const wide = canonicalWarRoomCameraFramingProfile({ aspect: 16 / 9 });
    const compact = canonicalWarRoomCameraFramingProfile({ aspect: 1.2 });

    expect(compact.mode).toBe('canonical-compact');
    expect(compact.fov).toBe(wide.fov);
    expect(compact.cameraY).toBe(wide.cameraY);
    expect(compact.cameraZ).toBe(wide.cameraZ);
    expect(compact.halfSpan).not.toBe(wide.halfSpan);
    expect(compact.targetY).not.toBe(wide.targetY);
  });

  it('makes legacy V1 callers consume the same canonical profile', () => {
    expect(classicWarRoomCameraFramingProfile(16 / 9))
      .toEqual(canonicalWarRoomCameraFramingProfile({ aspect: 16 / 9 }));
  });
});
