import * as THREE from 'three';
import pistolPayload from './assets/pawnSlug/matthias_pistol_premium_v3.b64?raw';
import machinegunPayload from './assets/pawnSlug/matthias_machinegun_premium_v3.b64?raw';
import shotgunPayload from './assets/pawnSlug/matthias_shotgun_premium_v3.b64?raw';
import panzerfaustPayload from './assets/pawnSlug/matthias_panzerfaust_premium_v3.b64?raw';
import { configurePawnSlugTexture } from './pawnSlugSpriteCore.js';

const PAYLOADS = Object.freeze({
  pistol: pistolPayload,
  machinegun: machinegunPayload,
  shotgun: shotgunPayload,
  panzerfaust: panzerfaustPayload,
});

const ACTIONS = Object.freeze({
  idle: Object.freeze({ row: 0, count: 10 }),
  walk: Object.freeze({ row: 1, count: 10 }),
  run: Object.freeze({ row: 2, count: 16 }),
  crouch: Object.freeze({ row: 3, count: 10 }),
  jump: Object.freeze({ row: 4, count: 9 }),
});

const ATLAS = Object.freeze({
  width: 3072,
  height: 960,
  frameWidth: 192,
  frameHeight: 192,
  guardTexels: 2,
});

// Pawn Slug deliberately uses Matthias as a HUMAN tactical soldier. His face is
// still the canonical spherical Matthias face and he keeps the officer cap that
// makes him recognisable across Chess Studio. The pawn silhouette belongs to
// chess surfaces, not to this Metal-Slug-like experiment.
export const PAWN_SLUG_MATTHIAS_CANONICAL_IDENTITY = Object.freeze({
  version: 'pawn-slug-matthias-canon-v1',
  bodyForm: 'human-tactical-soldier',
  uniform: 'black-tactical',
  face: 'canonical-matthias-spherical-pawn-face',
  headgear: 'canonical-black-officer-cap',
  expression: 'stern-matthias',
  forbiddenBodyForms: Object.freeze(['chess-pawn-body']),
  forbiddenFaces: Object.freeze(['generic-human-face']),
});

export const PAWN_SLUG_MATTHIAS_PREMIUM_RUNTIME = Object.freeze({
  // The approved canonical bank keeps the v3 authored footprint: ~127-128
  // visible standing pixels inside each 192px cell. Runtime scale/hitboxes stay
  // unchanged while the identity contract above prevents visual regressions.
  scale: Object.freeze([2.08, 3.0]),
  authoredBottomGutterPx: 24,
  footAnchorY: 24 / 192,
  visibleStandingHeightPx: Object.freeze([127, 128]),
  uvGuardTexels: ATLAS.guardTexels,
});

export const PAWN_SLUG_MATTHIAS_INTEGRATED_ART = Object.freeze({
  version: 'canonical-soldier-v1',
  atlasRevision: 'blender-premium-v3',
  canonicalIdentity: PAWN_SLUG_MATTHIAS_CANONICAL_IDENTITY,
  weapons: Object.freeze(Object.keys(PAYLOADS)),
  sourceFacing: 'left',
  runtimeFacing: 'world-direction-normalized',
  columns: 16,
  rows: 5,
  frameWidth: ATLAS.frameWidth,
  frameHeight: ATLAS.frameHeight,
  footAnchorY: PAWN_SLUG_MATTHIAS_PREMIUM_RUNTIME.footAnchorY,
  separateWeaponOverlay: false,
});

export function pawnSlugIntegratedWeaponId(kind = 'pistol') {
  return Object.hasOwn(PAYLOADS, kind) ? kind : 'pistol';
}

export function pawnSlugIntegratedWeaponAtlasUrl(kind = 'pistol') {
  const id = pawnSlugIntegratedWeaponId(kind);
  return `data:image/webp;base64,${PAYLOADS[id].trim()}`;
}

export function pawnSlugPremiumMatthiasAtlasWindow(action = 'idle', frameIndex = 0, worldDirection = 1) {
  const track = ACTIONS[action] || ACTIONS.idle;
  const safeAction = ACTIONS[action] ? action : 'idle';
  const frame = ((Math.floor(frameIndex) % track.count) + track.count) % track.count;
  const guard = ATLAS.guardTexels;
  const guardedWidth = ATLAS.frameWidth - guard * 2;
  const guardedHeight = ATLAS.frameHeight - guard * 2;
  const leftEdge = frame * ATLAS.frameWidth + guard;
  const rightEdge = (frame + 1) * ATLAS.frameWidth - guard;
  const bottomEdge = ATLAS.height - ((track.row + 1) * ATLAS.frameHeight) + guard;

  // Blender authors every premium bank facing screen-left. Mirror only when the
  // game asks Matthias to face right; this keeps runtime direction semantics
  // independent from how the atlas was rendered.
  const mirrored = worldDirection >= 0;
  return Object.freeze({
    action: safeAction,
    frameIndex: frame,
    row: track.row,
    mirrored,
    repeatX: (mirrored ? -1 : 1) * (guardedWidth / ATLAS.width),
    repeatY: guardedHeight / ATLAS.height,
    offsetX: (mirrored ? rightEdge : leftEdge) / ATLAS.width,
    offsetY: bottomEdge / ATLAS.height,
  });
}

function applyAtlasWindow(sprite) {
  const atlas = sprite.userData.atlas;
  const texture = atlas?.texture;
  if (!texture) return;
  const animation = sprite.userData.animation;
  const window = pawnSlugPremiumMatthiasAtlasWindow(
    animation.action || 'idle',
    animation.frameIndex || 0,
    animation.direction || 1,
  );
  configurePawnSlugTexture(texture);
  texture.repeat.set(window.repeatX, window.repeatY);
  texture.offset.set(window.offsetX, window.offsetY);
  texture.needsUpdate = true;
}

export function createIntegratedMatthiasSlugSprite(scale = PAWN_SLUG_MATTHIAS_PREMIUM_RUNTIME.scale) {
  const material = new THREE.SpriteMaterial({
    transparent: true,
    alphaTest: 0.05,
    depthWrite: true,
  });
  material.visible = false;

  const sprite = new THREE.Sprite(material);
  sprite.name = 'pawn-slug-matthias-sprite';
  sprite.scale.set(scale[0], scale[1], 1);
  // Align authored feet rather than the transparent bottom of the 192px cell to
  // the runtime ground line. v3 keeps the same 12.5% authored foot gutter.
  sprite.center.set(0.5, PAWN_SLUG_MATTHIAS_PREMIUM_RUNTIME.footAnchorY);
  sprite.userData.motionBaseScaleX = scale[0];
  sprite.userData.motionBaseScaleY = scale[1];
  sprite.userData.motionPhase = Math.random() * Math.PI * 2;
  sprite.userData.pawnSlugIntegratedWeapons = true;
  sprite.userData.pawnSlugPremiumMatthias = true;
  sprite.userData.pawnSlugCanonicalMatthias = true;
  sprite.userData.pawnSlugCanonicalIdentity = PAWN_SLUG_MATTHIAS_CANONICAL_IDENTITY;
  sprite.userData.atlas = {
    texture: null,
    source: 'loading',
    weapon: null,
    ready: false,
    disposed: false,
    requestId: 0,
    assetVersion: PAWN_SLUG_MATTHIAS_INTEGRATED_ART.version,
    atlasRevision: PAWN_SLUG_MATTHIAS_INTEGRATED_ART.atlasRevision,
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
    const nextAction = ACTIONS[action] ? action : 'idle';
    const count = ACTIONS[nextAction].count;
    const nextFrame = ((Math.floor(frameIndex) % count) + count) % count;
    if (animation.action === nextAction && animation.frameIndex === nextFrame) return;
    animation.action = nextAction;
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
