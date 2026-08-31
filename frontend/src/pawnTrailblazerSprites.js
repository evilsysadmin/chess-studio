import matthiasRun from './assets/pawnTrailblazer/matthias_run.webp';
import matthiasCapture from './assets/pawnTrailblazer/matthias_capture.webp';
import enemyPawn from './pieces-regimiento/bP.png';
import enemyDuelist from './pieces-regimiento/bP.png';
import enemyKnight from './pieces-regimiento/bN.png';
import enemyBishop from './pieces-regimiento/bB.png';
import enemyRook from './pieces-regimiento/bR.png';
import powerRook from './pieces-regimiento/wR.png';
import powerBishop from './pieces-regimiento/wB.png';
import powerQueen from './pieces-regimiento/wQ.png';

export const TRAIL_SPRITES = Object.freeze({
  matthiasRun,
  matthiasCapture,
  enemyPawn,
  enemyDuelist,
  enemyKnight,
  enemyBishop,
  enemyRook,
  powerRook,
  powerBishop,
  powerQueen,
});

export function trailSprite(name) {
  return TRAIL_SPRITES[name] || null;
}
