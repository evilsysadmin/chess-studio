import enemyCanonicalPart1 from './assets/pawnSlug/enemy_canonical_v4_part1.b64?raw';
import enemyCanonicalPart2 from './assets/pawnSlug/enemy_canonical_v4_part2.b64?raw';
import enemyCanonicalPart3 from './assets/pawnSlug/enemy_canonical_v4_part3.b64?raw';

const TYPES = Object.freeze(['pawn', 'knight', 'rook']);
const COLUMNS = 3;
const ROWS = 1;
const FRAME_BY_TYPE = Object.freeze({ pawn: 0, knight: 1, rook: 2 });

export const PAWN_SLUG_PREMIUM_ENEMY_RASTER_URL = `data:image/webp;base64,${[
  enemyCanonicalPart1,
  enemyCanonicalPart2,
  enemyCanonicalPart3,
].map((part) => part.trim()).join('')}`;

export function pawnSlugPremiumEnemyRasterWindow(type = 'pawn', action = 'idle', frameIndex = 0, dir = 1) {
  const safeType = TYPES.includes(type) ? type : 'pawn';
  const frame = FRAME_BY_TYPE[safeType];
  const direction = Number(dir) < 0 ? -1 : 1;
  const mirrored = direction > 0;
  return Object.freeze({
    type: safeType,
    action,
    sourceAction: 'idle',
    requestedFrame: Math.floor(Number(frameIndex) || 0),
    row: 0,
    frame,
    direction,
    mirrored,
    repeatX: (mirrored ? -1 : 1) / COLUMNS,
    repeatY: 1,
    offsetX: (mirrored ? frame + 1 : frame) / COLUMNS,
    offsetY: 0,
  });
}

export const PAWN_SLUG_PREMIUM_ENEMY_RASTER_META = Object.freeze({
  version: 'v4-authored-canonical-static',
  format: 'webp-rgba-authored-premium',
  width: 480,
  height: 160,
  frameWidth: 160,
  frameHeight: 160,
  columns: COLUMNS,
  rows: ROWS,
  sourceFacing: 'left',
  runtimeFacings: Object.freeze(['left', 'right']),
  types: TYPES,
  authoredActions: Object.freeze(['idle']),
  poseFallback: 'canonical-static-plus-runtime-pose',
  frameByType: FRAME_BY_TYPE,
  canonicalSource: 'Pawn Slug: authored premium enemy lineup v4',
  isolatedSilhouettes: true,
  transparentBackground: true,
  proceduralFallbackOnly: true,
});