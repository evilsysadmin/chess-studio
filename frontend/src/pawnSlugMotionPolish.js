export const PAWN_SLUG_MOTION_POLISH = Object.freeze({
  walkFrames: 10,
  walkRate: 9.2,
  walkRateMinScale: 0.62,
  walkRateSpeedInfluence: 0.38,
  // Keyboard/touch movement reaches arcade speed quickly. Keep only a tiny
  // walk lead-in so the dedicated 16-frame run row owns sustained locomotion
  // instead of being overwritten by the walk row for a visibly long beat.
  walkToRunSeconds: 0.09,
  runSpeedThreshold: 0.34,
  settleSeconds: 0.08,
  settleFrames: 4,
});

const IDLE_RESULT = Object.freeze({ action: 'idle', frame: 0, phase: 'idle' });
const RUN_RESULT = Object.freeze({ action: 'run', frame: null, phase: 'run' });
const WALK_RESULTS = Object.freeze(Array.from(
  { length: PAWN_SLUG_MOTION_POLISH.walkFrames },
  (_, frame) => Object.freeze({ action: 'walk', frame, phase: 'walk' }),
));
const SETTLE_RESULTS = Object.freeze(Array.from(
  { length: PAWN_SLUG_MOTION_POLISH.settleFrames },
  (_, frame) => Object.freeze({ action: 'walk', frame, phase: 'settle' }),
));

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
      const frame = Math.max(
        0,
        PAWN_SLUG_MOTION_POLISH.settleFrames - 1
          - Math.floor(settleProgress * PAWN_SLUG_MOTION_POLISH.settleFrames),
      );
      return SETTLE_RESULTS[frame];
    }
    return IDLE_RESULT;
  }

  const walking = moveElapsed < PAWN_SLUG_MOTION_POLISH.walkToRunSeconds
    || speed < PAWN_SLUG_MOTION_POLISH.runSpeedThreshold;
  if (!walking) return RUN_RESULT;

  const cadenceScale = PAWN_SLUG_MOTION_POLISH.walkRateMinScale
    + speed * PAWN_SLUG_MOTION_POLISH.walkRateSpeedInfluence;
  const frame = Math.floor(moveElapsed * PAWN_SLUG_MOTION_POLISH.walkRate * cadenceScale)
    % PAWN_SLUG_MOTION_POLISH.walkFrames;
  return WALK_RESULTS[frame];
}
