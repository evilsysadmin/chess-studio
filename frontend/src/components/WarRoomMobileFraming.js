export const WAR_ROOM_MOBILE_FRAMING_VERSION = 'mobile-v6-portrait-overhead';
export const WAR_ROOM_PLAY_PITCH = Object.freeze({ cameraY: 9.2, cameraZ: 9.55 });

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
      // Match the approved V1 wide-camera inclination exactly. fitBoardCamera
      // normalizes this direction vector, so mobile keeps its own distance/FOV
      // while gaining the same steeper, more selectable board pitch.
      cameraY: WAR_ROOM_PLAY_PITCH.cameraY,
      cameraZ: WAR_ROOM_PLAY_PITCH.cameraZ,
    });
  }

  if (!phonePortrait) return null;

  const phone = safeWidth <= 520;
  return Object.freeze({
    version: WAR_ROOM_MOBILE_FRAMING_VERSION,
    mode: 'portrait-board-first',
    // Portrait is the hardest play surface: the shell is intentionally tall,
    // so a low oblique camera wastes most of that height on empty room. Keep
    // the accepted board scale/distance, but convert the spare horizontal crop
    // into useful vertical board pixels with a much steeper play pitch. Looking
    // slightly below the board plane recentres the projected board inside the
    // tall canvas without changing raycast maths or the desktop/landscape views.
    halfSpan: phone ? 5.4 : 5.2,
    padding: phone ? 1.04 : 1.055,
    minDistance: phone ? 16.2 : 15.6,
    maxDistance: phone ? 22.4 : 22.0,
    targetY: phone ? -2.2 : -1.9,
    targetZ: phone ? 0.65 : 0.56,
    cameraY: phone ? 9.6 : 9.3,
    cameraZ: phone ? 3.2 : 3.4,
  });
}
