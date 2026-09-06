import * as THREE from 'three';
import matthiasMotionAtlasV5Payload from './assets/pawnSlug/matthias_motion_atlas_v5_payload.b64?raw';
import matthiasLegacyAtlasUrl from './assets/pawnSlug/matthias_atlas_v2.webp';
import matthiasVectorFallbackUrl from './assets/pawnSlug/matthias_atlas.svg';
import enemyAtlasUrl from './assets/pawnSlug/enemy_atlas_v2.webp';
import enemyFallbackAtlasUrl from './assets/pawnSlug/enemy_atlas.svg';
import panzerRookUrl from './assets/pawnSlug/panzer_rook_v2.webp';
import weaponAtlasUrl from './assets/pawnSlug/weapon_atlas.svg';

const MATTHIAS_V5_ASSET_NAME = 'matthias_motion_atlas_v5_payload.b64';
const matthiasMotionAtlasUrl = `data:image/webp;base64,${matthiasMotionAtlasV5Payload.trim()}`;
const ENEMY_FRAME_BY_TYPE = Object.freeze({ pawn: 0, knight: 1, rook: 2 });
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const freezeFrames = (count) => Object.freeze(Array.from({ length: count }, (_, index) => index));

const MATTHIAS_GRID = Object.freeze({ columns: 16, rows: 5, frameWidth: 96, frameHeight: 96 });
const MATTHIAS_ATLAS_WIDTH = MATTHIAS_GRID.columns * MATTHIAS_GRID.frameWidth;
const MATTHIAS_ATLAS_HEIGHT = MATTHIAS_GRID.rows * MATTHIAS_GRID.frameHeight;
const MATTHIAS_UV_GUARD_TEXELS = 1;
const MATTHIAS_ACTIONS = Object.freeze({
  idle: Object.freeze({ row: 0, count: 10 }),
  walk: Object.freeze({ row: 1, count: 10 }),
  run: Object.freeze({ row: 2, count: 16 }),
  crouch: Object.freeze({ row: 3, count: 10 }),
  jump: Object.freeze({ row: 4, count: 9 }),
});
const MATTHIAS_SOURCE_FACING = Object.freeze({
  idle: 1,
  walk: 1,
  run: 1,
  crouch: 1,
  jump: 1,
});
const MATTHIAS_LEGACY_FRAMES = Object.freeze({
  idle: Object.freeze([0]),
  walk: Object.freeze([1, 2]),
  run: Object.freeze([1, 2]),
  crouch: Object.freeze([0]),
  jump: Object.freeze([2]),
});

export const PAWN_SLUG_MATTHIAS_POSE_TRACKS = Object.freeze({
  idle: freezeFrames(10),
  walk: freezeFrames(10),
  run: freezeFrames(16),
  crouch: freezeFrames(10),
  jump: freezeFrames(9),
});

export const PAWN_SLUG_MOTION_PROFILES = Object.freeze({
  matthias: Object.freeze({
    idleRate: 2.6,
    runRate: 15.5,
    crouchInSeconds: 0.15,
    crouchOutSeconds: 0.12,
    crouchScaleX: 1.045,
    crouchScaleY: 0.76,
    crouchDrop: 0.055,
    jumpSeconds: 0.78,
    hurtKick: 0.075,
    recoilByWeapon: Object.freeze({
      pistol: 0.042,
      machinegun: 0.03,
      shotgun: 0.072,
      panzerfaust: 0.105,
    }),
  }),
  pawn: Object.freeze({
    idleRate: 2.7,
    idleBob: 0.006,
    moveRate: 10.2,
    moveBob: 0.018,
    moveLean: 0.01,
    moveSquash: 0.006,
    hurtKick: 0.055,
  }),
  knight: Object.freeze({
    idleRate: 3.1,
    idleBob: 0.009,
    moveRate: 13.8,
    moveBob: 0.032,
    moveLean: 0.026,
    moveSquash: 0.012,
    hurtKick: 0.075,
  }),
  rook: Object.freeze({
    idleRate: 1.9,
    idleBob: 0.004,
    moveRate: 5.2,
    moveBob: 0.008,
    moveLean: 0.005,
    moveSquash: 0.004,
    hurtKick: 0.035,
  }),
  boss: Object.freeze({
    idleRate: 1.25,
    idleBob: 0.025,
    idleBreath: 0.008,
    hurtKick: 0.055,
  }),
});

export function configurePawnSlugTexture(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export function pawnSlugMatthiasAtlasWindow(action, frameIndex = 0, dir = 1) {
  const track = MATTHIAS_ACTIONS[action] || MATTHIAS_ACTIONS.idle;
  const safeIndex = ((Math.floor(frameIndex) % track.count) + track.count) % track.count;
  const direction = dir < 0 ? -1 : 1;
  const guardedWidth = MATTHIAS_GRID.frameWidth - (MATTHIAS_UV_GUARD_TEXELS * 2);
  const guardedHeight = MATTHIAS_GRID.frameHeight - (MATTHIAS_UV_GUARD_TEXELS * 2);
  const leftEdge = (safeIndex * MATTHIAS_GRID.frameWidth) + MATTHIAS_UV_GUARD_TEXELS;
  const rightEdge = ((safeIndex + 1) * MATTHIAS_GRID.frameWidth) - MATTHIAS_UV_GUARD_TEXELS;
  const bottomEdge = (
    MATTHIAS_ATLAS_HEIGHT
    - ((track.row + 1) * MATTHIAS_GRID.frameHeight)
    + MATTHIAS_UV_GUARD_TEXELS
  );

  return Object.freeze({
    action: MATTHIAS_ACTIONS[action] ? action : 'idle',
    frameIndex: safeIndex,
    column: safeIndex,
    row: track.row,
    direction,
    mirrored: direction < 0,
    repeatX: direction * (guardedWidth / MATTHIAS_ATLAS_WIDTH),
    repeatY: guardedHeight / MATTHIAS_ATLAS_HEIGHT,
    offsetX: (direction < 0 ? rightEdge : leftEdge) / MATTHIAS_ATLAS_WIDTH,
    offsetY: bottomEdge / MATTHIAS_ATLAS_HEIGHT,
  });
}

export function pawnSlugMatthiasVisualDirection(action, dir = 1) {
  const worldDirection = dir < 0 ? -1 : 1;
  return worldDirection * (MATTHIAS_SOURCE_FACING[action] || 1);
}

function configureSingleRowWindow(texture, frames, frame) {
  configurePawnSlugTexture(texture);
  texture.repeat.set(1 / frames, 1);
  texture.offset.set(frame / frames, 0);
  texture.needsUpdate = true;
  return texture;
}

function atlasSprite(primaryUrl, fallbackUrl, frames, initialFrame = 0, scale = [2.2, 2.2]) {
  const material = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.05, depthWrite: true });
  material.visible = false;

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale[0], scale[1], 1);
  sprite.center.set(0.5, 0);
  sprite.userData.atlas = {
    frames,
    frame: initialFrame,
    texture: null,
    source: 'loading',
    ready: false,
    disposed: false,
  };
  sprite.userData.motionBaseScaleX = scale[0];
  sprite.userData.motionBaseScaleY = scale[1];
  sprite.userData.motionPhase = Math.random() * Math.PI * 2;

  const loader = new THREE.TextureLoader();

  function applyTexture(texture, source) {
    const atlas = sprite.userData.atlas;
    if (atlas.disposed) {
      texture.dispose?.();
      return;
    }

    configureSingleRowWindow(texture, frames, atlas.frame);
    const previous = atlas.texture;
    atlas.texture = texture;
    atlas.source = source;
    atlas.ready = true;
    material.map = texture;
    material.visible = true;
    material.needsUpdate = true;
    if (previous && previous !== texture) previous.dispose?.();
  }

  function loadFallback() {
    const atlas = sprite.userData.atlas;
    if (atlas.disposed) return;
    if (!fallbackUrl || fallbackUrl === primaryUrl) {
      atlas.source = 'failed';
      return;
    }
    atlas.source = 'fallback-loading';
    loader.load(
      fallbackUrl,
      (texture) => applyTexture(texture, 'fallback'),
      undefined,
      () => {
        if (!atlas.disposed) atlas.source = 'failed';
      },
    );
  }

  loader.load(primaryUrl, (texture) => applyTexture(texture, 'primary'), undefined, loadFallback);

  sprite.userData.setFrame = (frame) => {
    const atlas = sprite.userData.atlas;
    const next = ((Math.floor(frame) % frames) + frames) % frames;
    if (atlas.frame === next) return;
    atlas.frame = next;
    if (atlas.texture) {
      atlas.texture.offset.x = next / frames;
      atlas.texture.needsUpdate = true;
    }
  };
  return sprite;
}

function applyMatthiasAtlasWindow(sprite) {
  const atlas = sprite.userData.atlas;
  const texture = atlas?.texture;
  if (!texture) return;
  const action = sprite.userData.animation?.action || 'idle';
  const frameIndex = sprite.userData.animation?.frameIndex || 0;
  const direction = sprite.userData.animation?.direction < 0 ? -1 : 1;

  configurePawnSlugTexture(texture);
  if (atlas.source === 'primary') {
    const window = pawnSlugMatthiasAtlasWindow(action, frameIndex, direction);
    texture.repeat.set(window.repeatX, window.repeatY);
    texture.offset.set(window.offsetX, window.offsetY);
  } else {
    const legacy = MATTHIAS_LEGACY_FRAMES[action] || MATTHIAS_LEGACY_FRAMES.idle;
    const frame = legacy[((Math.floor(frameIndex) % legacy.length) + legacy.length) % legacy.length];
    texture.repeat.set(direction / 4, 1);
    texture.offset.set(direction < 0 ? (frame + 1) / 4 : frame / 4, 0);
  }
  texture.needsUpdate = true;
}

function matthiasAtlasSprite(scale = [1.77, 2.56]) {
  const material = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.05, depthWrite: true });
  material.visible = false;
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale[0], scale[1], 1);
  sprite.center.set(0.5, 0);
  sprite.userData.motionBaseScaleX = scale[0];
  sprite.userData.motionBaseScaleY = scale[1];
  sprite.userData.atlas = {
    texture: null,
    source: 'loading',
    ready: false,
    disposed: false,
  };
  sprite.userData.animation = {
    weapon: 'pistol',
    action: 'idle',
    frameIndex: 0,
    direction: 1,
    lastTime: null,
    runStartedAt: 0,
    airStartedAt: 0,
    idleStartedAt: 0,
    running: false,
    airborne: false,
    crouchBlend: 0,
  };

  const loader = new THREE.TextureLoader();
  const sources = [
    { url: matthiasMotionAtlasUrl, source: 'primary' },
    { url: matthiasLegacyAtlasUrl, source: 'fallback-raster' },
    { url: matthiasVectorFallbackUrl, source: 'fallback-vector' },
  ];

  function applyTexture(texture, source) {
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
    applyMatthiasAtlasWindow(sprite);
    if (previous && previous !== texture) previous.dispose?.();
  }

  function loadSource(index) {
    const atlas = sprite.userData.atlas;
    if (atlas.disposed) return;
    const entry = sources[index];
    if (!entry) {
      atlas.source = 'failed';
      return;
    }
    atlas.source = index === 0 ? 'loading' : `${entry.source}-loading`;
    loader.load(
      entry.url,
      (texture) => applyTexture(texture, entry.source),
      undefined,
      () => loadSource(index + 1),
    );
  }

  sprite.userData.setActionFrame = (action, frameIndex) => {
    const animation = sprite.userData.animation;
    const track = PAWN_SLUG_MATTHIAS_POSE_TRACKS[action] || PAWN_SLUG_MATTHIAS_POSE_TRACKS.idle;
    const safeIndex = ((Math.floor(frameIndex) % track.length) + track.length) % track.length;
    if (animation.action === action && animation.frameIndex === safeIndex) return;
    animation.action = action;
    animation.frameIndex = safeIndex;
    applyMatthiasAtlasWindow(sprite);
  };
  sprite.userData.setDirection = (dir) => {
    const animation = sprite.userData.animation;
    const direction = dir < 0 ? -1 : 1;
    if (animation.direction === direction) return;
    animation.direction = direction;
    applyMatthiasAtlasWindow(sprite);
  };
  sprite.userData.setWeapon = (kind) => {
    sprite.userData.animation.weapon = kind || 'pistol';
  };

  loadSource(0);
  return sprite;
}

function staticSprite(url, scale = [4, 2.2]) {
  const texture = configurePawnSlugTexture(new THREE.TextureLoader().load(url));
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.04, depthWrite: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale[0], scale[1], 1);
  sprite.center.set(0.5, 0);
  sprite.userData.texture = texture;
  sprite.userData.motionBaseScaleY = scale[1];
  return sprite;
}

function tintSprite(sprite, hurt, hurtOpacity) {
  sprite.material.opacity = hurt ? hurtOpacity : 1;
  sprite.material.color?.setRGB(1, hurt ? 0.62 : 1, hurt ? 0.62 : 1);
}

function updateMatthiasMotionState(animation, { time, running, airborne, crouch, profile }) {
  const lastTime = Number.isFinite(animation.lastTime) ? animation.lastTime : time;
  const dt = Math.max(0, Math.min(0.06, time - lastTime));
  animation.lastTime = time;

  if (running && !animation.running) animation.runStartedAt = time;
  animation.running = running;
  if (airborne && !animation.airborne) animation.airStartedAt = time;
  animation.airborne = airborne;

  const crouchRate = crouch ? 1 / profile.crouchInSeconds : -1 / profile.crouchOutSeconds;
  animation.crouchBlend = clamp01((animation.crouchBlend || 0) + dt * crouchRate);

  const runElapsed = Math.max(0, time - (animation.runStartedAt ?? time));
  const runIndex = Math.floor(runElapsed * profile.runRate) % PAWN_SLUG_MATTHIAS_POSE_TRACKS.run.length;
  const idleElapsed = Math.max(0, time - (animation.idleStartedAt ?? 0));
  const idleIndex = Math.floor(idleElapsed * profile.idleRate) % PAWN_SLUG_MATTHIAS_POSE_TRACKS.idle.length;
  const jumpElapsed = Math.max(0, time - (animation.airStartedAt ?? time));
  const jumpProgress = clamp01(jumpElapsed / profile.jumpSeconds);
  const jumpIndex = Math.min(
    PAWN_SLUG_MATTHIAS_POSE_TRACKS.jump.length - 1,
    Math.floor(jumpProgress * PAWN_SLUG_MATTHIAS_POSE_TRACKS.jump.length),
  );
  const crouchIndex = Math.round(animation.crouchBlend * (PAWN_SLUG_MATTHIAS_POSE_TRACKS.crouch.length - 1));

  return { runIndex, idleIndex, jumpIndex, crouchIndex, crouchBlend: animation.crouchBlend };
}

export function createMatthiasSlugSprite() {
  const sprite = matthiasAtlasSprite([1.77, 2.56]);
  sprite.name = 'pawn-slug-matthias-sprite';
  return sprite;
}

export function animateMatthiasSlugSprite(sprite, {
  time = 0,
  running = false,
  firing = false,
  crouch = false,
  airborne = false,
  hurt = false,
  dir = 1,
} = {}) {
  const setActionFrame = sprite.userData.setActionFrame;
  if (!setActionFrame) return;

  const profile = PAWN_SLUG_MOTION_PROFILES.matthias;
  const animation = sprite.userData.animation;
  const baseScaleX = sprite.userData.motionBaseScaleX || 1.77;
  const baseScaleY = sprite.userData.motionBaseScaleY || 2.56;
  const direction = dir < 0 ? -1 : 1;
  const weapon = animation.weapon || 'pistol';
  const recoil = firing ? (profile.recoilByWeapon[weapon] ?? profile.recoilByWeapon.pistol) : 0;
  const motion = updateMatthiasMotionState(animation, { time, running, airborne, crouch, profile });

  sprite.userData.setDirection?.(direction);
  if (airborne) setActionFrame('jump', motion.jumpIndex);
  else if (motion.crouchBlend > 0.001) setActionFrame('crouch', motion.crouchIndex);
  else if (running) setActionFrame('run', motion.runIndex);
  else setActionFrame('idle', motion.idleIndex);

  if (recoil) sprite.position.x -= direction * recoil;
  if (hurt) sprite.position.x -= direction * profile.hurtKick;

  const visualDirection = pawnSlugMatthiasVisualDirection(animation.action, direction);
  const crouchScaleX = 1 + ((profile.crouchScaleX - 1) * motion.crouchBlend);
  const crouchScaleY = 1 - ((1 - profile.crouchScaleY) * motion.crouchBlend);
  sprite.position.y -= profile.crouchDrop * motion.crouchBlend;
  sprite.scale.x = baseScaleX * crouchScaleX;
  sprite.scale.y = baseScaleY * crouchScaleY * (1 - (hurt ? 0.035 : 0));
  sprite.material.rotation = firing ? visualDirection * 0.012 : 0;
  tintSprite(sprite, hurt, 0.8);
}

export function createSlugEnemySprite(type = 'pawn') {
  const frame = ENEMY_FRAME_BY_TYPE[type] ?? ENEMY_FRAME_BY_TYPE.pawn;
  const scaleByType = {
    pawn: [2.05, 2.05],
    knight: [2.22, 2.22],
    rook: [2.65, 2.65],
  };
  const sprite = atlasSprite(enemyAtlasUrl, enemyFallbackAtlasUrl, 3, frame, scaleByType[type] || scaleByType.pawn);
  sprite.name = `pawn-slug-${type}-sprite`;
  sprite.userData.enemyFrame = frame;
  sprite.userData.enemyType = type;
  return sprite;
}

export function animateSlugEnemySprite(sprite, type, time, { moving = false, hurt = false } = {}) {
  const profile = PAWN_SLUG_MOTION_PROFILES[type] || PAWN_SLUG_MOTION_PROFILES.pawn;
  const phase = sprite.userData.motionPhase || 0;
  const direction = sprite.scale.x < 0 ? -1 : 1;
  const moveWave = Math.sin(time * profile.moveRate + phase);
  const idleWave = Math.sin(time * profile.idleRate + phase);
  const baseScaleY = sprite.userData.motionBaseScaleY || Math.abs(sprite.scale.y) || 1;

  sprite.userData.setFrame?.(sprite.userData.enemyFrame ?? ENEMY_FRAME_BY_TYPE.pawn);
  sprite.position.y += moving
    ? Math.abs(moveWave) * profile.moveBob
    : Math.max(0, idleWave) * profile.idleBob;
  if (hurt) sprite.position.x -= direction * profile.hurtKick;

  sprite.scale.y = baseScaleY * (
    1
    + (moving ? Math.cos(time * profile.moveRate * 2 + phase) * profile.moveSquash : 0)
    - (hurt ? 0.045 : 0)
  );
  sprite.material.rotation = moving ? -direction * moveWave * profile.moveLean : 0;
  tintSprite(sprite, hurt, 0.68);
}

export function createPanzerRookSprite() {
  const sprite = staticSprite(panzerRookUrl, [4.45, 4.45]);
  sprite.name = 'pawn-slug-panzer-rook-sprite';
  sprite.userData.motionPhase = 0.7;
  return sprite;
}

export function animatePanzerRookSprite(sprite, time, { hurt = false } = {}) {
  const profile = PAWN_SLUG_MOTION_PROFILES.boss;
  const direction = sprite.scale.x < 0 ? -1 : 1;
  const wave = Math.sin(time * profile.idleRate + (sprite.userData.motionPhase || 0));
  const baseScaleY = sprite.userData.motionBaseScaleY || 4.45;

  sprite.position.y = wave * profile.idleBob;
  if (hurt) sprite.position.x -= direction * profile.hurtKick;
  sprite.scale.y = baseScaleY * (1 + wave * profile.idleBreath - (hurt ? 0.025 : 0));
  sprite.material.rotation = hurt ? direction * 0.012 : wave * 0.003;
  tintSprite(sprite, hurt, 0.72);
}

export function createWeaponSprite(kind = 'pistol') {
  const frameByKind = { pistol: 0, machinegun: 1, shotgun: 2, panzerfaust: 3 };
  const frame = frameByKind[kind] ?? 0;
  const sprite = atlasSprite(
    weaponAtlasUrl,
    null,
    4,
    frame,
    kind === 'panzerfaust' ? [1.55, 0.78] : [1.35, 0.68],
  );
  sprite.name = `pawn-slug-weapon-${kind}`;
  return sprite;
}

export function disposePawnSlugSprite(sprite) {
  if (!sprite) return;
  if (sprite.userData?.atlas) sprite.userData.atlas.disposed = true;
  const texture = sprite.userData?.atlas?.texture || sprite.userData?.texture || sprite.material?.map;
  texture?.dispose?.();
  sprite.material?.dispose?.();
}

export const PAWN_SLUG_SPRITE_META = Object.freeze({
  matthias: Object.freeze({
    url: matthiasMotionAtlasUrl,
    assetName: MATTHIAS_V5_ASSET_NAME,
    assetVersion: 'v5-approved-mock',
    fallbackUrl: matthiasLegacyAtlasUrl,
    vectorFallbackUrl: matthiasVectorFallbackUrl,
    frames: 55,
    cells: 80,
    columns: MATTHIAS_GRID.columns,
    rows: MATTHIAS_GRID.rows,
    frameWidth: MATTHIAS_GRID.frameWidth,
    frameHeight: MATTHIAS_GRID.frameHeight,
    sourceFacing: 'right',
    sourceFacingByAction: Object.freeze({ idle: 'right', walk: 'right', run: 'right', crouch: 'right', jump: 'right' }),
    runtimeFacings: Object.freeze(['right', 'left']),
    directionMode: 'atlas-uv-mirror',
    uvGuardTexels: MATTHIAS_UV_GUARD_TEXELS,
    actions: MATTHIAS_ACTIONS,
    motionFrames: Object.freeze({ idle: 10, walk: 10, run: 16, crouch: 10, airborne: 9 }),
  }),
  enemies: Object.freeze({
    url: enemyAtlasUrl,
    fallbackUrl: enemyFallbackAtlasUrl,
    frames: 3,
    frameWidth: 104,
    frameHeight: 104,
    sourceFacing: 'right',
    frameByType: ENEMY_FRAME_BY_TYPE,
  }),
  boss: Object.freeze({ url: panzerRookUrl, frames: 1, frameWidth: 192, frameHeight: 192 }),
  weapons: Object.freeze({ url: weaponAtlasUrl, frames: 4, frameWidth: 256, frameHeight: 128 }),
});