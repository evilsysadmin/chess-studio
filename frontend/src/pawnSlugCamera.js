export const PAWN_SLUG_CAMERA_META = Object.freeze({
  speedDeadzoneRatio: 0.08,
  fullLeadSpeedRatio: 0.92,
  idleLeadRightRatio: 0.05,
  idleLeadLeftRatio: 0.035,
  maxLeadRightRatio: 0.20,
  maxLeadLeftRatio: 0.11,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function pawnSlugCameraLookAhead({
  vx = 0,
  dir = 1,
  viewWidth,
  playerSpeed,
} = {}) {
  const width = Math.max(0, Number(viewWidth) || 0);
  const speed = Math.max(0.001, Number(playerSpeed) || 0.001);
  const safeVx = Number.isFinite(vx) ? vx : 0;
  const facing = safeVx < 0 ? -1 : safeVx > 0 ? 1 : (dir < 0 ? -1 : 1);
  const speedRatio = Math.abs(safeVx) / speed;
  const deadzone = PAWN_SLUG_CAMERA_META.speedDeadzoneRatio;
  const fullLead = PAWN_SLUG_CAMERA_META.fullLeadSpeedRatio;
  const movement = speedRatio <= deadzone
    ? 0
    : clamp((speedRatio - deadzone) / (fullLead - deadzone), 0, 1);
  const idleRatio = facing < 0
    ? PAWN_SLUG_CAMERA_META.idleLeadLeftRatio
    : PAWN_SLUG_CAMERA_META.idleLeadRightRatio;
  const maxRatio = facing < 0
    ? PAWN_SLUG_CAMERA_META.maxLeadLeftRatio
    : PAWN_SLUG_CAMERA_META.maxLeadRightRatio;
  const lead = idleRatio + (maxRatio - idleRatio) * movement;
  return width * lead * facing;
}
