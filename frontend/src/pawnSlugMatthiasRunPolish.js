const TAU = Math.PI * 2;

const ATLAS_COLUMNS = 16;
const ATLAS_ROWS = 5;
const FRAME_WIDTH = 96;
const FRAME_HEIGHT = 96;
const RUN_ROW = 2;
const RUN_FRAMES = 16;

export const PAWN_SLUG_MATTHIAS_RUN_POLISH = Object.freeze({
  frameCount: RUN_FRAMES,
  frameRate: 14,
  leftTrimTexels: 4,
  rightTrimTexels: 4,
  topTrimTexels: 2,
  bottomTrimTexels: 2,
  maxVerticalCompensation: 0,
  forwardLean: 0.01,
  cadenceLean: 0.003,
  stretchX: 1.008,
  compressY: 0.998,
  purpose: 'grounded-16-frame-run-with-clean-edges-and-visible-authored-footwork',
});

function wrapFrame(frame, count) {
  const safeCount = Math.max(1, Math.floor(Number(count) || 1));
  return ((Math.floor(Number(frame) || 0) % safeCount) + safeCount) % safeCount;
}

export function pawnSlugMatthiasRunCadence(frameIndex = 0, frameCount = RUN_FRAMES) {
  const safeCount = Math.max(1, Math.floor(Number(frameCount) || RUN_FRAMES));
  const frame = wrapFrame(frameIndex, safeCount);
  return Math.abs(Math.sin((frame / safeCount) * TAU));
}

export function pawnSlugMatthiasRunFrame(time = 0, runStartedAt = 0) {
  const elapsed = Math.max(0, (Number(time) || 0) - (Number(runStartedAt) || 0));
  return wrapFrame(Math.floor(elapsed * PAWN_SLUG_MATTHIAS_RUN_POLISH.frameRate), RUN_FRAMES);
}

export function pawnSlugMatthiasRunUvWindow(frameIndex = 0, dir = 1) {
  const atlasWidth = ATLAS_COLUMNS * FRAME_WIDTH;
  const atlasHeight = ATLAS_ROWS * FRAME_HEIGHT;
  const frame = wrapFrame(frameIndex, RUN_FRAMES);
  const direction = Number(dir) < 0 ? -1 : 1;
  const {
    leftTrimTexels: left,
    rightTrimTexels: right,
    topTrimTexels: top,
    bottomTrimTexels: bottom,
  } = PAWN_SLUG_MATTHIAS_RUN_POLISH;
  const guardedWidth = FRAME_WIDTH - left - right;
  const guardedHeight = FRAME_HEIGHT - top - bottom;
  const leftEdge = (frame * FRAME_WIDTH) + left;
  const rightEdge = ((frame + 1) * FRAME_WIDTH) - right;
  const bottomEdge = atlasHeight - ((RUN_ROW + 1) * FRAME_HEIGHT) + bottom;
  return Object.freeze({
    frame,
    direction,
    repeatX: direction * (guardedWidth / atlasWidth),
    repeatY: guardedHeight / atlasHeight,
    offsetX: (direction < 0 ? rightEdge : leftEdge) / atlasWidth,
    offsetY: bottomEdge / atlasHeight,
  });
}

export function applyPawnSlugMatthiasRunPolish(sprite, state = {}) {
  if (!sprite || !state.running || state.airborne || state.crouch) return null;
  const animation = sprite.userData?.animation;
  if (animation?.action !== 'run') return null;

  const requestedFrame = Number.isFinite(state.runFrame)
    ? wrapFrame(state.runFrame, RUN_FRAMES)
    : pawnSlugMatthiasRunFrame(state.time, animation.runStartedAt);
  if (animation.frameIndex !== requestedFrame) sprite.userData.setActionFrame?.('run', requestedFrame);
  const appliedFrame = sprite.userData?.animation?.frameIndex ?? requestedFrame;
  const cadence = pawnSlugMatthiasRunCadence(appliedFrame);
  const direction = Number(state.dir) < 0 ? -1 : 1;
  const atlas = sprite.userData?.atlas;
  if (
    !sprite.userData?.pawnSlugIntegratedWeapons
    && atlas?.source === 'primary'
    && atlas.texture
  ) {
    const uv = pawnSlugMatthiasRunUvWindow(appliedFrame, direction);
    atlas.texture.repeat?.set?.(uv.repeatX, uv.repeatY);
    atlas.texture.offset?.set?.(uv.offsetX, uv.offsetY);
  }

  // The artwork owns the leg motion. Keep the body planted and let the 16-frame
  // texture cycle provide the stride instead of adding a fake world-space hop.
  // Do not crop the feet away: the lower run row contains the authored step.
  sprite.scale.x *= PAWN_SLUG_MATTHIAS_RUN_POLISH.stretchX;
  sprite.scale.y *= PAWN_SLUG_MATTHIAS_RUN_POLISH.compressY;
  if (sprite.material) {
    sprite.material.rotation -= direction * (
      PAWN_SLUG_MATTHIAS_RUN_POLISH.forwardLean
      + cadence * PAWN_SLUG_MATTHIAS_RUN_POLISH.cadenceLean
    );
  }

  const result = Object.freeze({ cadence, frameIndex: appliedFrame, direction });
  sprite.userData.pawnSlugRunPolish = result;
  return result;
}
