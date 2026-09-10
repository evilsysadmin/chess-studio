import { PAWN_SLUG_SPRITE_META as LEGACY_SPRITE_META } from './pawnSlugSpritesLegacy.js';
import {
  PAWN_SLUG_ENEMY_RUN_META,
  animateSlugEnemySprite,
  createSlugEnemySprite,
  pawnSlugEnemyRunAtlasWindow,
} from './pawnSlugEnemyRunSprites.js';

export * from './pawnSlugSpritesLegacy.js';
export {
  PAWN_SLUG_ENEMY_RUN_META,
  animateSlugEnemySprite,
  createSlugEnemySprite,
  pawnSlugEnemyRunAtlasWindow,
};

export const PAWN_SLUG_SPRITE_META = Object.freeze({
  ...LEGACY_SPRITE_META,
  enemies: Object.freeze({
    ...LEGACY_SPRITE_META.enemies,
    runAtlas: PAWN_SLUG_ENEMY_RUN_META,
  }),
});
