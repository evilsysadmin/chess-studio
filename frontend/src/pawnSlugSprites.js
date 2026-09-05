import * as THREE from 'three';
import matthiasAtlasUrl from './assets/pawnSlug/matthias_run_atlas_v3.webp';
import matthiasFallbackAtlasUrl from './assets/pawnSlug/matthias_run_atlas_v3.svg';
import enemyAtlasUrl from './assets/pawnSlug/enemy_run_atlas_v3.webp';
import enemyFallbackAtlasUrl from './assets/pawnSlug/enemy_run_atlas_v3.svg';
import panzerRookUrl from './assets/pawnSlug/panzer_rook_v2.webp';
import weaponAtlasUrl from './assets/pawnSlug/weapon_atlas.svg';

const MATTHIAS_RUN_FRAMES = Object.freeze([1, 2, 3, 4]);
const ENEMY_RUN_FRAMES = Object.freeze({
  pawn: Object.freeze([0, 1, 2, 3]),
  knight: Object.freeze([4, 5, 6, 7]),
  rook: Object.freeze([8, 9, 10, 11]),
});

export const PAWN_SLUG_MOTION_PROFILES = Object.freeze({
  matthias: Object.freeze({
    idleRate: 2.2,
    idleBreath: 0.007,
    runRate: 12.4,
    runBob: 0.026,
    runLean: 0.013,
    runSquash: 0.008,
    crouchScale: 0.79,
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

export function createMatthiasSlugSprite() {
  const sprite = atlasSprite(matthiasAtlasUrl, matthiasFallbackAtlasUrl, 8, 0, [1.77, 2.56]);
  sprite.name = 'pawn-slug-matthias-sprite';
  sprite.userData.animation = { clock: 0, weapon: 'pistol' };
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
  const baseScaleY = sprite.userData.motionBaseScaleY || 2.56;
  const direction = dir < 0 ? -1 : 1;
  const runWave = Math.sin(time * profile.runRate);
  const breath = Math.sin(time * profile.idleRate) * profile.idleBreath;
  const weapon = sprite.userData.animation?.weapon || 'pistol';
  const recoil = firing ? (profile.recoilByWeapon[weapon] ?? profile.recoilByWeapon.pistol) : 0;

  if (hurt) setFrame(0);
  else if (firing) setFrame(6);
  else if (crouch) setFrame(5);
  else if (airborne) setFrame(7);
  else if (running) setFrame(MATTHIAS_RUN_FRAMES[Math.floor(time * 11.5) % MATTHIAS_RUN_FRAMES.length]);
  else setFrame(0);

  if (running && !crouch && !airborne) sprite.position.y += Math.abs(runWave) * profile.runBob;
  if (recoil) sprite.position.x -= direction * recoil;
  if (hurt) sprite.position.x -= direction * profile.hurtKick;

  const motionSquash = running && !crouch && !airborne ? Math.cos(time * profile.runRate * 2) * profile.runSquash : breath;
  sprite.scale.y = baseScaleY * (crouch ? profile.crouchScale : 1) * (1 + motionSquash - (hurt ? 0.035 : 0));
  sprite.material.rotation = running && !crouch && !airborne
    ? -direction * runWave * profile.runLean
    : firing
      ? direction * 0.018
      : airborne
        ? -direction * 0.012
        : 0;
  tintSprite(sprite, hurt, 0.8);
}

export function createSlugEnemySprite(type = 'pawn') {
  const sequence = ENEMY_RUN_FRAMES[type] || ENEMY_RUN_FRAMES.pawn;
  const frame = sequence[0];
  const scaleByType = {
    pawn: [2.05, 2.05],
    knight: [2.22, 2.22],
    rook: [2.65, 2.65],
  };
  const sprite = atlasSprite(enemyAtlasUrl, enemyFallbackAtlasUrl, 12, frame, scaleByType[type] || scaleByType.pawn);
  sprite.name = `pawn-slug-${type}-sprite`;
  sprite.userData.enemyFrame = frame;
  sprite.userData.enemyType = type;
  return sprite;
}

export function animateSlugEnemySprite(sprite, type, time, { moving = false, hurt = false } = {}) {
  const profile = PAWN_SLUG_MOTION_PROFILES[type] || PAWN_SLUG_MOTION_PROFILES.pawn;
  const sequence = ENEMY_RUN_FRAMES[type] || ENEMY_RUN_FRAMES.pawn;
  const phase = sprite.userData.motionPhase || 0;
  const direction = sprite.scale.x < 0 ? -1 : 1;
  const moveWave = Math.sin(time * profile.moveRate + phase);
  const idleWave = Math.sin(time * profile.idleRate + phase);
  const baseScaleY = sprite.userData.motionBaseScaleY || Math.abs(sprite.scale.y) || 1;
  const frameRate = type === 'knight' ? 11 : type === 'rook' ? 4.5 : 8.5;
  const frame = moving ? sequence[Math.floor((time + phase) * frameRate) % sequence.length] : sequence[0];
  sprite.userData.setFrame?.(frame);

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
    frames: 8,
    frameWidth: 256,
    frameHeight: 256,
    sourceFacing: 'right',
    framesByAction: Object.freeze({
      idle: 0,
      run: MATTHIAS_RUN_FRAMES,
      crouch: 5,
      fire: 6,
      airborne: 7,
    }),
  }),
  enemies: Object.freeze({
    url: enemyAtlasUrl,
    fallbackUrl: enemyFallbackAtlasUrl,
    frames: 12,
    frameWidth: 256,
    frameHeight: 256,
    sourceFacing: 'right',
    framesByType: ENEMY_RUN_FRAMES,
  }),
  boss: Object.freeze({ url: panzerRookUrl, frames: 1, frameWidth: 192, frameHeight: 192 }),
  weapons: Object.freeze({ url: weaponAtlasUrl, frames: 4, frameWidth: 256, frameHeight: 128 }),
});
