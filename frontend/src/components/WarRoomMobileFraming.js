export const WAR_ROOM_MOBILE_FRAMING_VERSION = 'mobile-v4-orientation-aware';

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
      // Landscape should cash in the extra horizontal room instead of keeping
      // the portrait composition. Keep the whole board/frame visible, but move
      // the camera materially closer so individual piece silhouettes gain real
      // screen pixels.
      halfSpan: 4.92,
      padding: 1.015,
      minDistance: 14.1,
      maxDistance: 18.6,
      targetY: 0.58,
      targetZ: 0.16,
      cameraY: 6.65,
      cameraZ: 11.75,
    });
  }

  if (!phonePortrait) return null;

  const phone = safeWidth <= 520;
  return Object.freeze({
    version: WAR_ROOM_MOBILE_FRAMING_VERSION,
    mode: 'portrait-room-balanced',
    // Portrait keeps enough room context to read as the War Room rather than a
    // floating board, but does not pretend it has landscape's horizontal space.
    halfSpan: phone ? 5.4 : 5.2,
    padding: phone ? 1.04 : 1.055,
    minDistance: phone ? 16.2 : 15.6,
    maxDistance: phone ? 22.4 : 22.0,
    targetY: phone ? 0.95 : 0.86,
    targetZ: phone ? 0.65 : 0.56,
    cameraY: phone ? 7.2 : 7.28,
    cameraZ: phone ? 11.4 : 11.25,
  });
}
