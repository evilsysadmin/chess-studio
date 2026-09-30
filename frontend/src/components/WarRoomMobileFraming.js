export const WAR_ROOM_MOBILE_FRAMING_VERSION = 'mobile-v7-portrait-fit-width';
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
  // En canvas altos (War Room inmersiva, aspect ~0.45) bajamos el tablero para
  // dejar arriba la sala de Matthias; en canvas casi cuadrados (entrenamiento,
  // aspect ~1) ese desplazamiento sacaba las filas 1-2 del canvas: centramos.
  const tallness = Math.min(1, Math.max(0, (0.95 - safeAspect) / 0.35));
  const targetZ = 0.2 + 2.4 * tallness;
  return Object.freeze({
    version: WAR_ROOM_MOBILE_FRAMING_VERSION,
    mode: 'portrait-board-first',
    // Código Rojo GP-2 (#34): en vertical el tablero RENDERIZADO ocupa el
    // 88–100 % del ancho con las 64 casillas en pantalla (medido con la cámara
    // real, Board3DProjectionDiagnostics). En un canvas alto el campo horizontal
    // es estrecho, así que el ajuste lo limita el ancho: halfSpan 4.5 cubre las
    // casillas (±4) y un poco del marco, y maxDistance NO puede topar la
    // distancia (con 22.4 la v6 hacía zoom y cortaba las columnas a y h).
    // El picado es casi cenital; en canvas altos targetZ baja el tablero para
    // que la franja superior la ocupe la sala de Matthias (y su bocadillo) y no
    // quede vacío negro bajo el tablero (ver `tallness`).
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
