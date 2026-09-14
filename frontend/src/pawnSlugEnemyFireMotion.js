const PROFILE_BY_TYPE = Object.freeze({
  pawn: Object.freeze({ aimX: 0.026, aimY: 0.008, aimLean: 0.034, kickX: 0.115, kickY: 0.02, kickLean: 0.085, recoilDecay: 8.8 }),
  knight: Object.freeze({ aimX: 0.034, aimY: 0.012, aimLean: 0.052, kickX: 0.145, kickY: 0.03, kickLean: 0.118, recoilDecay: 10.5 }),
  rook: Object.freeze({ aimX: 0.015, aimY: 0.006, aimLean: 0.022, kickX: 0.078, kickY: 0.015, kickLean: 0.052, recoilDecay: 6.5 }),
});

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function profileFor(type) {
  return PROFILE_BY_TYPE[type] || PROFILE_BY_TYPE.pawn;
}

export function pawnSlugEnemyDidFire(previousTelegraph = 0, currentTelegraph = 0, fireCooldown = 0) {
  return Number(previousTelegraph) > 0.45
    && Number(currentTelegraph) <= 0
    && Number(fireCooldown) > 0;
}

export function pawnSlugEnemyRecoilStep(recoil = 0, dt = 0, type = 'pawn') {
  const profile = profileFor(type);
  return Math.max(0, clamp01(recoil) - Math.max(0, Number(dt) || 0) * profile.recoilDecay);
}

export function pawnSlugEnemyFireMotion(type = 'pawn', telegraph = 0, recoil = 0, { reducedMotion = false } = {}) {
  const profile = profileFor(type);
  const aim = clamp01(telegraph);
  const kick = clamp01(recoil);
  const motionScale = reducedMotion ? 0.35 : 1;
  return Object.freeze({
    x: (aim * profile.aimX - kick * profile.kickX) * motionScale,
    y: (-aim * profile.aimY + kick * profile.kickY) * motionScale,
    rz: (-aim * profile.aimLean + kick * profile.kickLean) * motionScale,
    sy: 1 - aim * 0.012 * motionScale + kick * 0.016 * motionScale,
  });
}

export const PAWN_SLUG_ENEMY_FIRE_MOTION_META = Object.freeze({
  version: 'premium-prefire-recoil-v1',
  types: Object.freeze(Object.keys(PROFILE_BY_TYPE)),
  profileByType: PROFILE_BY_TYPE,
  transitionDetection: 'telegraph-release-plus-cooldown',
  reducedMotionScale: 0.35,
});
