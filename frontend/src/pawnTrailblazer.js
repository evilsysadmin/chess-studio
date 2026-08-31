export const TRAIL_LANES = 5;
export const TRAIL_POWER_DURATION_MS = 6_000;
export const TRAIL_DUEL_PRESS = 14;

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

export function trailPowerLabel(power) {
  if (power === 'rook') return 'TORRE';
  if (power === 'bishop') return 'ALFIL';
  if (power === 'queen') return 'DAMA';
  return 'PEÓN';
}
