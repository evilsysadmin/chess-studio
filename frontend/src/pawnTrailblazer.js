export const TRAIL_LANES = 5;
export const TRAIL_POWER_DURATION_MS = 6_000;
export const TRAIL_DUEL_PRESS = 14;
export const TRAIL_COMBO_WINDOW_MS = 2_800;
export const TRAIL_MAX_COMBO = 8;
export const TRAIL_BISHOP_PARRY_WINDOW_MS = 520;

export function clampTrailLane(lane) {
  return Math.max(0, Math.min(TRAIL_LANES - 1, Math.round(Number(lane) || 0)));
}

export function trailSpeedForDistance(distance = 0) {
  return Math.min(10.5, 5.2 + Math.max(0, Number(distance) || 0) / 115);
}

export function trailPowerLane({ lane, direction, power }) {
  const dir = direction < 0 ? -1 : 1;
  if (power === 'rook') return clampTrailLane(lane + dir * 2);
  if (power === 'bishop' || power === 'queen') return clampTrailLane(lane + dir);
  return clampTrailLane(lane);
}

export function trailDuelDirection(lane, direction) {
  const current = clampTrailLane(lane);
  const requested = direction < 0 ? -1 : 1;
  if (current + requested >= 0 && current + requested < TRAIL_LANES) return requested;
  return -requested;
}

export function trailDuelPress(meter = 0) {
  return Math.min(100, Math.max(0, Number(meter) || 0) + TRAIL_DUEL_PRESS);
}

export function trailDuelDecay(meter = 0, dt = 0) {
  return Math.max(0, (Number(meter) || 0) - Math.max(0, Number(dt) || 0) * 8);
}

export function trailComboAfterCapture(combo = 0, lastCaptureAt = 0, now = 0) {
  const current = Math.max(0, Math.floor(Number(combo) || 0));
  const previousAt = Math.max(0, Number(lastCaptureAt) || 0);
  const at = Math.max(0, Number(now) || 0);
  if (!previousAt || at - previousAt > TRAIL_COMBO_WINDOW_MS) return 1;
  return Math.min(TRAIL_MAX_COMBO, current + 1);
}

export function trailComboMultiplier(combo = 0) {
  const safe = Math.max(0, Math.min(TRAIL_MAX_COMBO, Math.floor(Number(combo) || 0)));
  if (safe <= 1) return 1;
  return Math.min(3, 1 + (safe - 1) * 0.25);
}

export function trailEnemyTypeForDistance(distance = 0, roll = 0) {
  const meters = Math.max(0, Number(distance) || 0);
  const random = Math.max(0, Math.min(0.999999, Number(roll) || 0));
  if (meters < 70) return 'pawn';
  if (meters < 170) return random < 0.72 ? 'pawn' : 'knight';
  if (meters < 300) {
    if (random < 0.5) return 'pawn';
    if (random < 0.72) return 'knight';
    if (random < 0.9) return 'bishop';
    return 'rook';
  }
  if (random < 0.4) return 'pawn';
  if (random < 0.63) return 'knight';
  if (random < 0.84) return 'bishop';
  return 'rook';
}

export function trailEnemyCapturePoints(enemyType = 'pawn') {
  if (enemyType === 'rook') return 420;
  if (enemyType === 'bishop') return 360;
  if (enemyType === 'knight') return 320;
  return 240;
}

export function trailKnightJumpLane(lane, targetLane) {
  const current = clampTrailLane(lane);
  const target = clampTrailLane(targetLane);
  const candidates = [current - 2, current + 2].filter((value) => value >= 0 && value < TRAIL_LANES);
  if (!candidates.length) return current;
  return candidates.sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0];
}

export function trailBishopTargetLane(lane, targetLane) {
  const current = clampTrailLane(lane);
  const target = clampTrailLane(targetLane);
  if (target !== current) return target;
  if (current === 0) return 1;
  if (current === TRAIL_LANES - 1) return TRAIL_LANES - 2;
  return current <= Math.floor((TRAIL_LANES - 1) / 2) ? current + 1 : current - 1;
}

export function trailBishopParryReady(aimUntil = 0, now = 0) {
  const remaining = Math.max(0, Number(aimUntil) || 0) - Math.max(0, Number(now) || 0);
  return remaining > 0 && remaining <= TRAIL_BISHOP_PARRY_WINDOW_MS;
}

export function trailPowerLabel(power) {
  if (power === 'rook') return 'TORRE';
  if (power === 'bishop') return 'ALFIL';
  if (power === 'queen') return 'DAMA';
  return 'PEÓN';
}
