import enemyPremiumPart1 from './assets/pawnSlug/enemy_premium_idle_run_v3_part1.b64?raw';
import enemyPremiumPart2 from './assets/pawnSlug/enemy_premium_idle_run_v3_part2.b64?raw';
import enemyPremiumPart3 from './assets/pawnSlug/enemy_premium_idle_run_v3_part3.b64?raw';
import enemyPremiumPart4 from './assets/pawnSlug/enemy_premium_idle_run_v3_part4.b64?raw';
import enemyPremiumPart5 from './assets/pawnSlug/enemy_premium_idle_run_v3_part5.b64?raw';
import enemyPremiumPart6 from './assets/pawnSlug/enemy_premium_idle_run_v3_part6.b64?raw';

const TYPES = Object.freeze(['pawn', 'knight', 'rook']);
const COLUMNS = 16;
const ROWS = 6;
const ROW_BY_TYPE_ACTION = Object.freeze({
  pawn: Object.freeze({ idle: 0, run: 1 }),
  knight: Object.freeze({ idle: 2, run: 3 }),
  rook: Object.freeze({ idle: 4, run: 5 }),
});

export const PAWN_SLUG_PREMIUM_ENEMY_RASTER_URL = `data:image/png;base64,${[
  enemyPremiumPart1,
  enemyPremiumPart2,
  enemyPremiumPart3,
  enemyPremiumPart4,
  enemyPremiumPart5,
  enemyPremiumPart6,
].map((part) => part.trim()).join('')}`;

function wrapFrame(frame, count = COLUMNS) {
  return ((Math.floor(Number(frame) || 0) % count) + count) % count;
}

export function pawnSlugPremiumEnemyRasterWindow(type = 'pawn', action = 'idle', frameIndex = 0, dir = 1) {
  const safeType = TYPES.includes(type) ? type : 'pawn';
  const sourceAction = action === 'run' ? 'run' : 'idle';
  const row = ROW_BY_TYPE_ACTION[safeType][sourceAction];
  const frame = wrapFrame(frameIndex);
  const direction = Number(dir) < 0 ? -1 : 1;
  const mirrored = direction > 0;
  return Object.freeze({
    type: safeType,
    action,
    sourceAction,
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
  version: 'v3-canonical-raster',
  format: 'png-indexed-128-premium',
  width: 1280,
  height: 480,
  frameWidth: 80,
  frameHeight: 80,
  columns: COLUMNS,
  rows: ROWS,
  sourceFacing: 'left',
  runtimeFacings: Object.freeze(['left', 'right']),
  types: TYPES,
  authoredActions: Object.freeze(['idle', 'run']),
  poseFallback: 'premium-idle-row-plus-runtime-pose',
  rowByTypeAction: ROW_BY_TYPE_ACTION,
  canonicalSource: 'Pawn Slug: Enemy Sprite Sheet',
  isolatedSilhouettes: true,
  transparentBackground: true,
  proceduralFallbackOnly: true,
});
