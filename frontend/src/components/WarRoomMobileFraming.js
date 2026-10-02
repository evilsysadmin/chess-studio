import {
  WAR_ROOM_CANONICAL_CAMERA_FOV,
  WAR_ROOM_CANONICAL_PLAY_PITCH,
} from './Board3DCameraProfiles.js';

export const WAR_ROOM_MOBILE_FRAMING_VERSION = 'mobile-v8-v4-camera-contract';
export const WAR_ROOM_PLAY_PITCH = WAR_ROOM_CANONICAL_PLAY_PITCH;

export const BOARD3D_LEGACY_MOBILE_FRAMING_VERSION = 'mobile-v7-portrait-fit-width';

export function getLegacyBoard3DMobileFramingProfile({
  aspect = 1,
  coarsePointer = false,
  viewportWidth = Number.POSITIVE_INFINITY,
} = {}) {
  const safeAspect = Math.max(0.35, Number(aspect) || 1);
  const safeWidth = Math.max(0, Number(viewportWidth) || 0);
  const coarse = Boolean(coarsePointer);
  const phonePortrait = coarse
    && safeWidth <= 820
    && (safeWidth <= 520 || safeAspect <= 1.18);
  const phoneLandscape = coarse
    && safeWidth <= 920
    && safeAspect >= 1.35;

  if (phoneLandscape) {
    return Object.freeze({
      version: BOARD3D_LEGACY_MOBILE_FRAMING_VERSION,
      mode: 'landscape-board-first',
      halfSpan: 4.45,
      padding: 1.0,
      minDistance: 13.2,
      maxDistance: 17.2,
      targetY: 0.38,
      targetZ: 0.06,
      cameraY: WAR_ROOM_PLAY_PITCH.cameraY,
      cameraZ: WAR_ROOM_PLAY_PITCH.cameraZ,
    });
  }

  if (!phonePortrait) return null;

  const phone = safeWidth <= 520;
  const tallness = Math.min(1, Math.max(0, (0.95 - safeAspect) / 0.35));
  const targetZ = 0.2 + 2.4 * tallness;
  return Object.freeze({
    version: BOARD3D_LEGACY_MOBILE_FRAMING_VERSION,
    mode: 'portrait-board-first',
    halfSpan: 4.5,
    padding: 1.0,
    minDistance: phone ? 16.2 : 15.6,
    maxDistance: 60,
    targetY: -0.6,
    targetZ: Number(targetZ.toFixed(3)),
    cameraY: phone ? 9.6 : 9.3,
    cameraZ: phone ? 3.2 : 3.4,
  });
}

export function getWarRoomMobileFramingProfile({
  aspect = 1,
  coarsePointer = false,
  viewportWidth = Number.POSITIVE_INFINITY,
} = {}) {
  const safeAspect = Math.max(0.35, Number(aspect) || 1);
  const safeWidth = Math.max(0, Number(viewportWidth) || 0);
  const coarse = Boolean(coarsePointer);
  const phonePortrait = coarse
    && safeWidth <= 820
    && (safeWidth <= 520 || safeAspect <= 1.18);
  const phoneLandscape = coarse
    && safeWidth <= 920
    && safeAspect >= 1.35;

  if (phoneLandscape) {
    return Object.freeze({
      version: WAR_ROOM_MOBILE_FRAMING_VERSION,
      mode: 'landscape-board-first',
      fov: WAR_ROOM_CANONICAL_CAMERA_FOV,
      // Same v4 lens and play pitch as desktop. Only the fitted distance/target
      // change so a short phone viewport spends pixels on the board, not walls.
      halfSpan: 4.45,
      padding: 1.0,
      minDistance: 20.5,
      maxDistance: 28,
      targetY: 0.38,
      targetZ: 0.06,
      cameraY: WAR_ROOM_PLAY_PITCH.cameraY,
      cameraZ: WAR_ROOM_PLAY_PITCH.cameraZ,
    });
  }

  if (!phonePortrait) return null;

  const phone = safeWidth <= 520;
  const tallness = Math.min(1, Math.max(0, (0.95 - safeAspect) / 0.35));
  const targetZ = 0.2 + 2.4 * tallness;
  return Object.freeze({
    version: WAR_ROOM_MOBILE_FRAMING_VERSION,
    mode: 'portrait-board-first',
    fov: WAR_ROOM_CANONICAL_CAMERA_FOV,
    // Portrait is still the same camera contract. The long distance is expected:
    // the narrow horizontal FOV must fit all files without changing perspective.
    // 4.72 leaves a small safety gutter for the oblique v4 pitch: the board
    // still fills >88% of phone width while corners remain inside every known
    // portrait/training canvas instead of clipping by 2–4%.
    halfSpan: 4.72,
    padding: 1.0,
    minDistance: phone ? 16.2 : 15.6,
    maxDistance: 60,
    targetY: -0.6,
    targetZ: Number(targetZ.toFixed(3)),
    cameraY: WAR_ROOM_PLAY_PITCH.cameraY,
    cameraZ: WAR_ROOM_PLAY_PITCH.cameraZ,
  });
}
