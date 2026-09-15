import * as THREE from 'three';
import pistolPayload from './assets/pawnSlug/matthias_pistol_integrated_v1.b64?raw';
import machinegunPayload from './assets/pawnSlug/matthias_machinegun_integrated_v1.b64?raw';
import shotgunPayload from './assets/pawnSlug/matthias_shotgun_integrated_v1.b64?raw';
import panzerfaustPayload from './assets/pawnSlug/matthias_panzerfaust_integrated_v1.b64?raw';
import {
  configurePawnSlugTexture,
  pawnSlugMatthiasAtlasWindow,
} from './pawnSlugSpriteCore.js';

const PAYLOADS = Object.freeze({
  pistol: pistolPayload,
  machinegun: machinegunPayload,
  shotgun: shotgunPayload,
  panzerfaust: panzerfaustPayload,
});

// The standalone Blender bake deliberately increased authored cell spacing from
// 3.2 to 4.8 world units so rifles and Panzerfaust never bleed into neighbour
// frames. That leaves the figure occupying 2/3 of the previous cell percentage.
// Compensate once, here, so runtime presence stays at the intended Metal-Slug
// hero scale instead of rendering Matthias as a tiny figure inside a large UV cell.
export const PAWN_SLUG_MATTHIAS_INTEGRATED_SCALE = Object.freeze({
  x: 2.655,
  y: 3.84,
  bakeCellCompensation: 1.5,
});

// Inspection of the validated Blender PNGs shows a stable 17px transparent
// gutter below the feet in the dominant idle/run/crouch frames. Anchor the
// sprite at that authored foot line so scaling the quad does not make Matthias
// hover above the collision ground.
export const PAWN_SLUG_MATTHIAS_INTEGRATED_FOOT_ANCHOR = 17 / 96;

export const PAWN_SLUG_MATTHIAS_INTEGRATED_ART = Object.freeze({
  version: 'blender-integrated-v1',
  weapons: Object.freeze(Object.keys(PAYLOADS)),
  sourceFacing: 'left',
  runtimeFacing: 'world-direction-normalized',
  columns: 16,
  rows: 5,
  frameWidth: 96,
  frameHeight: 96,
  separateWeaponOverlay: false,
  runtimeScale: PAWN_SLUG_MATTHIAS_INTEGRATED_SCALE,
  footAnchorY: PAWN_SLUG_MATTHIAS_INTEGRATED_FOOT_ANCHOR,
});

export function pawnSlugIntegratedWeaponId(kind = 'pistol') {
  return Object.hasOwn(PAYLOADS, kind) ? kind : 'pistol';
}

export function pawnSlugIntegratedWeaponAtlasUrl(kind = 'pistol') {
  const id = pawnSlugIntegratedWeaponId(kind);
  return `data:image/webp;base64,${PAYLOADS[id].trim()}`;
}

function applyAtlasWindow(sprite) {
  const atlas = sprite.userData.atlas;
  const texture = atlas?.texture;
  if (!texture) return;
  const animation = sprite.userData.animation;
  // The Blender source sheet faces screen-left. Invert the requested world
  // direction before applying the existing UV mirror contract so runtime +X
  // still means Matthias visibly aims to the right.
  const direction = animation.direction < 0 ? 1 : -1;
  const window = pawnSlugMatthiasAtlasWindow(
    animation.action || 'idle',
    animation.frameIndex || 0,
    direction,
  );
  configurePawnSlugTexture(texture);
  texture.repeat.set(window.repeatX, window.repeatY);
  texture.offset.set(window.offsetX, window.offsetY);
  texture.needsUpdate = true;
}

export function createIntegratedMatthiasSlugSprite(scale = [
  PAWN_SLUG_MATTHIAS_INTEGRATED_SCALE.x,
  PAWN_SLUG_MATTHIAS_INTEGRATED_SCALE.y,
]) {
  const material = new THREE.SpriteMaterial({
    transparent: true,
    alphaTest: 0.05,
    depthWrite: true,
  });
  material.visible = false;

  const sprite = new THREE.Sprite(material);
  sprite.name = 'pawn-slug-matthias-sprite';
  sprite.scale.set(scale[0], scale[1], 1);
  sprite.center.set(0.5, PAWN_SLUG_MATTHIAS_INTEGRATED_FOOT_ANCHOR);
  sprite.userData.motionBaseScaleX = scale[0];
  sprite.userData.motionBaseScaleY = scale[1];
  sprite.userData.motionPhase = Math.random() * Math.PI * 2;
  sprite.userData.pawnSlugIntegratedWeapons = true;
  sprite.userData.atlas = {
    texture: null,
    source: 'loading',
    weapon: null,
    ready: false,
    disposed: false,
    requestId: 0,
    assetVersion: PAWN_SLUG_MATTHIAS_INTEGRATED_ART.version,
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

  function loadWeapon(kind) {
    const atlas = sprite.userData.atlas;
    const weapon = pawnSlugIntegratedWeaponId(kind);
    const requestId = ++atlas.requestId;
    atlas.source = 'loading';
    loader.load(
      pawnSlugIntegratedWeaponAtlasUrl(weapon),
      (texture) => {
        if (atlas.disposed || requestId !== atlas.requestId) {
          texture.dispose?.();
          return;
        }
        configurePawnSlugTexture(texture);
        const previous = atlas.texture;
        atlas.texture = texture;
        atlas.weapon = weapon;
        atlas.source = 'primary';
        atlas.ready = true;
        material.map = texture;
        material.visible = true;
        material.needsUpdate = true;
        applyAtlasWindow(sprite);
        if (previous && previous !== texture) previous.dispose?.();
      },
      undefined,
      () => {
        if (!atlas.disposed && requestId === atlas.requestId) atlas.source = 'failed';
      },
    );
  }

  sprite.userData.setActionFrame = (action, frameIndex) => {
    const animation = sprite.userData.animation;
    const nextFrame = Math.max(0, Math.floor(frameIndex) || 0);
    if (animation.action === action && animation.frameIndex === nextFrame) return;
    animation.action = action || 'idle';
    animation.frameIndex = nextFrame;
    applyAtlasWindow(sprite);
  };

  sprite.userData.setDirection = (dir) => {
    const animation = sprite.userData.animation;
    const direction = dir < 0 ? -1 : 1;
    if (animation.direction === direction) return;
    animation.direction = direction;
    applyAtlasWindow(sprite);
  };

  sprite.userData.setWeapon = (kind) => {
    const weapon = pawnSlugIntegratedWeaponId(kind);
    sprite.userData.animation.weapon = weapon;
    if (sprite.userData.atlas.weapon !== weapon) loadWeapon(weapon);
  };

  loadWeapon('pistol');
  return sprite;
}
