import {
  PAWN_SLUG_SPRITE_META as LEGACY_SPRITE_META,
  animateMatthiasSlugSprite as animateLegacyMatthiasSlugSprite,
  animatePanzerRookSprite as animateLegacyPanzerRookSprite,
  createWeaponSprite as createLegacyWeaponSprite,
} from './pawnSlugSpriteCore.js';
import {
  PAWN_SLUG_ENEMY_RUN_META,
  animateSlugEnemySprite,
  createSlugEnemySprite,
  pawnSlugEnemyRunAtlasWindow,
} from './pawnSlugEnemyRunSprites.js';
import { PAWN_SLUG_PREMIUM_ENEMY_FACING_CONTRACT } from './pawnSlugEnemyPremiumArtContract.js';
import { pawnSlugPanzerRookEntryPose } from './pawnSlugBossEntryMotion.js';
import { applyPawnSlugMatthiasPremiumMotion } from './pawnSlugMatthiasPremiumMotion.js';
import { playPawnSlugEnemyImpactSfx, playPawnSlugPlayerHitSfx } from './pawnSlugSfx.js';

export * from './pawnSlugSpriteCore.js';
export * from './pawnSlugEnemyPremiumArtContract.js';
export {
  PAWN_SLUG_ENEMY_RUN_META,
  animateSlugEnemySprite,
  createSlugEnemySprite,
  pawnSlugEnemyRunAtlasWindow,
};

// The runtime positions the weapon at Matthias' hand/grip height. Legacy weapon
// sprites were bottom-anchored, so that world-space position effectively became
// the weapon's lower edge and lifted the barrel up toward his face. Keep the
// legacy atlas and dimensions, but pivot the live player weapon around its
// vertical centre so the same runtime anchor reads as a two-handed chest grip.
export function createWeaponSprite(kind = 'pistol') {
  const sprite = createLegacyWeaponSprite(kind);
  sprite.center?.set(0.5, 0.5);
  sprite.userData.pawnSlugGripAnchored = true;
  return sprite;
}

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

  const hurt = Boolean(state.hurt);
  if (hurt && !sprite.userData.pawnSlugBossWasHurt) playPawnSlugEnemyImpactSfx('boss');
  sprite.userData.pawnSlugBossWasHurt = hurt;

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
    weaponGripAnchor: 'centered-sprite',
  }),
  enemies: Object.freeze({
    ...LEGACY_SPRITE_META.enemies,
    runAtlas: PAWN_SLUG_ENEMY_RUN_META,
    premiumFacing: PAWN_SLUG_PREMIUM_ENEMY_FACING_CONTRACT,
    panzerRookEntry: true,
    panzerRookImpactCue: 'premium-boss-edge-trigger',
  }),
});
