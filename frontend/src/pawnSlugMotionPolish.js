export const PAWN_SLUG_MOTION_POLISH = Object.freeze({
  runFrames: 16,
  runRate: 14,
  runRateMinScale: 0.92,
  runRateSpeedInfluence: 0.08,
  visualBaselineOffsetY: -0.12,
});

const IDLE_RESULT = Object.freeze({ action: 'idle', frame: 0, phase: 'idle' });
const RUN_RESULTS = Object.freeze(Array.from(
  { length: PAWN_SLUG_MOTION_POLISH.runFrames },
  (_, frame) => Object.freeze({ action: 'run', frame, phase: 'run' }),
));

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function pawnSlugMatthiasVisualY(worldY = 0) {
  return (Number(worldY) || 0) + PAWN_SLUG_MOTION_POLISH.visualBaselineOffsetY;
}

export function pawnSlugMatthiasLocomotion({
  time = 0,
  moving = false,
  speedRatio = 0,
  moveStartedAt = 0,
} = {}) {
  if (!moving) return IDLE_RESULT;

  const safeTime = Math.max(0, Number(time) || 0);
  const speed = clamp01(speedRatio);
  const moveElapsed = Math.max(0, safeTime - Math.max(0, Number(moveStartedAt) || 0));
  const cadenceScale = PAWN_SLUG_MOTION_POLISH.runRateMinScale
    + speed * PAWN_SLUG_MOTION_POLISH.runRateSpeedInfluence;
  const frame = Math.floor(moveElapsed * PAWN_SLUG_MOTION_POLISH.runRate * cadenceScale)
    % PAWN_SLUG_MOTION_POLISH.runFrames;
  return RUN_RESULTS[frame];
}
