import * as THREE from 'three';
import matthiasAtlasUrl from './assets/pawnSlug/matthias_atlas_v2.webp';
import matthiasFallbackAtlasUrl from './assets/pawnSlug/matthias_atlas.svg';
import enemyAtlasUrl from './assets/pawnSlug/enemy_atlas_v2.webp';
import enemyFallbackAtlasUrl from './assets/pawnSlug/enemy_atlas.svg';
import panzerRookUrl from './assets/pawnSlug/panzer_rook_v2.webp';
import weaponAtlasUrl from './assets/pawnSlug/weapon_atlas.svg';

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
  return sprite;
}

export function createMatthiasSlugSprite() {
  const sprite = atlasSprite(matthiasAtlasUrl, matthiasFallbackAtlasUrl, 4, 0, [1.77, 2.56]);
  sprite.name = 'pawn-slug-matthias-sprite';
  sprite.userData.animation = { clock: 0, weapon: 'pistol' };
  sprite.userData.setWeapon = (kind) => { sprite.userData.animation.weapon = kind || 'pistol'; };
  return sprite;
}

export function animateMatthiasSlugSprite(sprite, { time = 0, running = false, firing = false, crouch = false, hurt = false } = {}) {
  const setFrame = sprite.userData.setFrame;
  if (!setFrame) return;
  if (hurt) setFrame(0);
  else if (firing) setFrame(3);
  else if (running) setFrame(Math.floor(time * 9) % 2 ? 1 : 2);
  else setFrame(0);
  sprite.scale.y = crouch ? 2.02 : 2.56;
  sprite.material.opacity = hurt ? 0.78 : 1;
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
  return sprite;
}

export function animateSlugEnemySprite(sprite, type, time, { moving = false, hurt = false } = {}) {
  sprite.position.y += moving ? Math.abs(Math.sin(time * (type === 'knight' ? 12 : 8))) * 0.008 : 0;
  sprite.material.opacity = hurt ? 0.64 : 1;
}

export function createPanzerRookSprite() {
  const sprite = staticSprite(panzerRookUrl, [4.45, 4.45]);
  sprite.name = 'pawn-slug-panzer-rook-sprite';
  return sprite;
}

export function animatePanzerRookSprite(sprite, time, { hurt = false } = {}) {
  sprite.position.y = Math.sin(time * 1.25) * 0.025;
  sprite.material.opacity = hurt ? 0.7 : 1;
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
