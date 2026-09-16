import { r2AssetUrl } from './r2Assets.js';

const TYPES = Object.freeze(['pawn', 'knight', 'rook']);
const COLUMNS = 8;
const ROWS = 3;
const FRAMES_PER_TYPE = 8;
const FRAME_SIZE = 80;
const ROW_BY_TYPE = Object.freeze({ pawn: 0, knight: 1, rook: 2 });
const EMPTY_RASTER_FALLBACK = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"%3E%3C/svg%3E';

function wrapFrame(frame, count = FRAMES_PER_TYPE) {
  return ((Math.floor(Number(frame) || 0) % count) + count) % count;
}

export const PAWN_SLUG_PREMIUM_ENEMY_RASTER_LOGICAL_ID = 'pawnSlug.enemy.premiumRaster';
export const PAWN_SLUG_PREMIUM_ENEMY_RASTER_URL = r2AssetUrl(
  PAWN_SLUG_PREMIUM_ENEMY_RASTER_LOGICAL_ID,
  EMPTY_RASTER_FALLBACK,
);

export function pawnSlugPremiumEnemyRasterWindow(type = 'pawn', action = 'idle', frameIndex = 0, dir = 1) {
  const safeType = TYPES.includes(type) ? type : 'pawn';
  const sourceAction = action === 'run' ? 'run' : 'idle';
  const frame = sourceAction === 'run' ? wrapFrame(frameIndex) : 0;
  const row = ROW_BY_TYPE[safeType];
  const direction = Number(dir) < 0 ? -1 : 1;
  const mirrored = direction > 0;
  return Object.freeze({
    type: safeType,
    action,
    sourceAction,
    requestedFrame: Math.floor(Number(frameIndex) || 0),
    row,
    frame,
    direction,
    mirrored,
    repeatX: (mirrored ? -1 : 1) / COLUMNS,
    repeatY: 1 / ROWS,
    offsetX: (mirrored ? frame + 1 : frame) / COLUMNS,
    offsetY: 1 - ((row + 1) / ROWS),
  });
}

export const PAWN_SLUG_PREMIUM_ENEMY_RASTER_META = Object.freeze({
  version: 'v5-authored-canonical-run',
  format: 'webp-rgba-authored-premium-r2',
  width: FRAME_SIZE * COLUMNS,
  height: FRAME_SIZE * ROWS,
  frameWidth: FRAME_SIZE,
  frameHeight: FRAME_SIZE,
  columns: COLUMNS,
  rows: ROWS,
  framesPerType: FRAMES_PER_TYPE,
  sourceFacing: 'left',
  runtimeFacings: Object.freeze(['left', 'right']),
  types: TYPES,
  authoredActions: Object.freeze(['idle', 'run']),
  poseFallback: 'authored-run-plus-runtime-pose',
  rowByType: ROW_BY_TYPE,
  canonicalSource: 'Pawn Slug: authored premium enemy lineup v5',
  derivedFrom: 'v4-authored-canonical-static',
  isolatedSilhouettes: true,
  transparentBackground: true,
  proceduralFallbackOnly: true,
  logicalId: PAWN_SLUG_PREMIUM_ENEMY_RASTER_LOGICAL_ID,
  transport: 'r2-cdn-primary',
  transportFallback: 'separate-premium-static-raster',
  transportReason: 'content-addressed-cdn-primary-without-bundled-raster-payload',
});
