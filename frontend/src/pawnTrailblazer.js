export const TRAIL_LANES = 5;
export const TRAIL_POWER_DURATION_MS = 6_000;
export const TRAIL_DUEL_PRESS = 14;
export const TRAIL_COMBO_WINDOW_MS = 2_800;
export const TRAIL_MAX_COMBO = 8;
export const TRAIL_BISHOP_PARRY_WINDOW_MS = 520;
export const TRAIL_PROMOTION_DISTANCE = 250;
export const TRAIL_PROMOTION_BONUS = 750;

export const TRAIL_SECTORS = Object.freeze([
  Object.freeze({ key: 'infantry', minDistance: 0, code: 'I', name: 'INFANTERÍA', toast: 'Peones al frente.' }),
  Object.freeze({ key: 'cavalry', minDistance: 70, code: 'II', name: 'CABALLERÍA', toast: 'Los caballos entran en pista.' }),
  Object.freeze({ key: 'crossfire', minDistance: 170, code: 'III', name: 'FUEGO CRUZADO', toast: 'Alfiles y torres autorizados.' }),
  Object.freeze({ key: 'hell', minDistance: 300, code: 'IV', name: 'HÖLLE', toast: 'Todos los patrones. Keine Gnade.' }),
]);

export function clampTrailLane(lane) {
  return Math.max(0, Math.min(TRAIL_LANES - 1, Math.round(Number(lane) || 0)));
}

export function trailSpeedForDistance(distance = 0) {
  return Math.min(10.5, 5.2 + Math.max(0, Number(distance) || 0) / 115);
}

export function trailSectorForDistance(distance = 0) {
  const meters = Math.max(0, Number(distance) || 0);
  let sector = TRAIL_SECTORS[0];
  for (const candidate of TRAIL_SECTORS) {
    if (meters < candidate.minDistance) break;
    sector = candidate;
  }
  return sector;
}

export function trailPromotionCrossed(previousDistance = 0, nextDistance = 0, alreadyRefused = false) {
  if (alreadyRefused) return false;
  const previous = Math.max(0, Number(previousDistance) || 0);
  const next = Math.max(0, Number(nextDistance) || 0);
  return previous < TRAIL_PROMOTION_DISTANCE && next >= TRAIL_PROMOTION_DISTANCE;
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

export function trailRunFrameIndex(now = 0, speed = 5.2, reducedMotion = false, frameCount = 6) {
  const frames = Math.max(1, Math.floor(Number(frameCount) || 1));
  const safeSpeed = Math.max(1, Number(speed) || 5.2);
  const fps = reducedMotion ? 4 : Math.min(13, 8 + (safeSpeed - 5.2) * 0.75);
  return Math.floor((Math.max(0, Number(now) || 0) / 1000) * fps) % frames;
}

export function trailSpriteMotion(kind = 'pawn', now = 0, seed = 0, state = 'running') {
  const t = (Math.max(0, Number(now) || 0) + (Number(seed) || 0) * 97) / 1000;
  const reduced = state === 'reduced';
  const intensity = reduced ? 0.45 : 1;

  if (kind === 'matthias') {
    if (state === 'slash') {
      return {
        x: 0.055,
        y: -0.085,
        rotation: -0.21 + Math.sin(t * 22) * 0.035,
        scaleX: 1.12,
        scaleY: 0.92,
      };
    }
    const stride = t * (reduced ? 6 : 12.5);
    return {
      x: Math.sin(stride * 0.5) * 0.048 * intensity,
      y: -Math.abs(Math.sin(stride)) * 0.125 * intensity,
      rotation: Math.sin(stride * 0.5) * 0.082 * intensity,
      scaleX: 1 + Math.cos(stride) * 0.055 * intensity,
      scaleY: 1 - Math.cos(stride) * 0.07 * intensity,
    };
  }

  if (kind === 'duelist') {
    const shove = t * (reduced ? 5 : 10.5);
    return {
      x: Math.sin(shove) * 0.072 * intensity,
      y: -Math.abs(Math.sin(shove * 0.5)) * 0.055 * intensity,
      rotation: Math.sin(shove) * 0.12 * intensity,
      scaleX: 1 + Math.abs(Math.sin(shove)) * 0.055 * intensity,
      scaleY: 1 - Math.abs(Math.sin(shove)) * 0.04 * intensity,
    };
  }

  if (kind === 'knight') {
    const leap = t * (reduced ? 4 : 8.2);
    return {
      x: Math.sin(leap * 0.5) * 0.045 * intensity,
      y: -Math.abs(Math.sin(leap)) * 0.22 * intensity,
      rotation: Math.sin(leap * 0.5) * 0.14 * intensity,
      scaleX: 1.04,
      scaleY: 0.96,
    };
  }

  if (kind === 'bishop') {
    const pulse = t * (state === 'aiming' ? 9.5 : (reduced ? 2.6 : 5.2));
    return {
      x: Math.sin(pulse * 0.4) * 0.022 * intensity,
      y: Math.sin(pulse) * 0.04 * intensity,
      rotation: state === 'aiming' ? Math.sin(pulse) * 0.075 : Math.sin(pulse * 0.45) * 0.045 * intensity,
      scaleX: 1 + (state === 'aiming' ? Math.sin(pulse) * 0.045 : 0) * intensity,
      scaleY: 1 - (state === 'aiming' ? Math.sin(pulse) * 0.035 : 0) * intensity,
    };
  }

  if (kind === 'rook') {
    const weight = t * (reduced ? 2.2 : 4.4);
    return {
      x: 0,
      y: Math.sin(weight) * 0.022 * intensity,
      rotation: 0,
      scaleX: 1 + Math.sin(weight) * 0.024 * intensity,
      scaleY: 1 - Math.sin(weight) * 0.018 * intensity,
    };
  }

  if (kind === 'power') {
    const float = t * (reduced ? 2.8 : 5.5);
    return {
      x: Math.sin(float * 0.5) * 0.04 * intensity,
      y: -0.075 * intensity - Math.sin(float) * 0.055 * intensity,
      rotation: t * (reduced ? 0.3 : 1.15),
      scaleX: 1 + Math.sin(float) * 0.055 * intensity,
      scaleY: 1 + Math.sin(float) * 0.055 * intensity,
    };
  }

  const step = t * (reduced ? 3.2 : 6.4);
  return {
    x: Math.sin(step * 0.5) * 0.022 * intensity,
    y: -Math.abs(Math.sin(step)) * 0.045 * intensity,
    rotation: Math.sin(step * 0.5) * 0.032 * intensity,
    scaleX: 1 + Math.cos(step) * 0.012 * intensity,
    scaleY: 1 - Math.cos(step) * 0.018 * intensity,
  };
}

export function trailPowerLabel(power) {
  if (power === 'rook') return 'TORRE';
  if (power === 'bishop') return 'ALFIL';
  if (power === 'queen') return 'DAMA';
  return 'PEÓN';
}
