import matthiasRun from './assets/pawnTrailblazer/matthias_run.webp';
import matthiasCapture from './assets/pawnTrailblazer/matthias_capture.webp';
import matthiasRun0 from './assets/pawnTrailblazer/matthias_run_0.webp';
import matthiasRun1 from './assets/pawnTrailblazer/matthias_run_1.webp';
import matthiasRun2 from './assets/pawnTrailblazer/matthias_run_2.webp';
import matthiasRun3 from './assets/pawnTrailblazer/matthias_run_3.webp';
import matthiasRun4 from './assets/pawnTrailblazer/matthias_run_4.webp';
import matthiasRun5 from './assets/pawnTrailblazer/matthias_run_5.webp';
import enemyPawn from './assets/pawnTrailblazer/enemy_pawn.webp';
import enemyDuelist from './assets/pawnTrailblazer/enemy_duelist.webp';
import enemyKnight from './assets/pawnTrailblazer/enemy_knight.webp';
import enemyBishop from './assets/pawnTrailblazer/enemy_bishop.webp';
import enemyRook from './assets/pawnTrailblazer/enemy_rook.webp';
import powerRook from './assets/pawnTrailblazer/power_rook.webp';
import powerBishop from './assets/pawnTrailblazer/power_bishop.webp';
import powerQueen from './assets/pawnTrailblazer/power_queen.webp';

export const TRAIL_MATTHIAS_RUN_FRAMES = Object.freeze([
  matthiasRun0,
  matthiasRun1,
  matthiasRun2,
  matthiasRun3,
  matthiasRun4,
  matthiasRun5,
]);

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
