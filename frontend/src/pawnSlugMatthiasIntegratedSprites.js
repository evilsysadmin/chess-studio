import * as THREE from 'three';
import pistolPayload from './assets/pawnSlug/matthias_pistol_premium_v3.b64?raw';
import machinegunPayload from './assets/pawnSlug/matthias_machinegun_premium_v3.b64?raw';
import shotgunPayload from './assets/pawnSlug/matthias_shotgun_premium_v3.b64?raw';
import panzerfaustPayload from './assets/pawnSlug/matthias_panzerfaust_premium_v3.b64?raw';
import canonicalHeadPayload from './assets/pawnSlug/matthias_canonical_head_v1.b64?raw';
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

// Approved canonical-sheet head centres, normalized from the original 96px
// authoring cells and mirrored into the premium bank's screen-left source pose.
// Keeping these tiny anchors separate from the weapon atlas lets the face/cap be
// corrected without repainting four otherwise-good weapon animation banks.
const CANONICAL_HEAD_ANCHORS = Object.freeze({
  idle: Object.freeze([[47.5, 27], [48, 27], [47.5, 27], [48, 27], [47.5, 27], [48, 27], [47.5, 27], [48, 27], [47.5, 27], [48, 27]]),
  walk: Object.freeze([[47, 26], [47, 27], [48, 26], [44, 26], [48, 26], [47, 27], [47, 26], [47, 27], [47, 26], [47, 27]]),
  run: Object.freeze([[41.5, 27], [42, 27], [43, 26], [45, 27], [43, 26], [42, 27], [41.5, 27], [42, 27], [41.5, 27], [42, 27], [43, 26], [44.5, 27], [43, 26], [42, 27], [41.5, 27], [42, 27]]),
  crouch: Object.freeze([[48.5, 46], [48.5, 46], [48.5, 46], [48.5, 46], [48.5, 46], [48.5, 46], [48.5, 46], [48.5, 46], [48.5, 46], [48.5, 46]]),
  jump: Object.freeze([[42, 30], [43.5, 30], [45.5, 31], [43.5, 30], [42, 30], [42, 30], [42, 30], [43.5, 30], [42, 30]]),
});

const CANONICAL_HEAD_SCALE = Object.freeze([64 / 96, 0.558]);

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

export const PAWN_SLUG_MATTHIAS_CANONICAL_HEAD_ART = Object.freeze({
  version: 'canonical-head-v1',
  source: 'approved-canonical-matthias-sheet',
  purpose: 'face-and-officer-cap-authority',
  sourceFacing: 'left',
  weaponIndependent: true,
  textureWidth: 64,
  textureHeight: 56,
  spriteScale: CANONICAL_HEAD_SCALE,
});

export const PAWN_SLUG_MATTHIAS_BROWSER_RENDER_CONTRACT = 'data-pawn-slug-matthias-visual';

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
  // Keep the authored-atlas revision as the asset version. The visual identity
  // has its own independent version so canon changes cannot invalidate runtime
  // consumers that key compatibility checks off the Blender atlas revision.
  version: 'blender-premium-v3',
  atlasRevision: 'blender-premium-v3',
  canonicalIdentity: PAWN_SLUG_MATTHIAS_CANONICAL_IDENTITY,
  canonicalHeadArt: PAWN_SLUG_MATTHIAS_CANONICAL_HEAD_ART,
  browserRenderContract: PAWN_SLUG_MATTHIAS_BROWSER_RENDER_CONTRACT,
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

export function pawnSlugCanonicalHeadAtlasUrl() {
  return `data:image/webp;base64,${canonicalHeadPayload.trim()}`;
}

export function pawnSlugCanonicalHeadPose(action = 'idle', frameIndex = 0, worldDirection = 1) {
  const track = ACTIONS[action] || ACTIONS.idle;
  const safeAction = ACTIONS[action] ? action : 'idle';
  const frame = ((Math.floor(frameIndex) % track.count) + track.count) % track.count;
  const anchor = (CANONICAL_HEAD_ANCHORS[safeAction] || CANONICAL_HEAD_ANCHORS.idle)[frame] || CANONICAL_HEAD_ANCHORS.idle[0];
  const sourceX = (anchor[0] / 96) - 0.5;
  const mirrored = worldDirection >= 0;
  return Object.freeze({
    action: safeAction,
    frameIndex: frame,
    mirrored,
    x: mirrored ? -sourceX : sourceX,
    y: (1 - PAWN_SLUG_MATTHIAS_PREMIUM_RUNTIME.footAnchorY) - (anchor[1] / 96),
    scaleX: CANONICAL_HEAD_SCALE[0],
    scaleY: CANONICAL_HEAD_SCALE[1],
  });
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

export function pawnSlugCanonicalMatthiasRenderStatus(sprite) {
  const atlas = sprite?.userData?.atlas;
  const head = sprite?.userData?.canonicalHead;
  const headSprite = head?.sprite;
  const bodyReady = atlas?.ready === true
    && atlas?.source === 'primary'
    && sprite?.material?.visible === true
    && sprite?.material?.map === atlas?.texture;
  const headReady = head?.ready === true
    && head?.source === 'canonical'
    && headSprite?.material?.visible === true
    && headSprite?.material?.map === head?.texture;
  const identityLocked = sprite?.userData?.pawnSlugCanonicalMatthias === true
    && sprite?.userData?.pawnSlugCanonicalIdentity === PAWN_SLUG_MATTHIAS_CANONICAL_IDENTITY;
  const attached = Boolean(sprite?.parent && headSprite?.parent === sprite);
  return `${bodyReady ? 'premium-body' : 'body-pending'}:${headReady ? 'canonical-head' : 'head-pending'}:${identityLocked ? 'identity-locked' : 'identity-missing'}:${attached ? 'attached' : 'detached'}`;
}

function publishCanonicalMatthiasRenderStatus(sprite) {
  if (typeof document === 'undefined') return;
  const stage = document.querySelector?.('[data-pawn-slug-renderer="three"]');
  if (!stage?.dataset) return;
  const status = pawnSlugCanonicalMatthiasRenderStatus(sprite);
  if (stage.dataset.pawnSlugMatthiasVisual !== status) stage.dataset.pawnSlugMatthiasVisual = status;
}

function applyBodyAtlasWindow(sprite) {
  const texture = sprite.userData.atlas?.texture;
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

function applyCanonicalHeadPose(sprite) {
  const head = sprite.userData.canonicalHead;
  const headSprite = head?.sprite;
  if (!headSprite) return;
  const animation = sprite.userData.animation;
  const pose = pawnSlugCanonicalHeadPose(
    animation.action || 'idle',
    animation.frameIndex || 0,
    animation.direction || 1,
  );
  headSprite.position.set(pose.x, pose.y, 0.002);
  headSprite.scale.set(pose.scaleX, pose.scaleY, 1);
  if (head.texture) {
    configurePawnSlugTexture(head.texture);
    head.texture.repeat.set(pose.mirrored ? -1 : 1, 1);
    head.texture.offset.set(pose.mirrored ? 1 : 0, 0);
    head.texture.needsUpdate = true;
  }
}

function applyVisualPose(sprite) {
  applyBodyAtlasWindow(sprite);
  applyCanonicalHeadPose(sprite);
  publishCanonicalMatthiasRenderStatus(sprite);
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
  sprite.userData.canonicalHead = {
    texture: null,
    source: 'loading',
    ready: false,
    assetVersion: PAWN_SLUG_MATTHIAS_CANONICAL_HEAD_ART.version,
    sprite: null,
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

  // Weapon-specific v3 banks stay authoritative for body, hands and gun. This
  // small child sprite replaces only the recognisable head: canonical spherical
  // face + officer cap. That avoids repainting or de-synchronising weapon poses.
  const canonicalHeadMaterial = new THREE.SpriteMaterial({
    transparent: true,
    alphaTest: 0.05,
    depthWrite: false,
  });
  canonicalHeadMaterial.visible = false;
  const canonicalHeadSprite = new THREE.Sprite(canonicalHeadMaterial);
  canonicalHeadSprite.name = 'pawn-slug-matthias-canonical-head';
  canonicalHeadSprite.center.set(0.5, 0.5);
  canonicalHeadSprite.renderOrder = 1;
  canonicalHeadSprite.userData.pawnSlugCanonicalHeadOverlay = true;
  sprite.add(canonicalHeadSprite);
  sprite.userData.canonicalHead.sprite = canonicalHeadSprite;
  applyCanonicalHeadPose(sprite);

  const loader = new THREE.TextureLoader();

  function loadCanonicalHead() {
    const head = sprite.userData.canonicalHead;
    loader.load(
      pawnSlugCanonicalHeadAtlasUrl(),
      (texture) => {
        if (sprite.userData.atlas.disposed) {
          texture.dispose?.();
          return;
        }
        configurePawnSlugTexture(texture);
        head.texture = texture;
        head.source = 'canonical';
        head.ready = true;
        canonicalHeadMaterial.map = texture;
        canonicalHeadMaterial.visible = true;
        canonicalHeadMaterial.needsUpdate = true;
        applyCanonicalHeadPose(sprite);
        publishCanonicalMatthiasRenderStatus(sprite);
      },
      undefined,
      () => {
        if (!sprite.userData.atlas.disposed) head.source = 'failed';
        publishCanonicalMatthiasRenderStatus(sprite);
      },
    );
  }

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
        applyBodyAtlasWindow(sprite);
        publishCanonicalMatthiasRenderStatus(sprite);
        if (previous && previous !== texture) previous.dispose?.();
      },
      undefined,
      () => {
        if (!atlas.disposed && requestId === atlas.requestId) atlas.source = 'failed';
        publishCanonicalMatthiasRenderStatus(sprite);
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
    applyVisualPose(sprite);
  };

  sprite.userData.setDirection = (dir) => {
    const animation = sprite.userData.animation;
    const direction = dir < 0 ? -1 : 1;
    if (animation.direction === direction) return;
    animation.direction = direction;
    applyVisualPose(sprite);
  };

  sprite.userData.setWeapon = (kind) => {
    const weapon = pawnSlugIntegratedWeaponId(kind);
    sprite.userData.animation.weapon = weapon;
    if (sprite.userData.atlas.weapon !== weapon) loadWeapon(weapon);
  };

  loadWeapon('pistol');
  loadCanonicalHead();
  return sprite;
}
