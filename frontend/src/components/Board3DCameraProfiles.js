export const WAR_ROOM_CANONICAL_CAMERA_VERSION = 'v4-play-camera-v1';
export const WAR_ROOM_CANONICAL_CAMERA_FOV = 22;
export const WAR_ROOM_CANONICAL_PLAY_PITCH = Object.freeze({ cameraY: 9.2, cameraZ: 9.55 });

export function canonicalWarRoomCameraFramingProfile({ aspect = 1 } = {}) {
  const safeAspect = Math.max(0.35, Number(aspect) || 1);
  const wide = safeAspect >= 1.42;
  const shared = {
    fov: WAR_ROOM_CANONICAL_CAMERA_FOV,
    cameraY: WAR_ROOM_CANONICAL_PLAY_PITCH.cameraY,
    cameraZ: WAR_ROOM_CANONICAL_PLAY_PITCH.cameraZ,
  };

  // War Room v4 is the optical canon for every playable castle room. Shells may
  // change, but camera angle and lens do not. Narrow viewports may move/scale the
  // framing so all 64 squares remain usable; that is a crop adaptation, not a
  // second camera language.
  return wide
    ? Object.freeze({
        ...shared,
        version: WAR_ROOM_CANONICAL_CAMERA_VERSION,
        mode: 'canonical-wide',
        halfSpan: 5.38,
        padding: 1.07,
        minDistance: 13.2,
        maxDistance: 88,
        targetY: 2.2,
        targetZ: -0.16,
      })
    : Object.freeze({
        ...shared,
        version: `${WAR_ROOM_CANONICAL_CAMERA_VERSION}-compact`,
        mode: 'canonical-compact',
        halfSpan: 5.78,
        padding: 1.13,
        minDistance: 14.5,
        maxDistance: 88,
        targetY: 0.92,
        targetZ: -0.08,
      });
}

// V4-only optical experiment. Keep the room's authored play target and long
// lens instead of importing School's low target, close crop and class-room FOV.
// Mobile retains the already accredited board-width fit and canonical pitch.
export const WAR_ROOM_V4_HYBRID_CAMERA_VERSION = 'warroom-v4-board-forward-v2-oculus';
export const WAR_ROOM_V4_HYBRID_PITCH = Object.freeze({ cameraY: 10.2, cameraZ: 9.2 });

export function v4WarRoomHybridCameraFramingProfile({ aspect = 1, mobileProfile = null } = {}) {
  if (mobileProfile) return mobileProfile;
  const base = canonicalWarRoomCameraFramingProfile({ aspect });
  const wide = base.mode === 'canonical-wide';
  return Object.freeze({
    ...base,
    version: wide ? WAR_ROOM_V4_HYBRID_CAMERA_VERSION : `${WAR_ROOM_V4_HYBRID_CAMERA_VERSION}-compact`,
    // Restore the oculus upper rim without pushing the front rank offscreen.
    // Desktop-only: +2.3% distance trades a little zoom for the lunar vista;
    // +0.23m target height returns vertical room. Mobile is unchanged.
    halfSpan: wide ? 5.34 : base.halfSpan,
    targetY: wide ? 1.98 : base.targetY,
    cameraY: WAR_ROOM_V4_HYBRID_PITCH.cameraY,
    cameraZ: WAR_ROOM_V4_HYBRID_PITCH.cameraZ,
  });
}

// Legacy/classic Board3D callers outside the playable War Room domain keep
// their historical framing. Actual War Room v1 now opts into cameraProfile
// "warroom" explicitly, so this compatibility profile no longer defines v1.
export function classicWarRoomCameraFramingProfile(aspect = 1) {
  const safeAspect = Math.max(0.35, Number(aspect) || 1);
  const wide = safeAspect >= 1.42;

  return wide
    ? Object.freeze({
        version: 'classic-overhead-v3',
        halfSpan: 5.28,
        padding: 1.04,
        minDistance: 13.2,
        maxDistance: 28,
        targetY: 1.25,
        targetZ: -0.1,
        cameraY: 9.34,
        cameraZ: 9.3,
      })
    : Object.freeze({
        version: 'classic-overhead-v3',
        halfSpan: 5.72,
        padding: 1.12,
        minDistance: 14.4,
        maxDistance: 30,
        targetY: 0.82,
        targetZ: -0.06,
        cameraY: 10.2,
        cameraZ: 10.35,
      });
}
