export const TRAIL_KNIGHT_JUMP_MS = 560;
export const TRAIL_ROOK_CHARGE_MS = 620;
export const TRAIL_BISHOP_RECOIL_MS = 320;

export function trailAnimationProgress(now = 0, startedAt = 0, durationMs = 1) {
  const start = Number(startedAt) || 0;
  const duration = Math.max(1, Number(durationMs) || 1);
  if (!start) return 1;
  return Math.max(0, Math.min(1, (Math.max(0, Number(now) || 0) - start) / duration));
}

export function trailEaseInOut(progress = 0) {
  const t = Math.max(0, Math.min(1, Number(progress) || 0));
  return t * t * (3 - 2 * t);
}

export function trailKnightJumpPose(now = 0, startedAt = 0, reducedMotion = false) {
  const progress = trailAnimationProgress(now, startedAt, TRAIL_KNIGHT_JUMP_MS);
  const eased = trailEaseInOut(progress);
  const amplitude = reducedMotion ? 0.42 : 1;
  const lift = Math.sin(Math.PI * progress) * amplitude;
  const tilt = Math.sin(Math.PI * 2 * progress) * 0.18 * amplitude;
  const squash = Math.sin(Math.PI * progress) * 0.11 * amplitude;
  return { progress, eased, lift, tilt, squash, active: progress < 1 };
}

export function trailRookChargePose(now = 0, startedAt = 0, reducedMotion = false) {
  const progress = trailAnimationProgress(now, startedAt, TRAIL_ROOK_CHARGE_MS);
  const amplitude = reducedMotion ? 0.4 : 1;
  const anticipation = progress < 0.42 ? Math.sin((progress / 0.42) * Math.PI) : 0;
  const impactProgress = Math.max(0, (progress - 0.42) / 0.58);
  const slam = Math.sin(Math.min(1, impactProgress) * Math.PI) * amplitude;
  return {
    progress,
    active: progress < 1,
    y: anticipation * 0.08 * amplitude - slam * 0.12,
    scaleX: 1 + anticipation * 0.12 * amplitude + slam * 0.08,
    scaleY: 1 - anticipation * 0.1 * amplitude + slam * 0.14,
    shake: slam * 0.045,
  };
}

export function trailBishopRecoilPose(now = 0, firedAt = 0, reducedMotion = false) {
  const progress = trailAnimationProgress(now, firedAt, TRAIL_BISHOP_RECOIL_MS);
  const amplitude = reducedMotion ? 0.38 : 1;
  const recoil = Math.sin(Math.PI * progress) * amplitude;
  return {
    progress,
    active: progress < 1,
    y: -recoil * 0.12,
    rotation: -recoil * 0.14,
    scaleX: 1 + recoil * 0.08,
    scaleY: 1 - recoil * 0.07,
    flash: Math.max(0, 1 - progress * 1.7) * amplitude,
  };
}

export function trailPlayerLift(width = 0, height = 0) {
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  if (w > 560) return 0;
  return Math.max(62, Math.min(92, h * 0.125));
}
