const TAU = Math.PI * 2;

export const PAWN_SLUG_ENEMY_ACTIONS = Object.freeze({
  idle: Object.freeze({ frames: 12, rate: 5.2, loop: true }),
  run: Object.freeze({ frames: 16, rate: 15.5, loop: true }),
  jump: Object.freeze({ frames: 10, rate: 12, loop: true }),
  crouch: Object.freeze({ frames: 8, rate: 10, loop: true }),
  hurt: Object.freeze({ frames: 6, rate: 48, loop: false }),
  climb: Object.freeze({ frames: 12, rate: 11.5, loop: true }),
  death: Object.freeze({ frames: 14, rate: 16, loop: false, groundedTailFrames: 4 }),
});

// These are source-frame rates, not complete gait cycles. With a 16-frame run
// track they land around 1.4–2.4 full strides/sec instead of the old sub-1 Hz
// "cardboard glide" that made authored sprites look static in motion.
export const PAWN_SLUG_ENEMY_RUN_RATE_BY_TYPE = Object.freeze({
  pawn: 30,
  knight: 38,
  rook: 22,
});

const ACTION_INDEX = Object.freeze({ idle: 0, run: 1, jump: 2, crouch: 3, hurt: 4, climb: 5, death: 6 });
const TYPE_INDEX = Object.freeze({ pawn: 0, knight: 1, rook: 2 });
const ACTION_POSE_CACHE = new Map();

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function wrapFrame(value, count) {
  return ((Math.floor(value) % count) + count) % count;
}

function clampFrame(value, count) {
  return Math.max(0, Math.min(count - 1, Math.floor(Number(value) || 0)));
}

function deathVariant(value = 0) {
  return ((Math.floor(Number(value) || 0) % 3) + 3) % 3;
}

function poseCacheKey(action, frame, type, variant, vy) {
  const actionIndex = ACTION_INDEX[action] ?? ACTION_INDEX.idle;
  const typeIndex = TYPE_INDEX[type] ?? TYPE_INDEX.pawn;
  const variantIndex = action === 'death' ? deathVariant(variant) : 0;
  const jumpDirection = action === 'jump' && Number(vy) > 0 ? 1 : 0;
  return (((typeIndex * 7 + actionIndex) * 16 + frame) * 3 + variantIndex) * 2 + jumpDirection;
}

export function pawnSlugEnemyActionForFlags(
  moving = false,
  hurt = false,
  airborne = false,
  crouch = false,
  climbing = false,
  dying = false,
) {
  if (dying) return 'death';
  if (hurt) return 'hurt';
  if (climbing) return 'climb';
  if (airborne) return 'jump';
  if (crouch) return 'crouch';
  if (moving) return 'run';
  return 'idle';
}

export function pawnSlugEnemyActionForState({ moving = false, hurt = false, airborne = false, crouch = false, climbing = false, dying = false } = {}) {
  return pawnSlugEnemyActionForFlags(moving, hurt, airborne, crouch, climbing, dying);
}

export function pawnSlugEnemyActionTimeValues(action = 'idle', time = 0, hurtStartedAt = null, deathAge = 0) {
  const safeTime = Math.max(0, Number(time) || 0);
  if (action === 'death') return Math.max(0, Number(deathAge) || 0);
  if (action === 'hurt') {
    const startedAt = Number(hurtStartedAt);
    return hurtStartedAt != null && Number.isFinite(startedAt)
      ? Math.max(0, safeTime - startedAt)
      : 0;
  }
  return safeTime;
}

export function pawnSlugEnemyActionTime(action = 'idle', { time = 0, hurtStartedAt = null, deathAge = 0 } = {}) {
  return pawnSlugEnemyActionTimeValues(action, time, hurtStartedAt, deathAge);
}

export function pawnSlugEnemyActionFrame(action = 'idle', time = 0, type = null) {
  const track = PAWN_SLUG_ENEMY_ACTIONS[action] || PAWN_SLUG_ENEMY_ACTIONS.idle;
  const runRate = type == null ? null : PAWN_SLUG_ENEMY_RUN_RATE_BY_TYPE[type];
  const rate = action === 'run' && Number.isFinite(runRate) ? runRate : track.rate;
  const raw = (Number(time) || 0) * rate;
  return track.loop === false ? clampFrame(raw, track.frames) : wrapFrame(raw, track.frames);
}

export function pawnSlugEnemySourceFrame(action = 'idle', actionFrame = 0, sourceFrames = 8) {
  const count = Math.max(1, Math.floor(sourceFrames) || 1);
  const track = PAWN_SLUG_ENEMY_ACTIONS[action] || PAWN_SLUG_ENEMY_ACTIONS.idle;
  const localFrame = track.loop === false ? clampFrame(actionFrame, track.frames) : wrapFrame(actionFrame, track.frames);
  const phase = localFrame / Math.max(1, track.frames - (track.loop === false ? 1 : 0));
  if (action === 'idle') return 0;
  if (action === 'hurt') return Math.min(count - 1, Math.floor(phase * 3));
  if (action === 'crouch') return Math.min(count - 1, Math.floor(phase * 4));
  if (action === 'death') return Math.min(count - 1, Math.floor(phase * count));
  return Math.min(count - 1, Math.floor(phase * count));
}

export function pawnSlugEnemyDeathDuration(type = 'pawn') {
  if (type === 'rook') return 0.88;
  if (type === 'knight') return 0.72;
  return 0.64;
}

function deathPose(type, phase, variant = 0) {
  const groundedStart = 10 / 13;
  const grounded = phase >= groundedStart;
  const fallPhase = clamp01(phase / groundedStart);
  const fall = Math.sin(fallPhase * Math.PI * 0.5);
  const settle = grounded ? clamp01((phase - groundedStart) / (1 - groundedStart)) : 0;
  const impactBounce = grounded ? Math.sin(settle * Math.PI) * (1 - settle) : 0;
  const v = deathVariant(variant);
  const sway = v === 1 ? -1 : 1;
  const reach = v === 2 ? 1.18 : v === 1 ? 0.84 : 1;
  const twist = v === 2 ? 1.08 : v === 1 ? 0.9 : 1;

  if (type === 'rook') {
    return Object.freeze({ x: -0.06 * fall * reach, y: grounded ? -0.36 - impactBounce * 0.03 : -0.28 * fall, rz: 1.36 * fall * twist * sway, sx: 1 + 0.12 * fall, sy: grounded ? 0.56 : 1 - 0.32 * fall, grounded });
  }
  if (type === 'knight') {
    return Object.freeze({ x: -0.2 * fall * reach, y: grounded ? -0.42 - impactBounce * 0.035 : 0.07 * Math.sin(fallPhase * Math.PI), rz: 1.52 * fall * twist * sway, sx: 1 + 0.06 * fall, sy: grounded ? 0.52 : 1 - 0.15 * fall, grounded });
  }
  return Object.freeze({ x: -0.13 * fall * reach, y: grounded ? -0.4 - impactBounce * 0.025 : -0.08 * fall, rz: 1.47 * fall * twist * sway, sx: 1 + 0.08 * fall, sy: grounded ? 0.5 : 1 - 0.2 * fall, grounded });
}

function hurtPose(type, phase) {
  const snap = 1 - clamp01(phase / 0.38);
  const reboundPhase = clamp01((phase - 0.38) / 0.62);
  const rebound = Math.sin(reboundPhase * Math.PI) * (1 - reboundPhase);
  const travel = snap - rebound * 0.24;
  const twist = snap - rebound * 0.16;
  const bounce = Math.sin(phase * Math.PI);
  const compression = Math.max(snap, bounce * 0.42);

  if (type === 'rook') {
    return Object.freeze({ x: -0.032 * travel, y: bounce * 0.012, rz: 0.035 * twist, sx: 1 + 0.075 * compression, sy: 1 - 0.14 * compression });
  }
  if (type === 'knight') {
    return Object.freeze({ x: -0.095 * travel, y: bounce * 0.05, rz: 0.17 * twist, sx: 1 + 0.055 * compression, sy: 1 - 0.085 * compression });
  }
  return Object.freeze({ x: -0.145 * travel, y: bounce * 0.04, rz: 0.12 * twist, sx: 1 + 0.08 * compression, sy: 1 - 0.11 * compression });
}

function runPose(type, wave, pulse) {
  const lift = Math.abs(wave);
  const plant = Math.max(0, pulse);
  const backPlant = Math.max(0, -pulse);
  if (type === 'rook') {
    return Object.freeze({
      x: wave * 0.024,
      y: lift * 0.045 - plant * 0.012,
      rz: -wave * 0.028,
      sx: 1 + lift * 0.012,
      sy: 1 + lift * 0.018 - plant * 0.055,
    });
  }
  if (type === 'knight') {
    return Object.freeze({
      x: wave * 0.062,
      y: lift * 0.092 - plant * 0.018,
      rz: -wave * 0.082,
      sx: 1 + lift * 0.024 - backPlant * 0.008,
      sy: 1 + lift * 0.035 - plant * 0.048,
    });
  }
  return Object.freeze({
    x: wave * 0.048,
    y: lift * 0.078 - plant * 0.016,
    rz: -wave * 0.058,
    sx: 1 + lift * 0.02 - backPlant * 0.006,
    sy: 1 + lift * 0.03 - plant * 0.052,
  });
}

function idlePose(type, wave, pulse) {
  const inhale = (1 - pulse) * 0.5;
  const mass = type === 'rook' ? 0.5 : type === 'knight' ? 1.08 : 1;
  return Object.freeze({
    x: wave * 0.006 * mass,
    y: inhale * 0.006 * mass,
    rz: wave * 0.012 * mass,
    sx: 1 - inhale * 0.003,
    sy: 1 + inhale * 0.014 * mass,
  });
}

export function pawnSlugEnemyActionPoseValues(action = 'idle', actionFrame = 0, vy = 0, type = 'pawn', variant = 0) {
  const safeAction = PAWN_SLUG_ENEMY_ACTIONS[action] ? action : 'idle';
  const track = PAWN_SLUG_ENEMY_ACTIONS[safeAction];
  const localFrame = track.loop === false ? clampFrame(actionFrame, track.frames) : wrapFrame(actionFrame, track.frames);
  const key = poseCacheKey(safeAction, localFrame, type, variant, vy);
  const cached = ACTION_POSE_CACHE.get(key);
  if (cached) return cached;

  const phase = localFrame / Math.max(1, track.frames - (track.loop === false ? 1 : 0));
  const wave = Math.sin(phase * TAU);
  const pulse = Math.cos(phase * TAU);
  let pose;

  if (safeAction === 'run') pose = runPose(type, wave, pulse);
  else if (safeAction === 'jump') {
    const ascending = Number(vy) > 0;
    pose = Object.freeze({ x: 0, y: ascending ? 0.055 : -0.018, rz: ascending ? -0.055 : 0.045, sx: ascending ? 0.965 : 1.035, sy: ascending ? 1.055 : 0.965 });
  } else if (safeAction === 'crouch') {
    const settle = clamp01(localFrame / Math.max(1, track.frames - 1));
    pose = Object.freeze({ x: 0.04, y: -0.02 * settle, rz: 0.018, sx: 1.08, sy: 0.76 });
  } else if (safeAction === 'hurt') pose = hurtPose(type, phase);
  else if (safeAction === 'climb') pose = Object.freeze({ x: wave * 0.018, y: Math.abs(wave) * 0.055, rz: wave * 0.018, sx: 0.985, sy: 1.015 });
  else if (safeAction === 'death') pose = deathPose(type, phase, variant);
  else pose = idlePose(type, wave, pulse);

  ACTION_POSE_CACHE.set(key, pose);
  return pose;
}

export function pawnSlugEnemyActionPose(action = 'idle', actionFrame = 0, { vy = 0, type = 'pawn', variant = 0 } = {}) {
  return pawnSlugEnemyActionPoseValues(action, actionFrame, vy, type, variant);
}

export const PAWN_SLUG_ENEMY_ACTION_META = Object.freeze({
  theme: 'military-chess-soldiers',
  silhouetteByType: Object.freeze({ pawn: 'rifle-infantry-pawn', knight: 'assault-knight', rook: 'heavy-rook-gunner' }),
  actions: PAWN_SLUG_ENEMY_ACTIONS,
  runRateByType: PAWN_SLUG_ENEMY_RUN_RATE_BY_TYPE,
  authoredFacings: Object.freeze(['left']),
  runtimeFacings: Object.freeze(['left', 'right']),
  locomotionVersion: 'premium-weight-shift-v2',
  runStyleByType: Object.freeze({ pawn: 'rifle-stride', knight: 'assault-charge', rook: 'heavy-stomp' }),
  idleStyleByType: Object.freeze({ pawn: 'guard-breath', knight: 'predator-breath', rook: 'heavy-breath' }),
  impactStyleByType: Object.freeze({ pawn: 'clear-backstep', knight: 'armored-twist', rook: 'heavy-compression' }),
  deathStyleByType: Object.freeze({ pawn: 'backward-collapse-grounded', knight: 'violent-tumble-grounded', rook: 'heavy-collapse-grounded' }),
  deathVariants: 3,
  poseCache: 'discrete-frame-v1',
});
