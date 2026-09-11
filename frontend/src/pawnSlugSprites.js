import {
  PAWN_SLUG_SPRITE_META as LEGACY_SPRITE_META,
  animateMatthiasSlugSprite as animateLegacyMatthiasSlugSprite,
  animatePanzerRookSprite as animateLegacyPanzerRookSprite,
} from './pawnSlugSpritesLegacy.js';
import {
  PAWN_SLUG_ENEMY_RUN_META,
  animateSlugEnemySprite,
  createSlugEnemySprite,
  pawnSlugEnemyRunAtlasWindow,
} from './pawnSlugEnemyRunSprites.js';
import { pawnSlugPanzerRookEntryPose } from './pawnSlugBossEntryMotion.js';
import { applyPawnSlugMatthiasPremiumMotion } from './pawnSlugMatthiasPremiumMotion.js';
import { playPawnSlugPlayerHitSfx } from './pawnSlugSfx.js';

export * from './pawnSlugSpritesLegacy.js';
export {
  PAWN_SLUG_ENEMY_RUN_META,
  animateSlugEnemySprite,
  createSlugEnemySprite,
  pawnSlugEnemyRunAtlasWindow,
};

export function animateMatthiasSlugSprite(sprite, state = {}) {
  const hurt = Boolean(state.hurt);
  if (hurt && !sprite.userData.pawnSlugWasHurt) playPawnSlugPlayerHitSfx();
  sprite.userData.pawnSlugWasHurt = hurt;
  animateLegacyMatthiasSlugSprite(sprite, state);
  applyPawnSlugMatthiasPremiumMotion(sprite, state);
}

export function animatePanzerRookSprite(sprite, time = 0, state = {}) {
  animateLegacyPanzerRookSprite(sprite, time, state);
  if (!sprite) return;

  const safeTime = Number(time) || 0;
  if (!Number.isFinite(sprite.userData.panzerRookEntryStartedAt)) {
    sprite.userData.panzerRookEntryStartedAt = safeTime;
    sprite.userData.panzerRookEntryReducedMotion = Boolean(
      typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
    );
  }

  const pose = pawnSlugPanzerRookEntryPose(
    safeTime - sprite.userData.panzerRookEntryStartedAt,
    { reducedMotion: Boolean(sprite.userData.panzerRookEntryReducedMotion) },
  );
  sprite.userData.panzerRookEntryPose = pose;
  if (!pose.active) return;

  const direction = sprite.scale.x < 0 ? -1 : 1;
  sprite.position.x += pose.x * direction;
  sprite.position.y += pose.y;
  sprite.scale.x *= pose.sx;
  sprite.scale.y *= pose.sy;
  if (sprite.material) sprite.material.rotation += pose.rz * direction;
}

export const PAWN_SLUG_SPRITE_META = Object.freeze({
  ...LEGACY_SPRITE_META,
  matthias: Object.freeze({
    ...LEGACY_SPRITE_META.matthias,
    premiumMotion: true,
  }),
  enemies: Object.freeze({
    ...LEGACY_SPRITE_META.enemies,
    runAtlas: PAWN_SLUG_ENEMY_RUN_META,
    panzerRookEntry: true,
  }),
});
