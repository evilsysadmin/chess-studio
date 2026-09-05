import * as THREE from 'three';
import matthiasAtlasUrl from './assets/pawnSlug/matthias_atlas_v2.webp';
import matthiasFallbackAtlasUrl from './assets/pawnSlug/matthias_atlas.svg';
import enemyAtlasUrl from './assets/pawnSlug/enemy_atlas_v2.webp';
import enemyFallbackAtlasUrl from './assets/pawnSlug/enemy_atlas.svg';
import panzerRookUrl from './assets/pawnSlug/panzer_rook_v2.webp';
import weaponAtlasUrl from './assets/pawnSlug/weapon_atlas.svg';

const ENEMY_FRAME_BY_TYPE = Object.freeze({ pawn: 0, knight: 1, rook: 2 });
const freezeTrack = (poses) => Object.freeze(poses.map((pose) => Object.freeze(pose)));
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export const PAWN_SLUG_MATTHIAS_POSE_TRACKS = Object.freeze({
  run: freezeTrack([
    { frame: 1, x: -0.018, y: 0.000, scaleX: 1.015, scaleY: 0.990, rotation: -0.020 },
    { frame: 1, x: -0.006, y: 0.020, scaleX: 1.000, scaleY: 1.008, rotation: -0.012 },
    { frame: 2, x: 0.008, y: 0.036, scaleX: 0.990, scaleY: 1.018, rotation: 0.000 },
    { frame: 2, x: 0.022, y: 0.022, scaleX: 1.004, scaleY: 1.006, rotation: 0.012 },
    { frame: 1, x: 0.030, y: 0.002, scaleX: 1.018, scaleY: 0.988, rotation: 0.020 },
    { frame: 1, x: 0.015, y: 0.018, scaleX: 1.002, scaleY: 1.006, rotation: 0.012 },
    { frame: 2, x: 0.000, y: 0.038, scaleX: 0.988, scaleY: 1.020, rotation: 0.000 },
    { frame: 2, x: -0.014, y: 0.020, scaleX: 1.002, scaleY: 1.006, rotation: -0.012 },
    { frame: 1, x: -0.026, y: 0.002, scaleX: 1.018, scaleY: 0.988, rotation: -0.020 },
  ]),
  jump: freezeTrack([
    { frame: 1, x: -0.010, y: 0.000, scaleX: 1.028, scaleY: 0.970, rotation: -0.018 },
    { frame: 2, x: 0.000, y: 0.022, scaleX: 0.985, scaleY: 1.035, rotation: -0.012 },
    { frame: 2, x: 0.008, y: 0.040, scaleX: 0.975, scaleY: 1.050, rotation: -0.006 },
    { frame: 2, x: 0.014, y: 0.050, scaleX: 0.982, scaleY: 1.040, rotation: 0.000 },
    { frame: 2, x: 0.014, y: 0.046, scaleX: 0.990, scaleY: 1.028, rotation: 0.006 },
    { frame: 2, x: 0.008, y: 0.032, scaleX: 1.000, scaleY: 1.012, rotation: 0.012 },
    { frame: 1, x: 0.000, y: 0.014, scaleX: 1.015, scaleY: 0.992, rotation: 0.016 },
    { frame: 0, x: -0.006, y: 0.000, scaleX: 1.030, scaleY: 0.970, rotation: 0.010 },
  ]),
  crouch: freezeTrack([
    { frame: 0, x: 0.000, y: 0.000, scaleX: 1.000, scaleY: 1.000, rotation: 0.000 },
    { frame: 0, x: 0.006, y: -0.006, scaleX: 1.008, scaleY: 0.962, rotation: 0.003 },
    { frame: 1, x: 0.010, y: -0.012, scaleX: 1.016, scaleY: 0.920, rotation: 0.006 },
    { frame: 1, x: 0.014, y: -0.018, scaleX: 1.024, scaleY: 0.875, rotation: 0.008 },
    { frame: 1, x: 0.016, y: -0.022, scaleX: 1.030, scaleY: 0.835, rotation: 0.010 },
    { frame: 0, x: 0.016, y: -0.025, scaleX: 1.034, scaleY: 0.808, rotation: 0.010 },
    { frame: 0, x: 0.014, y: -0.026, scaleX: 1.036, scaleY: 0.792, rotation: 0.009 },
    { frame: 0, x: 0.012, y: -0.026, scaleX: 1.038, scaleY: 0.785, rotation: 0.008 },
  ]),
});

export const PAWN_SLUG_MOTION_PROFILES = Object.freeze({
  matthias: Object.freeze({
    idleRate: 2.2,
    idleBreath: 0.007,
    runRate: 13.0,
    crouchInSeconds: 0.15,
    crouchOutSeconds: 0.12,
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
  // These actor atlases are NPOT; clamp keeps them valid on WebGL1.
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function configureAtlasWindow(texture, frames, frame) {
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

    configureAtlasWindow(texture, frames, atlas.frame);
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

  loader.load(
    primaryUrl,
    (texture) => applyTexture(texture, 'primary'),
    undefined,
    loadFallback,
  );

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

function poseAt(track, index) {
  return track[Math.max(0, Math.min(track.length - 1, index))];
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
  const jumpElapsed = Math.max(0, time - (animation.airStartedAt ?? time));
  const jumpProgress = clamp01(jumpElapsed / profile.jumpSeconds);
  const jumpIndex = Math.min(
    PAWN_SLUG_MATTHIAS_POSE_TRACKS.jump.length - 1,
    Math.floor(jumpProgress * PAWN_SLUG_MATTHIAS_POSE_TRACKS.jump.length),
  );
  const crouchIndex = Math.round(animation.crouchBlend * (PAWN_SLUG_MATTHIAS_POSE_TRACKS.crouch.length - 1));

  return { runIndex, jumpIndex, crouchIndex, crouchBlend: animation.crouchBlend };
}

export function createMatthiasSlugSprite() {
  const sprite = atlasSprite(matthiasAtlasUrl, matthiasFallbackAtlasUrl, 4, 0, [1.77, 2.56]);
  sprite.name = 'pawn-slug-matthias-sprite';
  sprite.userData.animation = {
    weapon: 'pistol',
    lastTime: null,
    runStartedAt: 0,
    airStartedAt: 0,
    running: false,
    airborne: false,
    crouchBlend: 0,
  };
  sprite.userData.setWeapon = (kind) => { sprite.userData.animation.weapon = kind || 'pistol'; };
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
  const setFrame = sprite.userData.setFrame;
  if (!setFrame) return;
  const profile = PAWN_SLUG_MOTION_PROFILES.matthias;
  const animation = sprite.userData.animation || (sprite.userData.animation = { weapon: 'pistol', crouchBlend: 0 });
  const baseScaleX = sprite.userData.motionBaseScaleX || 1.77;
  const baseScaleY = sprite.userData.motionBaseScaleY || 2.56;
  const direction = dir < 0 ? -1 : 1;
  const breath = Math.sin(time * profile.idleRate) * profile.idleBreath;
  const weapon = animation.weapon || 'pistol';
  const recoil = firing ? (profile.recoilByWeapon[weapon] ?? profile.recoilByWeapon.pistol) : 0;
  const motion = updateMatthiasMotionState(animation, { time, running, airborne, crouch, profile });

  let pose = null;
  if (airborne) pose = poseAt(PAWN_SLUG_MATTHIAS_POSE_TRACKS.jump, motion.jumpIndex);
  else if (motion.crouchBlend > 0.001) pose = poseAt(PAWN_SLUG_MATTHIAS_POSE_TRACKS.crouch, motion.crouchIndex);
  else if (running) pose = poseAt(PAWN_SLUG_MATTHIAS_POSE_TRACKS.run, motion.runIndex);

  if (hurt) setFrame(0);
  else if (firing) setFrame(3);
  else if (pose) setFrame(pose.frame);
  else setFrame(0);

  const scaleX = pose?.scaleX ?? 1;
  const scaleY = pose?.scaleY ?? (1 + breath);
  const poseRotation = pose?.rotation ?? 0;
  const poseX = pose?.x ?? 0;
  const poseY = pose?.y ?? 0;

  sprite.position.x += direction * poseX;
  sprite.position.y += poseY;
  if (recoil) sprite.position.x -= direction * recoil;
  if (hurt) sprite.position.x -= direction * profile.hurtKick;

  sprite.scale.x = baseScaleX * direction * scaleX;
  sprite.scale.y = baseScaleY * scaleY * (1 - (hurt ? 0.035 : 0));
  sprite.material.rotation = direction * poseRotation + (firing ? direction * 0.018 : 0);
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

  sprite.scale.y = baseScaleY * (1 + (moving ? Math.cos(time * profile.moveRate * 2 + phase) * profile.moveSquash : 0) - (hurt ? 0.045 : 0));
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
  const sprite = atlasSprite(weaponAtlasUrl, null, 4, frame, kind === 'panzerfaust' ? [1.55, .78] : [1.35, .68]);
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
    url: matthiasAtlasUrl,
    fallbackUrl: matthiasFallbackAtlasUrl,
    frames: 4,
    frameWidth: 72,
    frameHeight: 104,
    sourceFacing: 'right',
    framesByAction: Object.freeze({ idle: 0, run: [1, 2], crouch: 0, fire: 3, airborne: 2 }),
    motionFrames: Object.freeze({ run: 9, crouch: 8, airborne: 8 }),
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
