import {
  PAWN_SLUG_SPRITE_META as LEGACY_SPRITE_META,
  animateMatthiasSlugSprite as animateLegacyMatthiasSlugSprite,
  animatePanzerRookSprite as animateLegacyPanzerRookSprite,
  createMatthiasSlugSprite as createLegacyMatthiasSlugSprite,
  createWeaponSprite as createLegacyWeaponSprite,
} from './pawnSlugSpriteCore.js';
import {
  PAWN_SLUG_ENEMY_RUN_META,
  animateSlugEnemySprite,
  createSlugEnemySprite as createPremiumSlugEnemySprite,
  pawnSlugEnemyRunAtlasWindow,
} from './pawnSlugEnemyPremiumSprites.js';
import { PAWN_SLUG_PREMIUM_ENEMY_FACING_CONTRACT } from './pawnSlugEnemyPremiumArtContract.js';
import {
  PAWN_SLUG_ENEMY_READABILITY,
  applyPawnSlugEnemyReadability,
} from './pawnSlugEnemyReadabilityContract.js';
import { pawnSlugPanzerRookEntryPose } from './pawnSlugBossEntryMotion.js';
import { applyPawnSlugMatthiasPremiumMotion } from './pawnSlugMatthiasPremiumMotion.js';
import {
  PAWN_SLUG_MATTHIAS_RUN_POLISH,
  applyPawnSlugMatthiasRunPolish,
} from './pawnSlugMatthiasRunPolish.js';
import {
  PAWN_SLUG_MATTHIAS_FOOTWORK,
  applyPawnSlugMatthiasFootwork,
  attachPawnSlugMatthiasFootwork,
} from './pawnSlugMatthiasFootwork.js';
import { playPawnSlugEnemyImpactSfx, playPawnSlugPlayerHitSfx } from './pawnSlugSfx.js';

export * from './pawnSlugSpriteCore.js';
export * from './pawnSlugEnemyPremiumArtContract.js';
export * from './pawnSlugPremiumEnemyRaster.js';
export * from './pawnSlugMatthiasRunPolish.js';
export * from './pawnSlugMatthiasFootwork.js';
export * from './pawnSlugEnemyReadabilityContract.js';
export {
  PAWN_SLUG_ENEMY_RUN_META,
  animateSlugEnemySprite,
  pawnSlugEnemyRunAtlasWindow,
};

export const PAWN_SLUG_MATTHIAS_PRIMARY_ASPECT = Object.freeze({
  scaleY: 0.9,
  purpose: 'restore-compact-pre-v5-silhouette-without-changing-hitbox',
});

export function applyPawnSlugMatthiasPrimaryAspect(sprite) {
  if (!sprite || sprite.userData?.atlas?.source !== 'primary') return false;
  sprite.scale.y *= PAWN_SLUG_MATTHIAS_PRIMARY_ASPECT.scaleY;
  sprite.userData.pawnSlugPrimaryAspectScaleY = PAWN_SLUG_MATTHIAS_PRIMARY_ASPECT.scaleY;
  return true;
}

// Enemy combatants are 2D sprites living inside a 2.5D Three.js scene. They must
// not disappear behind decorative scenery just because their old runtime z was
// deeper than POWs, pickups and foreground props. Keep depth for the actual 3D
// world, but render combat sprites as a dedicated readability layer.
export function createSlugEnemySprite(type = 'pawn') {
  return applyPawnSlugEnemyReadability(createPremiumSlugEnemySprite(type));
}

export function createMatthiasSlugSprite() {
  const sprite = createLegacyMatthiasSlugSprite();
  attachPawnSlugMatthiasFootwork(sprite);
  return sprite;
}

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

  // Keep compatibility with the authored walk row, but normal Pawn Slug
  // traversal is currently driven by the full sixteen-frame run controller.
  const walking = Boolean(state.walking) && !state.airborne && !state.crouch;
  const visualState = walking ? { ...state, running: false } : state;
  animateLegacyMatthiasSlugSprite(sprite, visualState);
  if (walking) sprite.userData.setActionFrame?.('walk', state.walkFrame ?? 0);
  applyPawnSlugMatthiasPremiumMotion(sprite, visualState);
  applyPawnSlugMatthiasRunPolish(sprite, visualState);
  applyPawnSlugMatthiasFootwork(sprite, visualState);
  applyPawnSlugMatthiasPrimaryAspect(sprite);
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
    runPolish: PAWN_SLUG_MATTHIAS_RUN_POLISH,
    footwork: PAWN_SLUG_MATTHIAS_FOOTWORK,
    primaryAspect: PAWN_SLUG_MATTHIAS_PRIMARY_ASPECT,
    weaponGripAnchor: 'centered-sprite',
  }),
  enemies: Object.freeze({
    ...LEGACY_SPRITE_META.enemies,
    runAtlas: PAWN_SLUG_ENEMY_RUN_META,
    premiumFacing: PAWN_SLUG_PREMIUM_ENEMY_FACING_CONTRACT,
    readability: PAWN_SLUG_ENEMY_READABILITY,
    panzerRookEntry: true,
    panzerRookImpactCue: 'premium-boss-edge-trigger',
  }),
});
