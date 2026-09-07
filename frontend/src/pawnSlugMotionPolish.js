export const PAWN_SLUG_MOTION_POLISH = Object.freeze({
  walkFrames: 10,
  walkRate: 9.2,
  walkToRunSeconds: 0.24,
  runSpeedThreshold: 0.58,
  settleSeconds: 0.12,
  settleFrames: 5,
});

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function pawnSlugMatthiasLocomotion({
  time = 0,
  moving = false,
  speedRatio = 0,
  moveStartedAt = 0,
  stoppedAt = Number.NEGATIVE_INFINITY,
} = {}) {
  const safeTime = Math.max(0, Number(time) || 0);
  const speed = clamp01(speedRatio);
  const moveElapsed = Math.max(0, safeTime - Math.max(0, Number(moveStartedAt) || 0));
  const settleElapsed = Number.isFinite(stoppedAt)
    ? Math.max(0, safeTime - Number(stoppedAt))
    : Number.POSITIVE_INFINITY;

  if (!moving) {
    if (settleElapsed < PAWN_SLUG_MOTION_POLISH.settleSeconds) {
      const settleProgress = settleElapsed / PAWN_SLUG_MOTION_POLISH.settleSeconds;
      return Object.freeze({
        action: 'walk',
        frame: Math.max(0, PAWN_SLUG_MOTION_POLISH.settleFrames - 1 - Math.floor(settleProgress * PAWN_SLUG_MOTION_POLISH.settleFrames)),
        phase: 'settle',
      });
    }
    return Object.freeze({ action: 'idle', frame: 0, phase: 'idle' });
  }

  const walking = moveElapsed < PAWN_SLUG_MOTION_POLISH.walkToRunSeconds
    || speed < PAWN_SLUG_MOTION_POLISH.runSpeedThreshold;
  if (!walking) return Object.freeze({ action: 'run', frame: null, phase: 'run' });

  const frame = Math.floor(safeTime * PAWN_SLUG_MOTION_POLISH.walkRate) % PAWN_SLUG_MOTION_POLISH.walkFrames;
  return Object.freeze({ action: 'walk', frame, phase: 'walk' });
}
