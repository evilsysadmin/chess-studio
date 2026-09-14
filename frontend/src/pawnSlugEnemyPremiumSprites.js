import * as THREE from 'three';
import enemyPremiumFallbackUrl from './assets/pawnSlug/enemy_atlas_premium.webp';
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

const PREMIUM_FALLBACK_FRAME_BY_TYPE = Object.freeze({ pawn: 0, knight: 1, rook: 2 });
const PREMIUM_FALLBACK_COLUMNS = 3;
const PREMIUM_VISUAL_PRIORITY = Object.freeze({
  'premium-fallback': 10,
  'premium-raster': 20,
});
const premiumSourceLoads = new Map();

export function pawnSlugPremiumEnemyFallbackWindow(type = 'pawn', dir = 1) {
  const safeType = Object.prototype.hasOwnProperty.call(PREMIUM_FALLBACK_FRAME_BY_TYPE, type) ? type : 'pawn';
  const frame = PREMIUM_FALLBACK_FRAME_BY_TYPE[safeType];
  const direction = Number(dir) < 0 ? -1 : 1;
  const mirrored = direction > 0;
  return Object.freeze({
    type: safeType,
    frame,
    direction,
    mirrored,
    repeatX: (mirrored ? -1 : 1) / PREMIUM_FALLBACK_COLUMNS,
    repeatY: 1,
    offsetX: (mirrored ? frame + 1 : frame) / PREMIUM_FALLBACK_COLUMNS,
    offsetY: 0,
  });
}

export function clonePawnSlugPremiumEnemyTexture(masterTexture) {
  const texture = masterTexture.clone();
  configurePawnSlugTexture(texture);
  texture.needsUpdate = true;
  return texture;
}

function loadPremiumSource(url) {
  let pending = premiumSourceLoads.get(url);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (texture) => {
        configurePawnSlugTexture(texture);
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
  premiumSourceLoads.set(url, pending);
  return pending;
}

function loadPremiumTexture(url, onLoad, onError) {
  loadPremiumSource(url)
    .then((masterTexture) => onLoad(clonePawnSlugPremiumEnemyTexture(masterTexture)))
    .catch(() => onError?.());
}

function premiumWindowKey(sprite) {
  const atlas = sprite.userData.atlas;
  return `${atlas.source}:${atlas.enemyType}:${sprite.userData.action}:${sprite.userData.actionFrame}:${atlas.direction}`;
}

function applyPremiumWindow(sprite) {
  const atlas = sprite.userData.atlas;
  const texture = atlas?.texture;
  if (!texture || !['premium-raster', 'premium-fallback'].includes(atlas.source)) return;
  const key = premiumWindowKey(sprite);
  if (atlas.premiumWindowKey === key) return;
  const window = atlas.source === 'premium-raster'
    ? pawnSlugPremiumEnemyRasterWindow(
      atlas.enemyType,
      sprite.userData.action,
      sprite.userData.actionFrame,
      atlas.direction,
    )
    : pawnSlugPremiumEnemyFallbackWindow(atlas.enemyType, atlas.direction);
  texture.repeat.set(window.repeatX, window.repeatY);
  texture.offset.set(window.offsetX, window.offsetY);
  atlas.premiumWindowKey = key;
}

export function pawnSlugPremiumEnemyRenderStatus(sprite) {
  const atlas = sprite?.userData?.atlas;
  const material = sprite?.material;
  return [
    atlas?.source || 'unknown',
    material?.visible !== false ? 'visible' : 'hidden',
    material?.map ? 'mapped' : 'unmapped',
    sprite?.userData?.pawnSlugEnemyReadability ? 'readable' : 'depth',
    sprite?.parent ? 'attached' : 'detached',
  ].join(':');
}

function publishPremiumEnemyRenderStatus(sprite) {
  if (typeof document === 'undefined') return;
  const stage = document.querySelector?.('[data-pawn-slug-renderer="three"]');
  if (!stage?.dataset) return;
  const status = pawnSlugPremiumEnemyRenderStatus(sprite);
  if (!status.startsWith('premium-')) return;
  if (stage.dataset.pawnSlugEnemyVisual !== status) stage.dataset.pawnSlugEnemyVisual = status;
}

function releaseSupersededPreferredTexture(texture, currentTexture) {
  if (!texture) return;
  if (texture.userData) delete texture.userData.pawnSlugPremiumEnemyRetained;
  if (texture !== currentTexture) texture.dispose?.();
}

export function reassertPawnSlugPremiumEnemyTexture(sprite) {
  const atlas = sprite?.userData?.atlas;
  const preferred = atlas?.premiumVisual;
  const texture = preferred?.texture;
  if (!atlas || atlas.disposed || !texture || !preferred.source) return false;
  if (atlas.texture === texture && atlas.source === preferred.source && sprite.material?.map === texture) {
    publishPremiumEnemyRenderStatus(sprite);
    return false;
  }

  const previous = atlas.texture;
  atlas.texture = texture;
  atlas.source = preferred.source;
  atlas.ready = true;
  atlas.premiumWindowKey = null;
  if (sprite.material) {
    sprite.material.map = texture;
    sprite.material.visible = true;
    sprite.material.needsUpdate = true;
  }
  applyPremiumWindow(sprite);
  if (pawnSlugShouldDisposePreviousTexture(previous, texture)) previous.dispose?.();
  publishPremiumEnemyRenderStatus(sprite);
  return true;
}

function installPremiumRaster(sprite) {
  const atlas = sprite.userData.atlas;
  if (!atlas || typeof document === 'undefined') return sprite;

  const baseSetFrame = sprite.userData.setFrame;
  const baseSetDirection = sprite.userData.setDirection;
  atlas.premiumRasterState = 'loading';
  atlas.premiumFallbackState = 'loading';
  atlas.premiumVisual = null;

  const installTexture = (texture, source) => {
    const priority = PREMIUM_VISUAL_PRIORITY[source] || 0;
    const preferred = atlas.premiumVisual;
    if (atlas.disposed || (preferred && preferred.priority > priority)) {
      texture.dispose?.();
      return false;
    }

    configurePawnSlugTexture(texture);
    if (source === 'premium-raster') texture.generateMipmaps = false;
    texture.userData ||= {};
    texture.userData.pawnSlugPremiumEnemyRetained = true;

    const previous = atlas.texture;
    const supersededPreferred = preferred?.texture;
    atlas.premiumVisual = { texture, source, priority };
    atlas.texture = texture;
    atlas.source = source;
    atlas.ready = true;
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

    if (supersededPreferred && supersededPreferred !== texture) {
      releaseSupersededPreferredTexture(supersededPreferred, previous);
    }
    if (pawnSlugShouldDisposePreviousTexture(previous, texture)) previous.dispose?.();
    publishPremiumEnemyRenderStatus(sprite);
    return true;
  };

  const restoreBaseControlsIfNeeded = () => {
    if (['premium-raster', 'premium-fallback'].includes(atlas.source)) return;
    sprite.userData.setFrame = baseSetFrame;
    sprite.userData.setDirection = baseSetDirection;
  };

  // Decode each premium source only once per page. Every enemy gets a Texture
  // clone so repeat/offset stay independent while all clones share the same
  // decoded image/source instead of re-decoding the atlas for every spawn.
  loadPremiumTexture(
    enemyPremiumFallbackUrl,
    (texture) => {
      if (atlas.disposed) {
        texture.dispose?.();
        return;
      }
      if (atlas.premiumVisual?.source === 'premium-raster') {
        texture.dispose?.();
        atlas.premiumFallbackState = 'superseded';
        return;
      }
      atlas.premiumFallbackState = installTexture(texture, 'premium-fallback') ? 'ready' : 'superseded';
      if (atlas.premiumRasterState === 'failed') atlas.premiumRasterState = 'fallback';
    },
    () => {
      if (atlas.disposed) return;
      atlas.premiumFallbackState = 'failed';
      restoreBaseControlsIfNeeded();
    },
  );

  loadPremiumTexture(
    PAWN_SLUG_PREMIUM_ENEMY_RASTER_URL,
    (texture) => {
      if (atlas.disposed) {
        texture.dispose?.();
        return;
      }
      atlas.premiumRasterState = installTexture(texture, 'premium-raster') ? 'ready' : atlas.premiumRasterState;
    },
    () => {
      if (atlas.disposed) return;
      atlas.premiumRasterState = atlas.premiumVisual?.source === 'premium-fallback' ? 'fallback' : 'failed';
      restoreBaseControlsIfNeeded();
    },
  );
  return sprite;
}

export function createSlugEnemySprite(type = 'pawn') {
  return installPremiumRaster(createBaseSlugEnemySprite(type));
}

export function animateSlugEnemySprite(sprite, type, time, state = {}) {
  reassertPawnSlugPremiumEnemyTexture(sprite);
  animateBaseSlugEnemySprite(sprite, type, time, state);
  applyPremiumWindow(sprite);
  publishPremiumEnemyRenderStatus(sprite);
}

export { pawnSlugEnemyRunAtlasWindow };

export const PAWN_SLUG_ENEMY_RUN_META = Object.freeze({
  ...BASE_ENEMY_RUN_META,
  premiumRaster: PAWN_SLUG_PREMIUM_ENEMY_RASTER_META,
  premiumFallback: Object.freeze({
    asset: 'enemy_atlas_premium.webp',
    width: 384,
    height: 128,
    columns: PREMIUM_FALLBACK_COLUMNS,
    frameWidth: 128,
    frameHeight: 128,
  }),
  primaryVisualSource: 'premium-raster',
  fallbackVisualSource: 'premium-static-raster',
  visualPriority: Object.freeze({ canonical: 20, premiumFallback: 10, procedural: 0 }),
  sourceDecodePolicy: 'shared-once-per-page-cloned-per-enemy',
  sharedDecodedSourceCount: 2,
  lateFallbackOverwriteProtection: true,
  browserRenderContract: 'data-pawn-slug-enemy-visual',
  proceduralRole: 'last-resort',
});
