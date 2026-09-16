import * as THREE from 'three';
import { configurePawnSlugTexture } from './pawnSlugSpriteCore.js';
import { r2AssetUrl } from './r2Assets.js';

const PISTOL_SHOOT_LOGICAL_ID = 'pawnSlug.matthias.pistolShoot';
const PISTOL_SHOOT_FRAME_WIDTH = 192;
const PISTOL_SHOOT_FRAME_HEIGHT = 192;
const PISTOL_SHOOT_FRAMES = 2;
const PISTOL_SHOOT_GUARD_TEXELS = 2;
const PISTOL_SHOOT_WIDTH = PISTOL_SHOOT_FRAME_WIDTH * PISTOL_SHOOT_FRAMES;
const PISTOL_SHOOT_HEIGHT = PISTOL_SHOOT_FRAME_HEIGHT;

export const PAWN_SLUG_MATTHIAS_AUTHORED_MOTION = Object.freeze({
  version: 'canonical-authored-motion-v1',
  canonicalPistolRun: Object.freeze({
    frameCount: 4,
    frameRate: 8,
    purpose: 'make-the-four-real-canonical-run-poses-readable-at-runtime',
  }),
  pistolShoot: Object.freeze({
    logicalId: PISTOL_SHOOT_LOGICAL_ID,
    sourceFacing: 'right',
    frameCount: PISTOL_SHOOT_FRAMES,
    frameWidth: PISTOL_SHOOT_FRAME_WIDTH,
    frameHeight: PISTOL_SHOOT_FRAME_HEIGHT,
    holdSeconds: 0.18,
    secondFrameAtSeconds: 0.075,
    authoredBottomGutterPx: 24,
    purpose: 'real-canonical-shoot-poses-derived-from-r2-master-without-git-binaries',
  }),
});

function wrapFrame(frame, count) {
  const safeCount = Math.max(1, Math.floor(Number(count) || 1));
  return ((Math.floor(Number(frame) || 0) % safeCount) + safeCount) % safeCount;
}

export function pawnSlugMatthiasCanonicalRunFrame(time = 0, runStartedAt = 0) {
  const elapsed = Math.max(0, (Number(time) || 0) - (Number(runStartedAt) || 0));
  return wrapFrame(
    Math.floor(elapsed * PAWN_SLUG_MATTHIAS_AUTHORED_MOTION.canonicalPistolRun.frameRate),
    PAWN_SLUG_MATTHIAS_AUTHORED_MOTION.canonicalPistolRun.frameCount,
  );
}

export function pawnSlugMatthiasPistolShootFrame(ageSeconds = 0) {
  const age = Math.max(0, Number(ageSeconds) || 0);
  return age < PAWN_SLUG_MATTHIAS_AUTHORED_MOTION.pistolShoot.secondFrameAtSeconds ? 0 : 1;
}

export function pawnSlugMatthiasPistolShootWindow(frameIndex = 0, direction = 1) {
  const frame = wrapFrame(frameIndex, PISTOL_SHOOT_FRAMES);
  const mirrored = Number(direction) < 0;
  const guard = PISTOL_SHOOT_GUARD_TEXELS;
  const guardedWidth = PISTOL_SHOOT_FRAME_WIDTH - guard * 2;
  const guardedHeight = PISTOL_SHOOT_FRAME_HEIGHT - guard * 2;
  const leftEdge = frame * PISTOL_SHOOT_FRAME_WIDTH + guard;
  const rightEdge = (frame + 1) * PISTOL_SHOOT_FRAME_WIDTH - guard;
  return Object.freeze({
    frame,
    mirrored,
    repeatX: (mirrored ? -1 : 1) * (guardedWidth / PISTOL_SHOOT_WIDTH),
    repeatY: guardedHeight / PISTOL_SHOOT_HEIGHT,
    offsetX: (mirrored ? rightEdge : leftEdge) / PISTOL_SHOOT_WIDTH,
    offsetY: guard / PISTOL_SHOOT_HEIGHT,
  });
}

function applyShootWindow(motion, frameIndex, direction) {
  const texture = motion?.shoot?.texture;
  if (!texture) return;
  const window = pawnSlugMatthiasPistolShootWindow(frameIndex, direction);
  if (motion.shoot.frameIndex === window.frame && motion.shoot.direction === (direction < 0 ? -1 : 1)) return;
  motion.shoot.frameIndex = window.frame;
  motion.shoot.direction = direction < 0 ? -1 : 1;
  texture.repeat.set(window.repeatX, window.repeatY);
  texture.offset.set(window.offsetX, window.offsetY);
}

export function attachPawnSlugMatthiasAuthoredMotion(sprite) {
  if (!sprite || sprite.userData?.pawnSlugMatthiasAuthoredMotion) return sprite;

  const material = new THREE.SpriteMaterial({
    transparent: true,
    alphaTest: 0.05,
    depthWrite: true,
  });
  material.visible = false;
  const shootSprite = new THREE.Sprite(material);
  shootSprite.name = 'pawn-slug-matthias-pistol-shoot';
  shootSprite.center.set(0.5, PAWN_SLUG_MATTHIAS_AUTHORED_MOTION.pistolShoot.authoredBottomGutterPx / PISTOL_SHOOT_FRAME_HEIGHT);
  shootSprite.position.set(0, 0, 0.004);
  shootSprite.renderOrder = 3;
  shootSprite.userData.pawnSlugCanonicalShootOverlay = true;
  sprite.add(shootSprite);

  const motion = {
    version: PAWN_SLUG_MATTHIAS_AUTHORED_MOTION.version,
    wasTriggerFiring: false,
    fireStartedAt: Number.NEGATIVE_INFINITY,
    shoot: {
      source: 'loading',
      ready: false,
      texture: null,
      sprite: shootSprite,
      frameIndex: -1,
      direction: 0,
    },
  };
  sprite.userData.pawnSlugMatthiasAuthoredMotion = motion;

  const url = r2AssetUrl(PISTOL_SHOOT_LOGICAL_ID);
  if (!url) {
    motion.shoot.source = 'missing';
    return sprite;
  }

  new THREE.TextureLoader().load(
    url,
    (texture) => {
      if (sprite.userData?.atlas?.disposed) {
        texture.dispose?.();
        return;
      }
      configurePawnSlugTexture(texture);
      motion.shoot.texture = texture;
      motion.shoot.source = 'r2';
      motion.shoot.ready = true;
      material.map = texture;
      material.needsUpdate = true;
      applyShootWindow(motion, 0, 1);
    },
    undefined,
    () => {
      if (!sprite.userData?.atlas?.disposed) motion.shoot.source = 'failed';
    },
  );
  return sprite;
}

export function applyPawnSlugMatthiasAuthoredMotion(sprite, state = {}) {
  const motion = sprite?.userData?.pawnSlugMatthiasAuthoredMotion;
  if (!sprite || !motion) return null;
  const animation = sprite.userData.animation || {};
  const atlas = sprite.userData.atlas || {};
  const time = Number(state.time) || 0;
  const direction = Number(state.dir) < 0 ? -1 : 1;
  const pistol = (animation.weapon || atlas.weapon || 'pistol') === 'pistol';

  let runFrame = null;
  if (state.running && !state.airborne && !state.crouch) {
    runFrame = pawnSlugMatthiasCanonicalRunFrame(time, animation.runStartedAt);
    if (animation.action !== 'run' || animation.frameIndex !== runFrame) {
      sprite.userData.setActionFrame?.('run', runFrame);
    }
  }

  // The two-frame authored shoot strip is intentionally standing-only. While
  // Matthias is moving, the canonical RUN row owns the full body and the small
  // runtime weapon overlay + muzzle flash sell the shot without freezing legs.
  const triggerFiring = Boolean(state.firing) && pistol && !state.crouch && !state.running;
  if (triggerFiring && !motion.wasTriggerFiring) motion.fireStartedAt = time;
  motion.wasTriggerFiring = triggerFiring;
  const fireAge = Math.max(0, time - motion.fireStartedAt);
  const shootActive = pistol
    && !state.crouch
    && !state.running
    && Number.isFinite(motion.fireStartedAt)
    && fireAge < PAWN_SLUG_MATTHIAS_AUTHORED_MOTION.pistolShoot.holdSeconds;
  const showShoot = shootActive && motion.shoot.ready;
  const shootFrame = showShoot ? pawnSlugMatthiasPistolShootFrame(fireAge) : null;

  if (showShoot) applyShootWindow(motion, shootFrame, direction);
  if (motion.shoot.sprite?.material) motion.shoot.sprite.material.visible = showShoot;
  if (sprite.material) sprite.material.visible = Boolean(atlas.ready) && !showShoot;

  const result = Object.freeze({
    runFrame,
    shootActive,
    shootReady: motion.shoot.ready,
    shootFrame,
    direction,
  });
  sprite.userData.pawnSlugMatthiasAuthoredPose = result;
  return result;
}
