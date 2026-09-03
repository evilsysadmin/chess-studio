const FILES = 'abcdefgh';
const VERTICAL_FOV_RADIANS = 40 * Math.PI / 180;
const MATTHIAS_KING_TOP_Y = 1.56;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize([x, y, z]) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function dot([ax, ay, az], [bx, by, bz]) {
  return ax * bx + ay * by + az * bz;
}

function subtract([ax, ay, az], [bx, by, bz]) {
  return [ax - bx, ay - by, az - bz];
}

function addScaled([ax, ay, az], [bx, by, bz], scale) {
  return [ax + bx * scale, ay + by * scale, az + bz * scale];
}

function cross([ax, ay, az], [bx, by, bz]) {
  return [
    ay * bz - az * by,
    az * bx - ax * bz,
    ax * by - ay * bx,
  ];
}

function cameraFramingProfile({ aspect, coarsePointer, viewportWidth }) {
  const safeAspect = Math.max(0.35, Number(aspect) || 1);
  const safeWidth = Math.max(0, Number(viewportWidth) || 0);
  const mobilePortrait = Boolean(coarsePointer) && safeWidth <= 820 && safeAspect <= 1.15;

  if (mobilePortrait) {
    const phone = safeWidth <= 520;
    return {
      halfSpan: phone ? 4.88 : 5.02,
      padding: phone ? 1.035 : 1.05,
      minDistance: phone ? 12.7 : 13.0,
      maxDistance: phone ? 18.2 : 18.8,
      targetY: phone ? 0.58 : 0.66,
      targetZ: phone ? 0.48 : 0.4,
      cameraY: phone ? 6.85 : 7.05,
      cameraZ: phone ? 10.55 : 10.6,
    };
  }

  const wide = safeAspect >= 1.42;
  return wide
    ? {
        halfSpan: 5.38,
        padding: 1.07,
        minDistance: 13.2,
        maxDistance: 22.6,
        targetY: 1.08,
        targetZ: -0.16,
        cameraY: 7.35,
        cameraZ: 10.6,
      }
    : {
        halfSpan: 5.78,
        padding: 1.13,
        minDistance: 14.5,
        maxDistance: 25.6,
        targetY: 0.92,
        targetZ: -0.08,
        cameraY: 8.2,
        cameraZ: 10.72,
      };
}

export function findMatthiasKingSquare(fen, matthiasKingColor) {
  const target = matthiasKingColor === 'w' ? 'K' : matthiasKingColor === 'b' ? 'k' : null;
  if (!target) return null;

  const placement = String(fen || '').trim().split(/\s+/)[0] || '';
  const rows = placement.split('/');
  if (rows.length !== 8) return null;

  for (let rankIndex = 0; rankIndex < rows.length; rankIndex += 1) {
    let fileIndex = 0;
    for (const char of rows[rankIndex]) {
      if (/^[1-8]$/.test(char)) {
        fileIndex += Number(char);
        continue;
      }
      if (char === target && fileIndex >= 0 && fileIndex < 8) {
        return `${FILES[fileIndex]}${8 - rankIndex}`;
      }
      if (/^[prnbqkPRNBQK]$/.test(char)) fileIndex += 1;
    }
  }
  return null;
}

function squareWorldPoint(square) {
  const fileIndex = FILES.indexOf(square?.[0]);
  const rank = Number(square?.[1]);
  if (fileIndex < 0 || rank < 1 || rank > 8) return null;
  return [fileIndex - 3.5, MATTHIAS_KING_TOP_Y, 4.5 - rank];
}

/**
 * Project Matthias' king cap into the same fixed tactical camera used by
 * Board3D. This intentionally mirrors fitBoardCamera's framing constants so
 * the DOM speech tail follows the piece instead of a hard-coded screen point.
 */
export function projectMatthiasKingAnchor({
  fen,
  matthiasKingColor,
  orientation = 'white',
  width,
  height,
  coarsePointer = false,
  viewportWidth = width,
} = {}) {
  const safeWidth = Math.max(1, Number(width) || 0);
  const safeHeight = Math.max(1, Number(height) || 0);
  if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight)) return null;

  const square = findMatthiasKingSquare(fen, matthiasKingColor);
  const point = squareWorldPoint(square);
  if (!square || !point) return null;

  const aspect = Math.max(0.35, safeWidth / safeHeight);
  const profile = cameraFramingProfile({ aspect, coarsePointer, viewportWidth });
  const horizontalFov = 2 * Math.atan(Math.tan(VERTICAL_FOV_RADIANS / 2) * aspect);
  const limitingFov = Math.min(VERTICAL_FOV_RADIANS, horizontalFov);
  const distance = clamp(
    (profile.halfSpan / Math.tan(limitingFov / 2)) * profile.padding,
    profile.minDistance,
    profile.maxDistance,
  );

  const whiteSide = orientation !== 'black';
  const target = [0, profile.targetY, whiteSide ? -profile.targetZ : profile.targetZ];
  const cameraDirection = normalize([0, profile.cameraY, whiteSide ? profile.cameraZ : -profile.cameraZ]);
  const cameraPosition = addScaled(target, cameraDirection, distance);
  const forward = normalize(subtract(target, cameraPosition));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = normalize(cross(right, forward));
  const cameraToPoint = subtract(point, cameraPosition);
  const depth = dot(cameraToPoint, forward);
  if (depth <= 0.001) return null;

  const cameraX = dot(cameraToPoint, right);
  const cameraY = dot(cameraToPoint, up);
  const ndcX = cameraX / (depth * Math.tan(horizontalFov / 2));
  const ndcY = cameraY / (depth * Math.tan(VERTICAL_FOV_RADIANS / 2));

  return {
    square,
    left: (ndcX + 1) * 50,
    top: (1 - ndcY) * 50,
  };
}
