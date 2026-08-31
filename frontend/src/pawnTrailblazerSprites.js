import matthiasRun from './assets/pawnTrailblazer/matthias_run.webp';
import matthiasCapture from './assets/pawnTrailblazer/matthias_capture.webp';
import enemyPawn from './assets/pawnTrailblazer/enemy_pawn.webp';
import enemyDuelist from './assets/pawnTrailblazer/enemy_duelist.webp';
import enemyKnight from './assets/pawnTrailblazer/enemy_knight.webp';
import enemyBishop from './assets/pawnTrailblazer/enemy_bishop.webp';
import enemyRook from './assets/pawnTrailblazer/enemy_rook.webp';
import powerRook from './assets/pawnTrailblazer/power_rook.webp';
import powerBishop from './assets/pawnTrailblazer/power_bishop.webp';
import powerQueen from './assets/pawnTrailblazer/power_queen.webp';

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
