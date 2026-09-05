import * as THREE from 'three';
import matthiasAtlasUrl from './assets/pawnSlug/matthias_atlas_v2.webp';
import matthiasFallbackAtlasUrl from './assets/pawnSlug/matthias_atlas.svg';
import enemyAtlasUrl from './assets/pawnSlug/enemy_atlas_v2.webp';
import enemyFallbackAtlasUrl from './assets/pawnSlug/enemy_atlas.svg';
import panzerRookUrl from './assets/pawnSlug/panzer_rook_v2.webp';
import weaponAtlasUrl from './assets/pawnSlug/weapon_atlas.svg';

export const PAWN_SLUG_MOTION_PROFILES = Object.freeze({
  matthias: Object.freeze({
    idleRate: 2.2,
    idleBreath: 0.008,
    runRate: 13.2,
    runBob: 0.045,
    runLean: 0.022,
    runSquash: 0.014,
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
    idleBob: 0.008,
    moveRate: 9.2,
    moveBob: 0.035,
    moveLean: 0.016,
    moveSquash: 0.012,
    hurtKick: 0.055,
  }),
  knight: Object.freeze({
    idleRate: 3.1,
    idleBob: 0.012,
    moveRate: 13.5,
    moveBob: 0.07,
    moveLean: 0.044,
    moveSquash: 0.026,
    hurtKick: 0.075,
  }),
  rook: Object.freeze({
    idleRate: 1.9,
    idleBob: 0.004,
    moveRate: 5.6,
    moveBob: 0.014,
    moveLean: 0.009,
    moveSquash: 0.008,
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
  // Premium actor atlases are NPOT. RepeatWrapping makes those textures
  // incomplete on WebGL1, which leaves the game alive but the actors invisible.
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
  // Do not flash an untextured white quad while the image is decoding.
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
  const sprite = atlasSprite(matthiasAtlasUrl, matthiasFallbackAtlasUrl, 4, 0, [1.77, 2.56]);
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
  else if (firing) setFrame(3);
  else if (running) setFrame(Math.floor(time * 9) % 2 ? 1 : 2);
  else setFrame(0);

  if (running && !crouch) sprite.position.y += Math.abs(runWave) * profile.runBob;
  if (recoil) sprite.position.x -= direction * recoil;
  if (hurt) sprite.position.x -= direction * profile.hurtKick;

  const motionSquash = running && !crouch ? Math.cos(time * profile.runRate * 2) * profile.runSquash : breath;
  sprite.scale.y = baseScaleY * (crouch ? profile.crouchScale : 1) * (1 + motionSquash - (hurt ? 0.035 : 0));
  sprite.material.rotation = running && !crouch
    ? -direction * runWave * profile.runLean
    : firing
      ? direction * 0.018
      : 0;
  tintSprite(sprite, hurt, 0.8);
}

export function createSlugEnemySprite(type = 'pawn') {
  const frame = type === 'knight' ? 1 : type === 'rook' ? 2 : 0;
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
    framesByAction: Object.freeze({ idle: 0, runA: 1, runB: 2, fire: 3 }),
  }),
  enemies: Object.freeze({
    url: enemyAtlasUrl,
    fallbackUrl: enemyFallbackAtlasUrl,
    frames: 3,
    frameWidth: 104,
    frameHeight: 104,
    sourceFacing: 'right',
    frameByType: Object.freeze({ pawn: 0, knight: 1, rook: 2 }),
  }),
  boss: Object.freeze({ url: panzerRookUrl, frames: 1, frameWidth: 192, frameHeight: 192 }),
  weapons: Object.freeze({ url: weaponAtlasUrl, frames: 4, frameWidth: 256, frameHeight: 128 }),
});
