import * as THREE from 'three';
import enemyPremiumFallbackUrl from './assets/pawnSlug/enemy_atlas_premium.webp';
import {
  PAWN_SLUG_ENEMY_RUN_META as BASE_ENEMY_RUN_META,
  animateSlugEnemySprite as animateBaseSlugEnemySprite,
  createSlugEnemySprite as createBaseSlugEnemySprite,
  pawnSlugEnemyRunAtlasWindow,
} from './pawnSlugEnemyRunSprites.js';
import { configurePawnSlugTexture } from './pawnSlugSpriteCore.js';
import { pawnSlugSoldierAtlasBrowserStatus } from './pawnSlugSoldierAtlas.js';
import {
  PAWN_SLUG_PREMIUM_ENEMY_RASTER_META,
  PAWN_SLUG_PREMIUM_ENEMY_RASTER_URL,
  pawnSlugPremiumEnemyRasterWindow,
} from './pawnSlugPremiumEnemyRaster.js';
import { pawnSlugShouldDisposePreviousTexture } from './pawnSlugTextureOwnership.js';
import {
  PAWN_SLUG_ENEMY_VISUAL_EVIDENCE,
  inspectPawnSlugEnemyImage,
} from './pawnSlugEnemyVisualEvidence.js';

const PREMIUM_FALLBACK_FRAME_BY_TYPE = Object.freeze({ pawn: 0, knight: 1, rook: 2 });
const PREMIUM_FALLBACK_COLUMNS = 3;
const PREMIUM_VISUAL_PRIORITY = Object.freeze({
  'premium-fallback': 10,
  'premium-raster': 20,
});
const PREMIUM_VISUAL_EVIDENCE_LAYOUT = Object.freeze({
  'premium-fallback': Object.freeze({ axis: 'x', segments: PAWN_SLUG_ENEMY_VISUAL_EVIDENCE.fallbackSegments }),
  'premium-raster': Object.freeze({ axis: 'y', segments: PAWN_SLUG_ENEMY_VISUAL_EVIDENCE.canonicalSegments }),
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
  texture.userData = { ...(masterTexture.userData || {}) };
  configurePawnSlugTexture(texture);
  texture.needsUpdate = true;
  return texture;
}

function loadPremiumSource(url, source) {
  let pending = premiumSourceLoads.get(url);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (texture) => {
        configurePawnSlugTexture(texture);
        texture.userData ||= {};
        texture.userData.pawnSlugPremiumEnemyVisualEvidence = inspectPawnSlugEnemyImage(
          texture.image,
          PREMIUM_VISUAL_EVIDENCE_LAYOUT[source],
        );
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
  premiumSourceLoads.set(url, pending);
  return pending;
}

function loadPremiumTexture(url, source, onLoad, onError) {
  loadPremiumSource(url, source)
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
  const atlas = sprite?.userData?.atlas;
  const source = atlas?.source;
  const evidence = atlas?.premiumVisual?.evidence
    || sprite?.material?.map?.userData?.pawnSlugPremiumEnemyVisualEvidence;
  const verifiedPremium = source === 'premium-raster'
    && evidence?.checked
    && evidence?.opaque;
  const verifiedActionAtlas = pawnSlugSoldierAtlasBrowserStatus() === 'r2-ready';
  // The static premium fallback remains a valid player-facing safety net, but
  // neither it nor a local action-atlas fallback may satisfy the browser canary
  // that certifies both live enemy atlas paths are loading from R2.
  if (!verifiedPremium || !verifiedActionAtlas) return;
  const status = pawnSlugPremiumEnemyRenderStatus(sprite);
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

    const evidence = texture.userData?.pawnSlugPremiumEnemyVisualEvidence;
    if (!evidence?.checked || !evidence.opaque) {
      texture.dispose?.();
      return false;
    }

    configurePawnSlugTexture(texture);
    if (source === 'premium-raster') texture.generateMipmaps = false;
    texture.userData ||= {};
    texture.userData.pawnSlugPremiumEnemyRetained = true;

    const previous = atlas.texture;
    const supersededPreferred = preferred?.texture;
    atlas.premiumVisual = { texture, source, priority, evidence };
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
    'premium-fallback',
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
      atlas.premiumFallbackState = installTexture(texture, 'premium-fallback') ? 'ready' : 'failed';
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
    'premium-raster',
    (texture) => {
      if (atlas.disposed) {
        texture.dispose?.();
        return;
      }
      const installed = installTexture(texture, 'premium-raster');
      atlas.premiumRasterState = installed
        ? 'ready'
        : (atlas.premiumVisual?.source === 'premium-fallback' ? 'fallback' : 'failed');
      if (!installed) restoreBaseControlsIfNeeded();
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
  visualEvidencePolicy: 'premium-alpha-readback-before-replacing-generated-actions',
  browserRenderContract: 'data-pawn-slug-enemy-visual',
  browserPremiumContract: 'verified-authored-only',
  browserActionAtlasContract: 'r2-ready',
  browserFallbackAlias: null,
  proceduralRole: 'known-good-safety-net',
});
