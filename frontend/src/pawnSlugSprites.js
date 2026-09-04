import * as THREE from 'three';
import matthiasAtlasUrl from './assets/pawnSlug/matthias_atlas.svg';
import enemyAtlasUrl from './assets/pawnSlug/enemy_atlas.svg';
import panzerRookUrl from './assets/pawnSlug/panzer_rook.svg';
import weaponAtlasUrl from './assets/pawnSlug/weapon_atlas.svg';

function configureTexture(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function atlasSprite(url, frames, initialFrame = 0, scale = [2.2, 2.2]) {
  const texture = configureTexture(new THREE.TextureLoader().load(url));
  texture.repeat.set(1 / frames, 1);
  texture.offset.set(initialFrame / frames, 0);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.05, depthWrite: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale[0], scale[1], 1);
  sprite.center.set(0.5, 0);
  sprite.userData.atlas = { frames, frame: initialFrame, texture };
  sprite.userData.setFrame = (frame) => {
    const next = ((Math.floor(frame) % frames) + frames) % frames;
    if (sprite.userData.atlas.frame === next) return;
    sprite.userData.atlas.frame = next;
    texture.offset.x = next / frames;
  };
  return sprite;
}

function staticSprite(url, scale = [4, 2.2]) {
  const texture = configureTexture(new THREE.TextureLoader().load(url));
  texture.wrapS = THREE.ClampToEdgeWrapping;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.04, depthWrite: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale[0], scale[1], 1);
  sprite.center.set(0.5, 0);
  sprite.userData.texture = texture;
  return sprite;
}

export function createMatthiasSlugSprite() {
  const sprite = atlasSprite(matthiasAtlasUrl, 4, 0, [2.25, 2.25]);
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
  sprite.scale.y = crouch ? 1.78 : 2.25;
  sprite.material.opacity = hurt ? 0.78 : 1;
}

export function createSlugEnemySprite(type = 'pawn') {
  const frame = type === 'knight' ? 1 : type === 'rook' ? 2 : 0;
  const scaleByType = {
    pawn: [1.78, 1.78],
    knight: [1.96, 1.96],
    rook: [2.18, 2.18],
  };
  const sprite = atlasSprite(enemyAtlasUrl, 3, frame, scaleByType[type] || scaleByType.pawn);
  sprite.name = `pawn-slug-${type}-sprite`;
  sprite.userData.enemyFrame = frame;
  return sprite;
}

export function animateSlugEnemySprite(sprite, type, time, { moving = false, hurt = false } = {}) {
  sprite.position.y += moving ? Math.abs(Math.sin(time * (type === 'knight' ? 12 : 8))) * 0.008 : 0;
  sprite.material.opacity = hurt ? 0.64 : 1;
}

export function createPanzerRookSprite() {
  const sprite = staticSprite(panzerRookUrl, [5.1, 2.55]);
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
  const sprite = atlasSprite(weaponAtlasUrl, 4, frame, kind === 'panzerfaust' ? [1.55, .78] : [1.35, .68]);
  sprite.name = `pawn-slug-weapon-${kind}`;
  return sprite;
}

export function disposePawnSlugSprite(sprite) {
  if (!sprite) return;
  const texture = sprite.userData?.atlas?.texture || sprite.userData?.texture || sprite.material?.map;
  texture?.dispose?.();
  sprite.material?.dispose?.();
}

export const PAWN_SLUG_SPRITE_META = Object.freeze({
  matthias: Object.freeze({
    url: matthiasAtlasUrl,
    frames: 4,
    frameWidth: 256,
    frameHeight: 256,
    sourceFacing: 'right',
    framesByAction: Object.freeze({ idle: 0, runA: 1, runB: 2, fire: 3 }),
  }),
  enemies: Object.freeze({
    url: enemyAtlasUrl,
    frames: 3,
    frameWidth: 256,
    frameHeight: 256,
    sourceFacing: 'right',
    frameByType: Object.freeze({ pawn: 0, knight: 1, rook: 2 }),
  }),
  boss: Object.freeze({ url: panzerRookUrl, frames: 1, frameWidth: 512, frameHeight: 256 }),
  weapons: Object.freeze({ url: weaponAtlasUrl, frames: 4, frameWidth: 256, frameHeight: 128 }),
});
