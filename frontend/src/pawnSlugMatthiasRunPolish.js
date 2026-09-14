const TAU = Math.PI * 2;

const ATLAS_ROWS = 5;
const FRAME_HEIGHT = 96;
const RUN_ROW = 2;
const RUN_FRAMES = 16;

export const PAWN_SLUG_MATTHIAS_RUN_POLISH = Object.freeze({
  frameCount: RUN_FRAMES,
  topTrimTexels: 1,
  bottomTrimTexels: 4,
  maxVerticalCompensation: 0.016,
  forwardLean: 0.012,
  cadenceLean: 0.006,
  stretchX: 1.012,
  compressY: 0.995,
  purpose: 'sprint-readability-and-lower-corner-cleanup',
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

export function pawnSlugMatthiasRunUvWindow() {
  const atlasHeight = ATLAS_ROWS * FRAME_HEIGHT;
  const top = PAWN_SLUG_MATTHIAS_RUN_POLISH.topTrimTexels;
  const bottom = PAWN_SLUG_MATTHIAS_RUN_POLISH.bottomTrimTexels;
  return Object.freeze({
    repeatY: (FRAME_HEIGHT - top - bottom) / atlasHeight,
    offsetY: (atlasHeight - ((RUN_ROW + 1) * FRAME_HEIGHT) + bottom) / atlasHeight,
  });
}

export function applyPawnSlugMatthiasRunPolish(sprite, state = {}) {
  if (!sprite || !state.running || state.airborne || state.crouch) return null;
  const animation = sprite.userData?.animation;
  if (animation?.action !== 'run') return null;

  const frameIndex = animation.frameIndex || 0;
  const cadence = pawnSlugMatthiasRunCadence(frameIndex);
  const atlas = sprite.userData?.atlas;
  if (atlas?.source === 'primary' && atlas.texture) {
    const uv = pawnSlugMatthiasRunUvWindow();
    atlas.texture.repeat?.set?.(atlas.texture.repeat.x, uv.repeatY);
    atlas.texture.offset?.set?.(atlas.texture.offset.x, uv.offsetY);
  }

  const direction = Number(state.dir) < 0 ? -1 : 1;
  sprite.position.y -= cadence * PAWN_SLUG_MATTHIAS_RUN_POLISH.maxVerticalCompensation;
  sprite.scale.x *= PAWN_SLUG_MATTHIAS_RUN_POLISH.stretchX;
  sprite.scale.y *= PAWN_SLUG_MATTHIAS_RUN_POLISH.compressY;
  if (sprite.material) {
    sprite.material.rotation -= direction * (
      PAWN_SLUG_MATTHIAS_RUN_POLISH.forwardLean
      + cadence * PAWN_SLUG_MATTHIAS_RUN_POLISH.cadenceLean
    );
  }

  const result = Object.freeze({ cadence, frameIndex, direction });
  sprite.userData.pawnSlugRunPolish = result;
  return result;
}
