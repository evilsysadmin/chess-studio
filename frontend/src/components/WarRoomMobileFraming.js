export const WAR_ROOM_MOBILE_FRAMING_VERSION = 'mobile-portrait-v3-room-balanced';

export function getWarRoomMobileFramingProfile({
  aspect = 1,
  coarsePointer = false,
  viewportWidth = Number.POSITIVE_INFINITY,
} = {}) {
  const safeAspect = Math.max(0.35, Number(aspect) || 1);
  const safeWidth = Math.max(0, Number(viewportWidth) || 0);
  const phone = safeWidth <= 520;
  // The CSS viewport is the trustworthy mobile signal. The shell itself is
  // intentionally a little landscape-shaped so the board does not consume the
  // entire first screen in portrait; phones must still keep the mobile camera.
  const mobilePortrait = Boolean(coarsePointer)
    && safeWidth <= 820
    && (phone || safeAspect <= 1.18);
  if (!mobilePortrait) return null;

  return Object.freeze({
    version: WAR_ROOM_MOBILE_FRAMING_VERSION,
    // v2 intentionally zoomed hard into the board. That made the near pieces
    // dominate and reduced the actual War Room to a thin decorative strip.
    // v3 opens the composition again while the longer mobile lens compresses
    // near/far scale. The board stays comfortably tappable but no longer owns
    // nearly the full portrait height.
    halfSpan: phone ? 5.4 : 5.2,
    padding: phone ? 1.04 : 1.055,
    minDistance: phone ? 16.2 : 15.6,
    maxDistance: phone ? 22.4 : 22.0,
    targetY: phone ? 0.95 : 0.86,
    // Aim slightly deeper into the room so the board settles lower in frame and
    // the fireplace/Hans/desk band remains visibly part of the play space.
    targetZ: phone ? 0.65 : 0.56,
    cameraY: phone ? 7.2 : 7.28,
    cameraZ: phone ? 11.4 : 11.25,
  });
}
