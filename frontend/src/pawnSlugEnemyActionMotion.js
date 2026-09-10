const TAU = Math.PI * 2;

export const PAWN_SLUG_ENEMY_ACTIONS = Object.freeze({
  idle: Object.freeze({ frames: 12, rate: 5.2 }),
  run: Object.freeze({ frames: 16, rate: 15.5 }),
  jump: Object.freeze({ frames: 10, rate: 12 }),
  crouch: Object.freeze({ frames: 8, rate: 10 }),
  hurt: Object.freeze({ frames: 6, rate: 18 }),
  climb: Object.freeze({ frames: 12, rate: 11.5 }),
});

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function wrapFrame(value, count) {
  return ((Math.floor(value) % count) + count) % count;
}

export function pawnSlugEnemyActionForState({ moving = false, hurt = false, airborne = false, crouch = false, climbing = false } = {}) {
  if (hurt) return 'hurt';
  if (climbing) return 'climb';
  if (airborne) return 'jump';
  if (crouch) return 'crouch';
  if (moving) return 'run';
  return 'idle';
}

export function pawnSlugEnemyActionFrame(action = 'idle', time = 0) {
  const track = PAWN_SLUG_ENEMY_ACTIONS[action] || PAWN_SLUG_ENEMY_ACTIONS.idle;
  return wrapFrame((Number(time) || 0) * track.rate, track.frames);
}

export function pawnSlugEnemySourceFrame(action = 'idle', actionFrame = 0, sourceFrames = 8) {
  const count = Math.max(1, Math.floor(sourceFrames) || 1);
  const track = PAWN_SLUG_ENEMY_ACTIONS[action] || PAWN_SLUG_ENEMY_ACTIONS.idle;
  const phase = wrapFrame(actionFrame, track.frames) / track.frames;
  if (action === 'idle') return 0;
  if (action === 'hurt') return Math.min(count - 1, Math.floor(phase * 3));
  if (action === 'crouch') return Math.min(count - 1, Math.floor(phase * 4));
  if (action === 'jump') return Math.min(count - 1, Math.floor(phase * count));
  if (action === 'climb') return Math.min(count - 1, Math.floor(phase * count));
  return Math.min(count - 1, Math.floor(phase * count));
}

export function pawnSlugEnemyActionPose(action = 'idle', actionFrame = 0, { vy = 0, type = 'pawn' } = {}) {
  const track = PAWN_SLUG_ENEMY_ACTIONS[action] || PAWN_SLUG_ENEMY_ACTIONS.idle;
  const phase = wrapFrame(actionFrame, track.frames) / track.frames;
  const wave = Math.sin(phase * TAU);
  const pulse = Math.cos(phase * TAU);
  const weight = type === 'rook' ? 0.58 : type === 'knight' ? 1.12 : 1;

  if (action === 'run') {
    return Object.freeze({ x: wave * 0.028 * weight, y: Math.abs(wave) * 0.035 * weight, rz: -wave * 0.025 * weight, sx: 1 + pulse * 0.012, sy: 1 - pulse * 0.018 });
  }
  if (action === 'jump') {
    const ascending = Number(vy) > 0;
    return Object.freeze({ x: 0, y: ascending ? 0.055 : -0.018, rz: ascending ? -0.055 : 0.045, sx: ascending ? 0.965 : 1.035, sy: ascending ? 1.055 : 0.965 });
  }
  if (action === 'crouch') {
    const settle = clamp01(actionFrame / Math.max(1, track.frames - 1));
    return Object.freeze({ x: 0.04, y: -0.02 * settle, rz: 0.018, sx: 1.08, sy: 0.76 });
  }
  if (action === 'hurt') {
    const decay = 1 - clamp01(actionFrame / Math.max(1, track.frames - 1));
    return Object.freeze({ x: -0.085 * decay, y: Math.sin(phase * Math.PI) * 0.035, rz: 0.11 * decay, sx: 1.07, sy: 0.9 });
  }
  if (action === 'climb') {
    return Object.freeze({ x: wave * 0.018, y: Math.abs(wave) * 0.055, rz: wave * 0.018, sx: 0.985, sy: 1.015 });
  }
  return Object.freeze({ x: 0, y: Math.max(0, wave) * 0.012, rz: pulse * 0.006, sx: 1 + pulse * 0.004, sy: 1 - pulse * 0.004 });
}

export const PAWN_SLUG_ENEMY_ACTION_META = Object.freeze({
  theme: 'military-chess-soldiers',
  silhouetteByType: Object.freeze({ pawn: 'rifle-infantry-pawn', knight: 'assault-knight', rook: 'heavy-rook-gunner' }),
  actions: PAWN_SLUG_ENEMY_ACTIONS,
  authoredFacings: Object.freeze(['left']),
  runtimeFacings: Object.freeze(['left', 'right']),
});
