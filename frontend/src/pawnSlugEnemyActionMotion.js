const TAU = Math.PI * 2;

export const PAWN_SLUG_ENEMY_ACTIONS = Object.freeze({
  idle: Object.freeze({ frames: 12, rate: 5.2, loop: true }),
  run: Object.freeze({ frames: 16, rate: 15.5, loop: true }),
  jump: Object.freeze({ frames: 10, rate: 12, loop: true }),
  crouch: Object.freeze({ frames: 8, rate: 10, loop: true }),
  hurt: Object.freeze({ frames: 6, rate: 18, loop: false }),
  climb: Object.freeze({ frames: 12, rate: 11.5, loop: true }),
  death: Object.freeze({ frames: 14, rate: 16, loop: false, groundedTailFrames: 4 }),
});

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

export function pawnSlugEnemyActionForState({ moving = false, hurt = false, airborne = false, crouch = false, climbing = false, dying = false } = {}) {
  if (dying) return 'death';
  if (hurt) return 'hurt';
  if (climbing) return 'climb';
  if (airborne) return 'jump';
  if (crouch) return 'crouch';
  if (moving) return 'run';
  return 'idle';
}

export function pawnSlugEnemyActionFrame(action = 'idle', time = 0) {
  const track = PAWN_SLUG_ENEMY_ACTIONS[action] || PAWN_SLUG_ENEMY_ACTIONS.idle;
  const raw = (Number(time) || 0) * track.rate;
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

function hurtPose(type, phase, actionFrame, frameCount) {
  const decay = 1 - clamp01(actionFrame / Math.max(1, frameCount - 1));
  const bounce = Math.sin(phase * Math.PI);
  if (type === 'rook') {
    return Object.freeze({ x: -0.032 * decay, y: bounce * 0.012, rz: 0.035 * decay, sx: 1.075, sy: 0.86 });
  }
  if (type === 'knight') {
    return Object.freeze({ x: -0.095 * decay, y: bounce * 0.05, rz: 0.17 * decay, sx: 1.055, sy: 0.915 });
  }
  return Object.freeze({ x: -0.145 * decay, y: bounce * 0.04, rz: 0.12 * decay, sx: 1.08, sy: 0.89 });
}

export function pawnSlugEnemyActionPose(action = 'idle', actionFrame = 0, { vy = 0, type = 'pawn', variant = 0 } = {}) {
  const track = PAWN_SLUG_ENEMY_ACTIONS[action] || PAWN_SLUG_ENEMY_ACTIONS.idle;
  const localFrame = track.loop === false ? clampFrame(actionFrame, track.frames) : wrapFrame(actionFrame, track.frames);
  const phase = localFrame / Math.max(1, track.frames - (track.loop === false ? 1 : 0));
  const wave = Math.sin(phase * TAU);
  const pulse = Math.cos(phase * TAU);
  const weight = type === 'rook' ? 0.58 : type === 'knight' ? 1.12 : 1;

  if (action === 'run') return Object.freeze({ x: wave * 0.028 * weight, y: Math.abs(wave) * 0.035 * weight, rz: -wave * 0.025 * weight, sx: 1 + pulse * 0.012, sy: 1 - pulse * 0.018 });
  if (action === 'jump') {
    const ascending = Number(vy) > 0;
    return Object.freeze({ x: 0, y: ascending ? 0.055 : -0.018, rz: ascending ? -0.055 : 0.045, sx: ascending ? 0.965 : 1.035, sy: ascending ? 1.055 : 0.965 });
  }
  if (action === 'crouch') {
    const settle = clamp01(actionFrame / Math.max(1, track.frames - 1));
    return Object.freeze({ x: 0.04, y: -0.02 * settle, rz: 0.018, sx: 1.08, sy: 0.76 });
  }
  if (action === 'hurt') return hurtPose(type, phase, localFrame, track.frames);
  if (action === 'climb') return Object.freeze({ x: wave * 0.018, y: Math.abs(wave) * 0.055, rz: wave * 0.018, sx: 0.985, sy: 1.015 });
  if (action === 'death') return deathPose(type, phase, variant);
  return Object.freeze({ x: 0, y: Math.max(0, wave) * 0.012, rz: pulse * 0.006, sx: 1 + pulse * 0.004, sy: 1 - pulse * 0.004 });
}

export const PAWN_SLUG_ENEMY_ACTION_META = Object.freeze({
  theme: 'military-chess-soldiers',
  silhouetteByType: Object.freeze({ pawn: 'rifle-infantry-pawn', knight: 'assault-knight', rook: 'heavy-rook-gunner' }),
  actions: PAWN_SLUG_ENEMY_ACTIONS,
  authoredFacings: Object.freeze(['left']),
  runtimeFacings: Object.freeze(['left', 'right']),
  impactStyleByType: Object.freeze({ pawn: 'clear-backstep', knight: 'armored-twist', rook: 'heavy-compression' }),
  deathStyleByType: Object.freeze({ pawn: 'backward-collapse-grounded', knight: 'violent-tumble-grounded', rook: 'heavy-collapse-grounded' }),
  deathVariants: 3,
});
