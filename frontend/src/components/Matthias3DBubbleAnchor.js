import { resolveBoard3DCameraFov } from './Board3DConfig.js';
import { classicWarRoomCameraFramingProfile } from './Board3DCameraProfiles.js';
import { getCameraFramingProfile } from './Board3DSurfaces.js';
import { getWarRoomMobileFramingProfile } from './WarRoomMobileFraming.js';

const FILES = 'abcdefgh';
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

function cameraFramingProfile({ aspect, coarsePointer, viewportWidth, variant }) {
  const mobileProfile = getWarRoomMobileFramingProfile({ aspect, coarsePointer, viewportWidth });
  if (mobileProfile) return { profile: mobileProfile, mobile: true };
  const classic = String(variant || '').startsWith('classic');
  return {
    profile: classic ? classicWarRoomCameraFramingProfile(aspect) : getCameraFramingProfile(aspect),
    mobile: false,
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
  variant = null,
} = {}) {
  const safeWidth = Math.max(1, Number(width) || 0);
  const safeHeight = Math.max(1, Number(height) || 0);
  if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight)) return null;

  const square = findMatthiasKingSquare(fen, matthiasKingColor);
  const point = squareWorldPoint(square);
  if (!square || !point) return null;

  const aspect = Math.max(0.35, safeWidth / safeHeight);
  const { profile, mobile } = cameraFramingProfile({ aspect, coarsePointer, viewportWidth, variant });
  const verticalFov = resolveBoard3DCameraFov(aspect, { mobile }) * Math.PI / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
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
  const ndcY = cameraY / (depth * Math.tan(verticalFov / 2));

  return {
    square,
    left: (ndcX + 1) * 50,
    top: (1 - ndcY) * 50,
  };
}
