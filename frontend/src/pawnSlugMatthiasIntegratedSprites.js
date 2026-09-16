import * as THREE from 'three';
import { PAWN_SLUG_CANONICAL_HANDOFF, pawnSlugCanonicalPistolAtlasUrl, pawnSlugCanonicalPistolWindow } from './pawnSlugCanonicalHandoff.js';
import machinegunPayload from './assets/pawnSlug/matthias_machinegun_premium_v3.b64?raw';
import shotgunPayload from './assets/pawnSlug/matthias_shotgun_premium_v3.b64?raw';
import panzerfaustPayload from './assets/pawnSlug/matthias_panzerfaust_premium_v3.b64?raw';
import canonicalMotionPayload from './assets/pawnSlug/matthias_motion_atlas_v5_payload.b64?raw';
import { configurePawnSlugTexture } from './pawnSlugSpriteCore.js';
import { r2AssetUrl } from './r2Assets.js';

const PAYLOADS = Object.freeze({
  pistol: null,
  machinegun: machinegunPayload,
  shotgun: shotgunPayload,
  panzerfaust: panzerfaustPayload,
});

export const PAWN_SLUG_MATTHIAS_R2_ASSETS = Object.freeze({
  canonicalMaster: 'pawnSlug.matthias.canonicalMaster',
  pistol: 'pawnSlug.matthias.pistol',
  machinegun: 'pawnSlug.matthias.machinegun',
  shotgun: 'pawnSlug.matthias.shotgun',
  panzerfaust: 'pawnSlug.matthias.panzerfaust',
  motion: 'pawnSlug.matthias.motion',
});

const ACTIONS = Object.freeze({
  idle: Object.freeze({ row: 0, count: 10 }),
  walk: Object.freeze({ row: 1, count: 10 }),
  run: Object.freeze({ row: 2, count: 16 }),
  crouch: Object.freeze({ row: 3, count: 10 }),
  jump: Object.freeze({ row: 4, count: 9 }),
});

const PREMIUM_ATLAS = Object.freeze({
  width: 3072,
  height: 960,
  frameWidth: 192,
  frameHeight: 192,
  guardTexels: 2,
});

const CANONICAL_ATLAS = Object.freeze({
  width: 1536,
  height: 480,
  frameWidth: 96,
  frameHeight: 96,
});

// Tight, one-pixel-padded head/cap/neck rectangles measured from the approved
// 96px Matthias motion sheet. The source sheet faces screen-right. Cropping the
// real frame instead of moving one static portrait preserves cap tilt, face
// silhouette and neckline for every idle/walk/run/crouch/jump pose.
const CANONICAL_HEAD_RECTS = Object.freeze({
  idle: Object.freeze([
    [29, 4, 38, 45], [29, 4, 39, 45], [29, 4, 38, 45], [29, 4, 39, 45],
    [29, 4, 38, 45], [29, 4, 39, 45], [29, 4, 38, 45], [29, 4, 39, 45],
    [29, 4, 38, 45], [29, 4, 39, 45],
  ]),
  walk: Object.freeze([
    [26, 4, 47, 44], [26, 4, 45, 45], [25, 4, 46, 44], [31, 4, 41, 44],
    [25, 4, 46, 44], [26, 4, 45, 45], [26, 4, 47, 44], [26, 4, 45, 45],
    [26, 4, 47, 44], [26, 4, 45, 45],
  ]),
  run: Object.freeze([
    [31, 4, 48, 45], [30, 4, 48, 45], [28, 4, 49, 44], [29, 4, 45, 45],
    [28, 4, 49, 44], [30, 4, 48, 45], [31, 4, 48, 45], [30, 4, 48, 45],
    [31, 4, 48, 45], [30, 4, 48, 45], [28, 4, 49, 44], [29, 4, 45, 45],
    [28, 4, 49, 44], [30, 4, 48, 45], [31, 4, 48, 45], [30, 4, 48, 45],
  ]),
  crouch: Object.freeze([
    [28, 23, 40, 45], [27, 23, 41, 45], [28, 23, 40, 45], [27, 23, 41, 45],
    [28, 23, 40, 45], [27, 23, 41, 45], [28, 23, 40, 45], [27, 23, 41, 45],
    [28, 23, 40, 45], [27, 23, 41, 45],
  ]),
  jump: Object.freeze([
    [30, 7, 48, 45], [28, 7, 49, 45], [28, 7, 46, 46], [28, 7, 49, 45],
    [30, 7, 48, 45], [30, 7, 49, 45], [30, 7, 48, 45], [28, 7, 49, 45],
    [30, 7, 48, 45],
  ]),
});

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
  version: 'canonical-head-motion-v2',
  source: 'existing-matthias-motion-atlas-v5',
  purpose: 'frame-specific-face-cap-neck-authority',
  sourceFacing: 'right',
  weaponIndependent: true,
  frameSpecific: true,
  reusesExistingAtlas: true,
  textureWidth: CANONICAL_ATLAS.width,
  textureHeight: CANONICAL_ATLAS.height,
  frameWidth: CANONICAL_ATLAS.frameWidth,
  frameHeight: CANONICAL_ATLAS.frameHeight,
});

export const PAWN_SLUG_MATTHIAS_BROWSER_RENDER_CONTRACT = 'data-pawn-slug-matthias-visual';

export const PAWN_SLUG_MATTHIAS_PREMIUM_RUNTIME = Object.freeze({
  scale: Object.freeze([2.08, 3.0]),
  authoredBottomGutterPx: 24,
  footAnchorY: 24 / 192,
  visibleStandingHeightPx: Object.freeze([127, 128]),
  uvGuardTexels: PREMIUM_ATLAS.guardTexels,
});

export const PAWN_SLUG_MATTHIAS_INTEGRATED_ART = Object.freeze({
  version: 'blender-premium-v3',
  atlasRevision: 'blender-premium-v3',
  canonicalHandoff: PAWN_SLUG_CANONICAL_HANDOFF,
  canonicalIdentity: PAWN_SLUG_MATTHIAS_CANONICAL_IDENTITY,
  canonicalHeadArt: PAWN_SLUG_MATTHIAS_CANONICAL_HEAD_ART,
  browserRenderContract: PAWN_SLUG_MATTHIAS_BROWSER_RENDER_CONTRACT,
  r2Assets: PAWN_SLUG_MATTHIAS_R2_ASSETS,
  weapons: Object.freeze(Object.keys(PAYLOADS)),
  sourceFacing: 'left',
  runtimeFacing: 'world-direction-normalized',
  columns: 16,
  rows: 5,
  frameWidth: PREMIUM_ATLAS.frameWidth,
  frameHeight: PREMIUM_ATLAS.frameHeight,
  footAnchorY: PAWN_SLUG_MATTHIAS_PREMIUM_RUNTIME.footAnchorY,
  separateWeaponOverlay: false,
});

function normalizedActionFrame(action = 'idle', frameIndex = 0) {
  const safeAction = ACTIONS[action] ? action : 'idle';
  const track = ACTIONS[safeAction];
  const frame = ((Math.floor(frameIndex) % track.count) + track.count) % track.count;
  return { safeAction, track, frame };
}

function canonicalHeadRect(action = 'idle', frameIndex = 0) {
  const { safeAction, track, frame } = normalizedActionFrame(action, frameIndex);
  const rects = CANONICAL_HEAD_RECTS[safeAction] || CANONICAL_HEAD_RECTS.idle;
  const rect = rects[frame] || rects[0];
  return { safeAction, track, frame, rect };
}

function bundledWebpPayload(payload) {
  return `data:image/webp;base64,${payload.trim()}`;
}

export function pawnSlugIntegratedWeaponId(kind = 'pistol') {
  return Object.hasOwn(PAYLOADS, kind) ? kind : 'pistol';
}

export function pawnSlugIntegratedWeaponAtlasUrl(kind = 'pistol') {
  const id = pawnSlugIntegratedWeaponId(kind);
  const fallback = id === 'pistol'
    ? pawnSlugCanonicalPistolAtlasUrl
    : bundledWebpPayload(PAYLOADS[id]);
  return r2AssetUrl(PAWN_SLUG_MATTHIAS_R2_ASSETS[id], fallback);
}

export function pawnSlugCanonicalHeadAtlasUrl() {
  return r2AssetUrl(
    PAWN_SLUG_MATTHIAS_R2_ASSETS.motion,
    bundledWebpPayload(canonicalMotionPayload),
  );
}

export function pawnSlugPremiumMatthiasAtlasWindow(action = 'idle', frameIndex = 0, worldDirection = 1) {
  const { safeAction, track, frame } = normalizedActionFrame(action, frameIndex);
  const guard = PREMIUM_ATLAS.guardTexels;
  const guardedWidth = PREMIUM_ATLAS.frameWidth - guard * 2;
  const guardedHeight = PREMIUM_ATLAS.frameHeight - guard * 2;
  const leftEdge = frame * PREMIUM_ATLAS.frameWidth + guard;
  const rightEdge = (frame + 1) * PREMIUM_ATLAS.frameWidth - guard;
  const bottomEdge = PREMIUM_ATLAS.height - ((track.row + 1) * PREMIUM_ATLAS.frameHeight) + guard;

  // Premium v3 weapon banks are authored screen-left.
  const mirrored = worldDirection >= 0;
  return Object.freeze({
    action: safeAction,
    frameIndex: frame,
    row: track.row,
    mirrored,
    repeatX: (mirrored ? -1 : 1) * (guardedWidth / PREMIUM_ATLAS.width),
    repeatY: guardedHeight / PREMIUM_ATLAS.height,
    offsetX: (mirrored ? rightEdge : leftEdge) / PREMIUM_ATLAS.width,
    offsetY: bottomEdge / PREMIUM_ATLAS.height,
  });
}

export function pawnSlugCanonicalHeadAtlasWindow(action = 'idle', frameIndex = 0, worldDirection = 1) {
  const { safeAction, track, frame, rect } = canonicalHeadRect(action, frameIndex);
  const [x, y, width, height] = rect;
  const leftEdge = frame * CANONICAL_ATLAS.frameWidth + x;
  const rightEdge = leftEdge + width;
  const bottomEdge = CANONICAL_ATLAS.height - (
    track.row * CANONICAL_ATLAS.frameHeight + y + height
  );

  // The existing canonical sheet is authored screen-right, the opposite of the
  // premium weapon banks. Mirror it only when Matthias faces left in the world.
  const mirrored = worldDirection < 0;
  return Object.freeze({
    action: safeAction,
    frameIndex: frame,
    row: track.row,
    rect: Object.freeze([...rect]),
    mirrored,
    repeatX: (mirrored ? -1 : 1) * (width / CANONICAL_ATLAS.width),
    repeatY: height / CANONICAL_ATLAS.height,
    offsetX: (mirrored ? rightEdge : leftEdge) / CANONICAL_ATLAS.width,
    offsetY: bottomEdge / CANONICAL_ATLAS.height,
  });
}

export function pawnSlugCanonicalHeadPose(action = 'idle', frameIndex = 0, worldDirection = 1) {
  const { safeAction, frame, rect } = canonicalHeadRect(action, frameIndex);
  const [x, y, width, height] = rect;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const sourceX = (centerX / CANONICAL_ATLAS.frameWidth) - 0.5;
  const facingRight = worldDirection >= 0;
  return Object.freeze({
    action: safeAction,
    frameIndex: frame,
    mirrored: !facingRight,
    x: facingRight ? sourceX : -sourceX,
    y: (1 - PAWN_SLUG_MATTHIAS_PREMIUM_RUNTIME.footAnchorY)
      - (centerY / CANONICAL_ATLAS.frameHeight),
    scaleX: width / CANONICAL_ATLAS.frameWidth,
    scaleY: height / CANONICAL_ATLAS.frameHeight,
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
  const bakedHead = atlas?.weapon === 'pistol' && bodyReady;
  const headReady = bakedHead || head?.ready === true
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
  const atlasWindow = sprite.userData.atlas.weapon === 'pistol'
    ? pawnSlugCanonicalPistolWindow : pawnSlugPremiumMatthiasAtlasWindow;
  const window = atlasWindow(
    sprite.userData.atlas.weapon === 'pistol' && animation.firing && animation.action !== 'crouch'
      ? 'idle' : animation.action || 'idle',
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
  headSprite.material.visible = head.ready && sprite.userData.atlas.ready && sprite.userData.atlas.weapon !== 'pistol';
  const animation = sprite.userData.animation;
  const pose = pawnSlugCanonicalHeadPose(
    animation.action || 'idle',
    animation.frameIndex || 0,
    animation.direction || 1,
  );
  headSprite.position.set(pose.x, pose.y, 0.002);
  headSprite.scale.set(pose.scaleX, pose.scaleY, 1);

  if (head.texture) {
    const window = pawnSlugCanonicalHeadAtlasWindow(
      animation.action || 'idle',
      animation.frameIndex || 0,
      animation.direction || 1,
    );
    configurePawnSlugTexture(head.texture);
    head.texture.repeat.set(window.repeatX, window.repeatY);
    head.texture.offset.set(window.offsetX, window.offsetY);
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
  canonicalHeadSprite.userData.pawnSlugFrameSpecificHeadCrop = true;
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
    atlas.ready = false;
    material.visible = false;
    canonicalHeadMaterial.visible = false;
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
        atlas.assetVersion = weapon === 'pistol' ? PAWN_SLUG_CANONICAL_HANDOFF.version : PAWN_SLUG_MATTHIAS_INTEGRATED_ART.version;
        atlas.atlasRevision = atlas.assetVersion;
        atlas.source = 'primary';
        atlas.ready = true;
        material.map = texture;
        material.visible = true;
        material.needsUpdate = true;
        applyVisualPose(sprite);
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
    const { safeAction: nextAction, frame: nextFrame } = normalizedActionFrame(action, frameIndex);
    if (animation.action === nextAction && animation.frameIndex === nextFrame) return;
    animation.action = nextAction;
    animation.frameIndex = nextFrame;
    applyVisualPose(sprite);
  };

  sprite.userData.setFiring = (firing) => {
    const active = Boolean(firing);
    if (sprite.userData.animation.firing === active) return;
    sprite.userData.animation.firing = active;
    applyBodyAtlasWindow(sprite);
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
    if (sprite.userData.atlas.requestedWeapon !== weapon || sprite.userData.atlas.source === 'failed') {
      sprite.userData.atlas.requestedWeapon = weapon;
      loadWeapon(weapon);
    }
  };

  sprite.userData.atlas.requestedWeapon = 'pistol';
  loadWeapon('pistol');
  loadCanonicalHead();
  return sprite;
}
