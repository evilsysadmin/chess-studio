export { PAWN_SLUG_ENEMY_LOADOUTS, pawnSlugEnemyLoadoutFor, pawnSlugEnemyWeaponFor } from './pawnSlugEnemyLoadouts.js';
export {
  PAWN_SLUG_ENEMY_FIRE_PROFILES,
  PAWN_SLUG_ENEMY_ROLE_PRESSURE,
  pawnSlugEnemyFireCooldown,
  pawnSlugEnemyFireProfile,
  pawnSlugEnemyShotPlan,
} from './pawnSlugEnemyFireDoctrine.js';
export { PAWN_SLUG_WANTED_META, pawnSlugWantedCreditBonus, pawnSlugWantedOfficerFor } from './pawnSlugWantedOfficers.js';
export {
  PAWN_SLUG_POWS,
  PAWN_SLUG_POW_META,
  pawnSlugCanRescuePow,
  pawnSlugPowById,
  pawnSlugPowMissionBonus,
  pawnSlugPowsForScenario,
  pawnSlugRescuePow,
} from './pawnSlugPows.js';
export {
  PAWN_SLUG_POW_ART_META,
  animatePawnSlugPowModel,
  createPawnSlugPowModel,
} from './pawnSlugPowArt.js';
export {
  pawnSlugApplyPowReward,
  pawnSlugPowRescueSummary,
  pawnSlugSpawnPowsAhead,
  pawnSlugUpdatePowRescues,
} from './pawnSlugPowRuntime.js';
export {
  PAWN_SLUG_DESTRUCTIBLE_ART_META,
  animatePawnSlugDestructibleModel,
  createPawnSlugDestructibleModel,
} from './pawnSlugDestructibleArt.js';
export {
  PAWN_SLUG_DESTRUCTIBLE_LAYOUT,
  PAWN_SLUG_DESTRUCTIBLE_LAYOUT_META,
  pawnSlugDestructibleById,
  pawnSlugDestructiblesAhead,
} from './pawnSlugDestructibleLayout.js';

export const PAWN_SLUG_RUNTIME_HOT_PATH = 'scalar-collision-index-loops-v1';

export function pawnSlugRectsOverlap(
  ax,
  ay,
  aw,
  ah,
  bx,
  by,
  bw,
  bh,
) {
  return ax < bx + bw
    && ax + aw > bx
    && ay < by + bh
    && ay + ah > by;
}

export function pawnSlugFirstHitEnemyIndex(
  enemies,
  bulletLeft,
  bulletTop,
  bulletWidth,
  bulletHeight,
) {
  for (let index = 0; index < enemies.length; index += 1) {
    const enemy = enemies[index];
    if (!enemy || enemy.dead) continue;
    if (pawnSlugRectsOverlap(
      bulletLeft,
      bulletTop,
      bulletWidth,
      bulletHeight,
      enemy.x - enemy.w / 2,
      enemy.y,
      enemy.w,
      enemy.h,
    )) return index;
  }
  return -1;
}
