export const WAR_ROOM_MOBILE_FRAMING_VERSION = 'mobile-v5-landscape-overhead';

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
      // Mobile landscape is a play surface first. The previous v4 framing used
      // the extra width, but the camera remained low enough that the front rank
      // still masked the silhouettes behind it. v5 moves materially upward and
      // closer: fewer side walls/chairs, more board pixels, and better visual
      // separation between ranks without changing desktop or portrait framing.
      halfSpan: 4.45,
      padding: 1.0,
      minDistance: 13.2,
      maxDistance: 17.2,
      targetY: 0.38,
      targetZ: 0.06,
      cameraY: 8.4,
      cameraZ: 9.8,
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
