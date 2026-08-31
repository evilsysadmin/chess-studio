import trailArtAtlas from './assets/pawnTrailblazer/pawn_chess_atlas.webp';

export const TRAIL_ATLAS_IMAGE = trailArtAtlas;
export const TRAIL_ATLAS_GRID = 4;

export const TRAIL_ATLAS_CELLS = Object.freeze({
  matthiasRun: { col: 0, row: 0 },
  matthiasCapture: { col: 1, row: 0 },
  matthiasHit: { col: 2, row: 0 },
  matthiasVictory: { col: 3, row: 0 },
  enemyPawn: { col: 0, row: 1 },
  enemyDuelist: { col: 1, row: 1 },
  enemyKnight: { col: 2, row: 1 },
  enemyBishop: { col: 3, row: 1 },
  enemyRook: { col: 0, row: 2 },
  powerRook: { col: 1, row: 2 },
  powerBishop: { col: 2, row: 2 },
  powerQueen: { col: 3, row: 2 },
  obstacleWall: { col: 0, row: 3 },
  obstacleSpikes: { col: 1, row: 3 },
  obstacleRock: { col: 2, row: 3 },
  obstacleBarrel: { col: 3, row: 3 },
});

export const TRAIL_SPRITES = Object.freeze(
  Object.fromEntries(Object.keys(TRAIL_ATLAS_CELLS).map((name) => [name, name])),
);

export function trailSprite(name) {
  return TRAIL_ATLAS_CELLS[name] ? name : null;
}

export function trailSpriteStyle(name) {
  const cell = TRAIL_ATLAS_CELLS[name];
  if (!cell) return null;
  const denominator = Math.max(1, TRAIL_ATLAS_GRID - 1);
  return {
    backgroundImage: `url(${TRAIL_ATLAS_IMAGE})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${TRAIL_ATLAS_GRID * 100}% ${TRAIL_ATLAS_GRID * 100}%`,
    backgroundPosition: `${(cell.col / denominator) * 100}% ${(cell.row / denominator) * 100}%`,
  };
}
