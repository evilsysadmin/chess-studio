import * as THREE from 'three';
import {
  PAWN_SLUG_ENEMY_RUN_META as BASE_ENEMY_RUN_META,
  animateSlugEnemySprite as animateBaseSlugEnemySprite,
  createSlugEnemySprite as createBaseSlugEnemySprite,
  pawnSlugEnemyRunAtlasWindow,
} from './pawnSlugEnemyRunSprites.js';
import { configurePawnSlugTexture } from './pawnSlugSpriteCore.js';
import {
  PAWN_SLUG_PREMIUM_ENEMY_RASTER_META,
  PAWN_SLUG_PREMIUM_ENEMY_RASTER_URL,
  pawnSlugPremiumEnemyRasterWindow,
} from './pawnSlugPremiumEnemyRaster.js';
import { pawnSlugShouldDisposePreviousTexture } from './pawnSlugTextureOwnership.js';

function premiumWindowKey(sprite) {
  const atlas = sprite.userData.atlas;
  return `${atlas.enemyType}:${sprite.userData.action}:${sprite.userData.actionFrame}:${atlas.direction}`;
}

function applyPremiumWindow(sprite) {
  const atlas = sprite.userData.atlas;
  const texture = atlas?.texture;
  if (!texture || atlas.source !== 'premium-raster') return;
  const key = premiumWindowKey(sprite);
  if (atlas.premiumWindowKey === key) return;
  const window = pawnSlugPremiumEnemyRasterWindow(
    atlas.enemyType,
    sprite.userData.action,
    sprite.userData.actionFrame,
    atlas.direction,
  );
  texture.repeat.set(window.repeatX, window.repeatY);
  texture.offset.set(window.offsetX, window.offsetY);
  atlas.premiumWindowKey = key;
}

function installPremiumRaster(sprite) {
  const atlas = sprite.userData.atlas;
  if (!atlas || typeof document === 'undefined') return sprite;

  const baseSetFrame = sprite.userData.setFrame;
  const baseSetDirection = sprite.userData.setDirection;
  atlas.premiumRasterState = 'loading';

  new THREE.TextureLoader().load(
    PAWN_SLUG_PREMIUM_ENEMY_RASTER_URL,
    (texture) => {
      if (atlas.disposed) {
        texture.dispose?.();
        return;
      }
      configurePawnSlugTexture(texture);
      texture.generateMipmaps = false;
      const previous = atlas.texture;
      atlas.texture = texture;
      atlas.source = 'premium-raster';
      atlas.ready = true;
      atlas.premiumRasterState = 'ready';
      atlas.premiumWindowKey = null;
      sprite.material.map = texture;
      sprite.material.visible = true;
      sprite.material.needsUpdate = true;

      sprite.userData.setFrame = (frame) => {
        atlas.frame = Number.isFinite(Number(frame)) ? Math.floor(Number(frame)) : 0;
        applyPremiumWindow(sprite);
      };
      sprite.userData.setDirection = (dir) => {
        atlas.direction = Number(dir) < 0 ? -1 : 1;
        applyPremiumWindow(sprite);
      };
      applyPremiumWindow(sprite);
      if (pawnSlugShouldDisposePreviousTexture(previous, texture)) previous.dispose?.();
    },
    undefined,
    () => {
      if (atlas.disposed) return;
      atlas.premiumRasterState = 'fallback';
      sprite.userData.setFrame = baseSetFrame;
      sprite.userData.setDirection = baseSetDirection;
    },
  );
  return sprite;
}

export function createSlugEnemySprite(type = 'pawn') {
  return installPremiumRaster(createBaseSlugEnemySprite(type));
}

export function animateSlugEnemySprite(sprite, type, time, state = {}) {
  animateBaseSlugEnemySprite(sprite, type, time, state);
  applyPremiumWindow(sprite);
}

export { pawnSlugEnemyRunAtlasWindow };

export const PAWN_SLUG_ENEMY_RUN_META = Object.freeze({
  ...BASE_ENEMY_RUN_META,
  premiumRaster: PAWN_SLUG_PREMIUM_ENEMY_RASTER_META,
  primaryVisualSource: 'premium-raster',
  proceduralRole: 'fallback-only',
});
