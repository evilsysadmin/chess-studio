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

export function trailSpriteMotion(kind = 'pawn', now = 0, seed = 0, state = 'running') {
  const t = (Math.max(0, Number(now) || 0) + (Number(seed) || 0) * 97) / 1000;
  const still = Object.freeze({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
  if (state === 'reduced') return still;

  if (kind === 'matthias') {
    if (state === 'slash') {
      return {
        x: 0.035,
        y: -0.045,
        rotation: -0.16 + Math.sin(t * 22) * 0.025,
        scaleX: 1.08,
        scaleY: 0.95,
      };
    }
    const stride = t * 11;
    return {
      x: Math.sin(stride * 0.5) * 0.035,
      y: -Math.abs(Math.sin(stride)) * 0.075,
      rotation: Math.sin(stride * 0.5) * 0.055,
      scaleX: 1 + Math.cos(stride) * 0.035,
      scaleY: 1 - Math.cos(stride) * 0.045,
    };
  }

  if (kind === 'duelist') {
    const shove = t * 9;
    return {
      x: Math.sin(shove) * 0.045,
      y: -Math.abs(Math.sin(shove * 0.5)) * 0.025,
      rotation: Math.sin(shove) * 0.075,
      scaleX: 1 + Math.abs(Math.sin(shove)) * 0.035,
      scaleY: 1 - Math.abs(Math.sin(shove)) * 0.025,
    };
  }

  if (kind === 'knight') {
    const leap = t * 7.2;
    return {
      x: Math.sin(leap * 0.5) * 0.03,
      y: -Math.abs(Math.sin(leap)) * 0.14,
      rotation: Math.sin(leap * 0.5) * 0.09,
      scaleX: 1.02,
      scaleY: 0.98,
    };
  }

  if (kind === 'bishop') {
    const pulse = t * (state === 'aiming' ? 8 : 4.2);
    return {
      x: Math.sin(pulse * 0.4) * 0.014,
      y: Math.sin(pulse) * 0.022,
      rotation: state === 'aiming' ? Math.sin(pulse) * 0.045 : Math.sin(pulse * 0.45) * 0.025,
      scaleX: 1 + (state === 'aiming' ? Math.sin(pulse) * 0.025 : 0),
      scaleY: 1 - (state === 'aiming' ? Math.sin(pulse) * 0.02 : 0),
    };
  }

  if (kind === 'rook') {
    const weight = t * 3.6;
    return {
      x: 0,
      y: Math.sin(weight) * 0.009,
      rotation: 0,
      scaleX: 1 + Math.sin(weight) * 0.012,
      scaleY: 1 - Math.sin(weight) * 0.009,
    };
  }

  if (kind === 'power') {
    const float = t * 4.6;
    return {
      x: Math.sin(float * 0.5) * 0.025,
      y: -0.055 - Math.sin(float) * 0.035,
      rotation: t * 0.85,
      scaleX: 1 + Math.sin(float) * 0.035,
      scaleY: 1 + Math.sin(float) * 0.035,
    };
  }

  const step = t * 5.2;
  return {
    x: Math.sin(step * 0.5) * 0.012,
    y: -Math.abs(Math.sin(step)) * 0.018,
    rotation: Math.sin(step * 0.5) * 0.018,
    scaleX: 1,
    scaleY: 1,
  };
}

export function trailPowerLabel(power) {
  if (power === 'rook') return 'TORRE';
  if (power === 'bishop') return 'ALFIL';
  if (power === 'queen') return 'DAMA';
  return 'PEÓN';
}
