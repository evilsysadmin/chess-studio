export const WAR_ROOM_MOBILE_FRAMING_VERSION = 'mobile-portrait-v1';

export function getWarRoomMobileFramingProfile({
  aspect = 1,
  coarsePointer = false,
  viewportWidth = Number.POSITIVE_INFINITY,
} = {}) {
  const safeAspect = Math.max(0.35, Number(aspect) || 1);
  const safeWidth = Math.max(0, Number(viewportWidth) || 0);
  const mobilePortrait = Boolean(coarsePointer) && safeWidth <= 820 && safeAspect <= 1.15;
  if (!mobilePortrait) return null;

  const phone = safeWidth <= 520;
  return Object.freeze({
    version: WAR_ROOM_MOBILE_FRAMING_VERSION,
    // Portrait should spend the scarce viewport on the board, not on the
    // near-side floor. The tighter span is deliberately isolated from desktop.
    halfSpan: phone ? 4.88 : 5.02,
    padding: phone ? 1.035 : 1.05,
    minDistance: phone ? 12.7 : 13.0,
    maxDistance: phone ? 18.2 : 18.8,
    targetY: phone ? 0.58 : 0.66,
    // Positive targetZ means "slightly toward the far rank" after the
    // orientation mirror in fitBoardCamera. That moves the board down inside
    // the portrait frame and removes the old black moat near the player.
    targetZ: phone ? 0.48 : 0.4,
    cameraY: phone ? 6.85 : 7.05,
    cameraZ: phone ? 10.55 : 10.6,
  });
}
