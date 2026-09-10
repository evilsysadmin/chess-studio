import * as THREE from 'three';
import enemyAtlasUrl from './assets/pawnSlug/enemy_atlas_v2.webp';
import enemyRunAtlasPart1 from './assets/pawnSlug/enemy_run_left_atlas_v1_part1.b64?raw';
import enemyRunAtlasPart2 from './assets/pawnSlug/enemy_run_left_atlas_v1_part2.b64?raw';
import enemyRunAtlasPart3 from './assets/pawnSlug/enemy_run_left_atlas_v1_part3.b64?raw';
import enemyRunAtlasPart4 from './assets/pawnSlug/enemy_run_left_atlas_v1_part4.b64?raw';
import enemyRunAtlasPart5 from './assets/pawnSlug/enemy_run_left_atlas_v1_part5.b64?raw';
import enemyRunAtlasPart6a from './assets/pawnSlug/enemy_run_left_atlas_v1_part6a.b64?raw';
import enemyRunAtlasPart6b from './assets/pawnSlug/enemy_run_left_atlas_v1_part6b.b64?raw';
import enemyRunAtlasPart7a from './assets/pawnSlug/enemy_run_left_atlas_v1_part7a.b64?raw';
import enemyRunAtlasPart7b from './assets/pawnSlug/enemy_run_left_atlas_v1_part7b.b64?raw';
import enemyRunAtlasPart8a from './assets/pawnSlug/enemy_run_left_atlas_v1_part8a.b64?raw';
import enemyRunAtlasPart8b from './assets/pawnSlug/enemy_run_left_atlas_v1_part8b.b64?raw';
import enemyRunAtlasPart9a from './assets/pawnSlug/enemy_run_left_atlas_v1_part9a.b64?raw';
import enemyRunAtlasPart9b from './assets/pawnSlug/enemy_run_left_atlas_v1_part9b.b64?raw';
import enemyRunAtlasPart10a from './assets/pawnSlug/enemy_run_left_atlas_v1_part10a.b64?raw';
import enemyRunAtlasPart10b from './assets/pawnSlug/enemy_run_left_atlas_v1_part10b.b64?raw';
import {
  PAWN_SLUG_MOTION_PROFILES,
  configurePawnSlugTexture,
} from './pawnSlugSpritesLegacy.js';
import {
  PAWN_SLUG_ENEMY_ACTION_META,
  pawnSlugEnemyActionForState,
  pawnSlugEnemyActionFrame,
  pawnSlugEnemyActionPose,
  pawnSlugEnemySourceFrame,
} from './pawnSlugEnemyActionMotion.js';

const ENEMY_FRAME_BY_TYPE = Object.freeze({ pawn: 0, knight: 1, rook: 2 });
const ENEMY_RUN_FRAME_BASE_BY_TYPE = Object.freeze({ pawn: 0, knight: 8, rook: 16 });
const ENEMY_RUN_FRAMES_PER_TYPE = 8;
const ENEMY_RUN_TOTAL_FRAMES = 24;
const ENEMY_SCALE_BY_TYPE = Object.freeze({
  pawn: Object.freeze([2.05, 2.05]),
  knight: Object.freeze([2.22, 2.22]),
  rook: Object.freeze([2.65, 2.65]),
});

const enemyRunAtlasUrl = `data:image/webp;base64,${[
  enemyRunAtlasPart1,
  enemyRunAtlasPart2,
  enemyRunAtlasPart3,
  enemyRunAtlasPart4,
  enemyRunAtlasPart5,
  enemyRunAtlasPart6a,
  enemyRunAtlasPart6b,
  enemyRunAtlasPart7a,
  enemyRunAtlasPart7b,
  enemyRunAtlasPart8a,
  enemyRunAtlasPart8b,
  enemyRunAtlasPart9a,
  enemyRunAtlasPart9b,
  enemyRunAtlasPart10a,
  enemyRunAtlasPart10b,
].map((part) => part.trim()).join('')}`;

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
    offsetX: direction < 0 ? (frame + 1) / 3 : frame / 3,
  };
}

function applyAtlasWindow(sprite) {
  const atlas = sprite.userData.atlas;
  const texture = atlas?.texture;
  if (!texture) return;
  configurePawnSlugTexture(texture);
  const window = atlas.source === 'primary-run'
    ? pawnSlugEnemyRunAtlasWindow(atlas.enemyType, atlas.frame, atlas.direction)
    : fallbackWindow(atlas.enemyType, atlas.direction);
  texture.repeat.set(window.repeatX, 1);
  texture.offset.set(window.offsetX, 0);
  texture.needsUpdate = true;
}

function tintSprite(sprite, hurt) {
  sprite.material.opacity = hurt ? 0.68 : 1;
  sprite.material.color?.setRGB(1, hurt ? 0.62 : 1, hurt ? 0.62 : 1);
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
  return Object.freeze({
    airborne: time < (sprite.userData.airborneUntil || 0),
    vy,
  });
}

export function createSlugEnemySprite(type = 'pawn') {
  const safeType = Object.prototype.hasOwnProperty.call(ENEMY_SCALE_BY_TYPE, type) ? type : 'pawn';
  const scale = ENEMY_SCALE_BY_TYPE[safeType];
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
  sprite.userData.action = 'idle';
  sprite.userData.actionFrame = 0;
  sprite.userData.airborneUntil = 0;
  sprite.userData.atlas = {
    frames: ENEMY_RUN_FRAMES_PER_TYPE,
    frame: 0,
    direction: 1,
    enemyType: safeType,
    texture: null,
    source: 'loading',
    ready: false,
    disposed: false,
  };

  const loader = new THREE.TextureLoader();
  const applyTexture = (texture, source) => {
    const atlas = sprite.userData.atlas;
    if (atlas.disposed) {
      texture.dispose?.();
      return;
    }
    const previous = atlas.texture;
    atlas.texture = texture;
    atlas.source = source;
    atlas.ready = true;
    material.map = texture;
    material.visible = true;
    material.needsUpdate = true;
    applyAtlasWindow(sprite);
    if (previous && previous !== texture) previous.dispose?.();
  };
  const loadFallback = () => {
    const atlas = sprite.userData.atlas;
    if (atlas.disposed) return;
    atlas.source = 'fallback-loading';
    loader.load(
      enemyAtlasUrl,
      (texture) => applyTexture(texture, 'fallback-premium'),
      undefined,
      () => { if (!atlas.disposed) atlas.source = 'failed'; },
    );
  };
  loader.load(enemyRunAtlasUrl, (texture) => applyTexture(texture, 'primary-run'), undefined, loadFallback);

  sprite.userData.setFrame = (frame) => {
    const atlas = sprite.userData.atlas;
    const next = wrapFrame(frame, ENEMY_RUN_FRAMES_PER_TYPE);
    if (atlas.frame === next) return;
    atlas.frame = next;
    applyAtlasWindow(sprite);
  };
  sprite.userData.setDirection = (dir) => {
    const atlas = sprite.userData.atlas;
    const direction = dir < 0 ? -1 : 1;
    if (atlas.direction === direction) return;
    atlas.direction = direction;
    applyAtlasWindow(sprite);
  };
  return sprite;
}

export function animateSlugEnemySprite(sprite, type, time, state = {}) {
  const inferred = inferredVerticalMotion(sprite, Number(time) || 0);
  const {
    moving = false,
    hurt = false,
    airborne = inferred.airborne,
    crouch = false,
    climbing = false,
    vy = inferred.vy,
  } = state;
  const profile = PAWN_SLUG_MOTION_PROFILES[type] || PAWN_SLUG_MOTION_PROFILES.pawn;
  const direction = sprite.scale.x < 0 ? -1 : 1;
  const baseScaleX = sprite.userData.motionBaseScaleX || Math.abs(sprite.scale.x) || 1;
  const baseScaleY = sprite.userData.motionBaseScaleY || Math.abs(sprite.scale.y) || 1;
  const action = pawnSlugEnemyActionForState({ moving, hurt, airborne, crouch, climbing });
  const actionFrame = pawnSlugEnemyActionFrame(action, time);
  const sourceFrame = pawnSlugEnemySourceFrame(action, actionFrame, ENEMY_RUN_FRAMES_PER_TYPE);
  const pose = pawnSlugEnemyActionPose(action, actionFrame, { vy, type });

  sprite.userData.action = action;
  sprite.userData.actionFrame = actionFrame;
  sprite.userData.setDirection?.(direction);
  sprite.userData.setFrame?.(sourceFrame);
  sprite.position.x += pose.x * direction;
  sprite.position.y += pose.y;
  sprite.scale.x = baseScaleX * pose.sx * direction;
  sprite.scale.y = baseScaleY * pose.sy;
  sprite.material.rotation = pose.rz * direction;

  if (action === 'idle') {
    const phase = sprite.userData.motionPhase || 0;
    sprite.position.y += Math.max(0, Math.sin(time * profile.idleRate + phase)) * profile.idleBob;
  }
  tintSprite(sprite, hurt);
}

export const PAWN_SLUG_ENEMY_RUN_META = Object.freeze({
  url: enemyRunAtlasUrl,
  fallbackUrl: enemyAtlasUrl,
  frames: ENEMY_RUN_TOTAL_FRAMES,
  framesPerType: ENEMY_RUN_FRAMES_PER_TYPE,
  frameWidth: 64,
  frameHeight: 64,
  sourceFacing: 'left',
  runtimeFacings: Object.freeze(['right', 'left']),
  directionMode: 'atlas-uv-mirror',
  frameBaseByType: ENEMY_RUN_FRAME_BASE_BY_TYPE,
  actionMotion: PAWN_SLUG_ENEMY_ACTION_META,
});