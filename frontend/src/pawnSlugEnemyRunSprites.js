import * as THREE from 'three';
import {
  PAWN_SLUG_MOTION_PROFILES,
  configurePawnSlugTexture,
} from './pawnSlugSpriteCore.js';
import {
  PAWN_SLUG_ENEMY_ACTION_META,
  pawnSlugEnemyActionForFlags,
  pawnSlugEnemyActionFrame,
  pawnSlugEnemyActionPoseValues,
  pawnSlugEnemyActionTimeValues,
  pawnSlugEnemyDeathDuration,
  pawnSlugEnemySourceFrame,
} from './pawnSlugEnemyActionMotion.js';
import { pawnSlugEnemyEntryPose } from './pawnSlugEnemyEntryMotion.js';
import { pawnSlugEnemyHitFlash } from './pawnSlugEnemyHitFlash.js';
import { installPawnSlugEnemyDeathReplay } from './pawnSlugEnemyDeathReplay.js';
import { playPawnSlugEnemyImpactSfx, playPawnSlugEnemyKoSfx } from './pawnSlugSfx.js';
import {
  PAWN_SLUG_SOLDIER_ATLAS_META,
  createPawnSlugSoldierAtlasTexture,
  pawnSlugSoldierAtlasWindow,
} from './pawnSlugSoldierAtlas.js';
import { pawnSlugShouldDisposePreviousTexture } from './pawnSlugTextureOwnership.js';

const ENEMY_FRAME_BY_TYPE = Object.freeze({ pawn: 0, knight: 1, rook: 2 });
const ENEMY_RUN_FRAME_BASE_BY_TYPE = Object.freeze({ pawn: 0, knight: 8, rook: 16 });
const ENEMY_RUN_FRAMES_PER_TYPE = 8;
const ENEMY_RUN_TOTAL_FRAMES = 24;
const ENEMY_SCALE_BY_TYPE = Object.freeze({
  pawn: Object.freeze([2.05, 2.05]),
  knight: Object.freeze([2.22, 2.22]),
  rook: Object.freeze([2.65, 2.65]),
});

function wrapFrame(frame, count) {
  return ((Math.floor(frame) % count) + count) % count;
}

export function pawnSlugEnemyRunAtlasWindow(type = 'pawn', frameIndex = 0, dir = 1) {
  const safeType = Object.prototype.hasOwnProperty.call(ENEMY_RUN_FRAME_BASE_BY_TYPE, type) ? type : 'pawn';
  const frameInType = wrapFrame(frameIndex, ENEMY_RUN_FRAMES_PER_TYPE);
  const frame = ENEMY_RUN_FRAME_BASE_BY_TYPE[safeType] + frameInType;
  const direction = dir < 0 ? -1 : 1;
  const mirrored = direction > 0;
  return Object.freeze({
    type: safeType,
    frame,
    frameInType,
    direction,
    mirrored,
    repeatX: (mirrored ? -1 : 1) / ENEMY_RUN_TOTAL_FRAMES,
    offsetX: (mirrored ? frame + 1 : frame) / ENEMY_RUN_TOTAL_FRAMES,
  });
}

function fallbackWindow(type, dir) {
  const frame = ENEMY_FRAME_BY_TYPE[type] ?? ENEMY_FRAME_BY_TYPE.pawn;
  const direction = dir < 0 ? -1 : 1;
  return {
    repeatX: direction / 3,
    repeatY: 1,
    offsetX: direction < 0 ? (frame + 1) / 3 : frame / 3,
    offsetY: 0,
  };
}

function atlasWindowKey(atlas, sprite) {
  if (atlas.source === 'generated-actions') {
    return `${atlas.source}:${atlas.enemyType}:${sprite.userData.action}:${sprite.userData.actionFrame}:${atlas.direction}`;
  }
  return `${atlas.source}:${atlas.enemyType}:${atlas.frame}:${atlas.direction}`;
}

function applyAtlasWindow(sprite) {
  const atlas = sprite.userData.atlas;
  const texture = atlas?.texture;
  if (!texture) return;
  const key = atlasWindowKey(atlas, sprite);
  if (atlas.appliedWindowKey === key) return;
  let window;
  if (atlas.source === 'generated-actions') {
    window = pawnSlugSoldierAtlasWindow(atlas.enemyType, sprite.userData.action, sprite.userData.actionFrame, atlas.direction);
  } else if (atlas.source === 'primary-run') {
    window = { ...pawnSlugEnemyRunAtlasWindow(atlas.enemyType, atlas.frame, atlas.direction), repeatY: 1, offsetY: 0 };
  } else {
    window = fallbackWindow(atlas.enemyType, atlas.direction);
  }
  texture.repeat.set(window.repeatX, window.repeatY);
  texture.offset.set(window.offsetX, window.offsetY);
  atlas.appliedWindowKey = key;
  // repeat/offset only change the texture transform uniform. Marking the texture
  // itself dirty here forces Three.js to re-upload the full atlas to the GPU.
}

export function applyPawnSlugEnemyTint(sprite, hurt, time) {
  const startedAt = Number(sprite.userData.hurtStartedAt);
  const age = hurt && Number.isFinite(startedAt)
    ? Math.max(0, Number(time) - startedAt)
    : Number.POSITIVE_INFINITY;
  const flash = pawnSlugEnemyHitFlash(age, { hurt, type: sprite.userData.enemyType });
  if (sprite.userData.appliedHitFlash === flash) return false;
  sprite.userData.appliedHitFlash = flash;
  sprite.material.opacity = flash.opacity;
  sprite.material.color?.setRGB(flash.r, flash.g, flash.b);
  return true;
}

function inferredVerticalMotion(sprite, time) {
  const y = sprite.position.y;
  const previousY = sprite.userData.lastWorldY;
  const previousTime = sprite.userData.lastWorldYAt;
  let vy = 0;
  if (Number.isFinite(previousY) && Number.isFinite(previousTime) && time > previousTime) {
    vy = (y - previousY) / Math.max(1 / 120, time - previousTime);
    if (Math.abs(y - previousY) > 0.0035) sprite.userData.airborneUntil = time + 0.14;
  }
  sprite.userData.lastWorldY = y;
  sprite.userData.lastWorldYAt = time;
  const inferred = sprite.userData.inferredMotion;
  inferred.airborne = time < (sprite.userData.airborneUntil || 0);
  inferred.vy = vy;
  return inferred;
}

export function createSlugEnemySprite(type = 'pawn') {
  const safeType = Object.prototype.hasOwnProperty.call(ENEMY_SCALE_BY_TYPE, type) ? type : 'pawn';
  const scale = ENEMY_SCALE_BY_TYPE[safeType];
  const reducedMotion = Boolean(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const material = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.05, depthWrite: true });
  material.visible = false;
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale[0], scale[1], 1);
  sprite.center.set(0.5, 0);
  sprite.name = `pawn-slug-${safeType}-sprite`;
  sprite.userData.enemyType = safeType;
  sprite.userData.enemyFrame = ENEMY_FRAME_BY_TYPE[safeType];
  sprite.userData.motionBaseScaleX = scale[0];
  sprite.userData.motionBaseScaleY = scale[1];
  sprite.userData.motionPhase = Math.random() * Math.PI * 2;
  sprite.userData.deathVariant = Math.abs(Math.floor(sprite.userData.motionPhase * 1000)) % PAWN_SLUG_ENEMY_ACTION_META.deathVariants;
  sprite.userData.action = 'idle';
  sprite.userData.actionFrame = 0;
  sprite.userData.airborneUntil = 0;
  sprite.userData.inferredMotion = { airborne: false, vy: 0 };
  sprite.userData.wasHurt = false;
  sprite.userData.hurtStartedAt = null;
  sprite.userData.appliedHitFlash = null;
  sprite.userData.wasDying = false;
  sprite.userData.entryStartedAt = null;
  sprite.userData.entryReducedMotion = reducedMotion;
  sprite.userData.atlas = {
    frames: ENEMY_RUN_FRAMES_PER_TYPE,
    frame: 0,
    direction: 1,
    enemyType: safeType,
    texture: null,
    source: 'loading',
    ready: false,
    disposed: false,
    appliedWindowKey: null,
  };

  const applyTexture = (texture, source) => {
    const atlas = sprite.userData.atlas;
    if (atlas.disposed) {
      texture.dispose?.();
      return;
    }
    const previous = atlas.texture;
    configurePawnSlugTexture(texture);
    atlas.texture = texture;
    atlas.source = source;
    atlas.ready = true;
    atlas.appliedWindowKey = null;
    material.map = texture;
    material.visible = true;
    material.needsUpdate = true;
    applyAtlasWindow(sprite);
    if (pawnSlugShouldDisposePreviousTexture(previous, texture)) previous.dispose?.();
  };

  const generated = createPawnSlugSoldierAtlasTexture();
  if (generated) applyTexture(generated, 'generated-actions');
  else sprite.userData.atlas.source = 'failed';

  sprite.userData.setFrame = (frame) => {
    const atlas = sprite.userData.atlas;
    const next = wrapFrame(frame, ENEMY_RUN_FRAMES_PER_TYPE);
    if (atlas.frame === next) return;
    atlas.frame = next;
    if (atlas.source !== 'generated-actions') applyAtlasWindow(sprite);
  };
  sprite.userData.setDirection = (dir) => {
    const atlas = sprite.userData.atlas;
    const direction = dir < 0 ? -1 : 1;
    if (atlas.direction === direction) return;
    atlas.direction = direction;
    applyAtlasWindow(sprite);
  };
  sprite.userData.deathReplay = installPawnSlugEnemyDeathReplay(sprite, {
    type: safeType,
    duration: pawnSlugEnemyDeathDuration(safeType),
    hold: 0.24,
    reducedMotion,
    animate: (deathAge) => animateSlugEnemySprite(sprite, safeType, deathAge, { dying: true, deathAge }),
  });
  return sprite;
}

export function animateSlugEnemySprite(sprite, type, time, state = {}) {
  const safeTime = Number(time) || 0;
  const inferred = inferredVerticalMotion(sprite, safeTime);
  const {
    moving = false,
    hurt = false,
    airborne = inferred.airborne,
    crouch = false,
    climbing = false,
    dying = false,
    deathAge = 0,
    vy = inferred.vy,
  } = state;

  const startingHurt = Boolean(hurt && !sprite.userData.wasHurt && !dying);
  if (startingHurt) {
    sprite.userData.hurtStartedAt = safeTime;
    playPawnSlugEnemyImpactSfx(type);
  }
  if (dying && !sprite.userData.wasDying) playPawnSlugEnemyKoSfx(type);
  sprite.userData.wasHurt = Boolean(hurt && !dying);
  sprite.userData.wasDying = Boolean(dying);

  if (!Number.isFinite(sprite.userData.entryStartedAt)) sprite.userData.entryStartedAt = safeTime;
  const entryPose = pawnSlugEnemyEntryPose(type, safeTime - sprite.userData.entryStartedAt, {
    reducedMotion: Boolean(sprite.userData.entryReducedMotion),
    enabled: !dying,
  });

  const profile = PAWN_SLUG_MOTION_PROFILES[type] || PAWN_SLUG_MOTION_PROFILES.pawn;
  const direction = sprite.scale.x < 0 ? -1 : 1;
  const baseScaleX = sprite.userData.motionBaseScaleX || Math.abs(sprite.scale.x) || 1;
  const baseScaleY = sprite.userData.motionBaseScaleY || Math.abs(sprite.scale.y) || 1;
  const action = pawnSlugEnemyActionForFlags(moving, hurt, airborne, crouch, climbing, dying);
  const actionTime = pawnSlugEnemyActionTimeValues(
    action,
    safeTime,
    sprite.userData.hurtStartedAt,
    deathAge,
  );
  const actionFrame = pawnSlugEnemyActionFrame(action, actionTime, type);
  const sourceFrame = pawnSlugEnemySourceFrame(action, actionFrame, ENEMY_RUN_FRAMES_PER_TYPE);
  const pose = pawnSlugEnemyActionPoseValues(
    action,
    actionFrame,
    vy,
    type,
    sprite.userData.deathVariant,
  );
  const actionChanged = sprite.userData.action !== action || sprite.userData.actionFrame !== actionFrame;

  sprite.userData.action = action;
  sprite.userData.actionFrame = actionFrame;
  sprite.userData.setDirection?.(direction);
  sprite.userData.setFrame?.(sourceFrame);
  if (sprite.userData.atlas?.source === 'generated-actions' && actionChanged) applyAtlasWindow(sprite);
  sprite.position.x += (pose.x + entryPose.x) * direction;
  sprite.position.y += pose.y + entryPose.y;
  sprite.scale.x = baseScaleX * pose.sx * entryPose.sx * direction;
  sprite.scale.y = baseScaleY * pose.sy * entryPose.sy;
  sprite.material.rotation = (pose.rz + entryPose.rz) * direction;

  if (action === 'idle') {
    const phase = sprite.userData.motionPhase || 0;
    sprite.position.y += Math.max(0, Math.sin(safeTime * profile.idleRate + phase)) * profile.idleBob;
  }
  applyPawnSlugEnemyTint(sprite, hurt && !dying, safeTime);
}

export const PAWN_SLUG_ENEMY_RUN_META = Object.freeze({
  frames: ENEMY_RUN_TOTAL_FRAMES,
  framesPerType: ENEMY_RUN_FRAMES_PER_TYPE,
  frameWidth: 64,
  frameHeight: 64,
  sourceFacing: 'left',
  runtimeFacings: Object.freeze(['right', 'left']),
  directionMode: 'atlas-uv-mirror',
  frameBaseByType: ENEMY_RUN_FRAME_BASE_BY_TYPE,
  actionMotion: PAWN_SLUG_ENEMY_ACTION_META,
  generatedActionAtlas: PAWN_SLUG_SOLDIER_ATLAS_META,
  legacyRunTransport: 'retired',
});
