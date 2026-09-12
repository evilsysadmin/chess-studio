import { PAWN_SLUG_PISTOL_FEEL, pawnSlugPistolFirePhase } from './pawnSlugPistolFeel.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function pawnSlugJumpVisualPhase(progress = 0) {
  const p = clamp01(progress);
  if (p < 0.18) return 'takeoff';
  if (p < 0.48) return 'rise';
  if (p < 0.68) return 'apex';
  return 'fall';
}

export function pawnSlugLandingVisualStrength(airtime = 0) {
  const seconds = Math.max(0, Number(airtime) || 0);
  return Math.max(0.72, Math.min(1.25, 0.72 + seconds * 0.38));
}

function applyWeaponRecoil(pose, weapon, time) {
  if (weapon === 'machinegun') {
    const chatter = 0.5 + Math.sin((Number(time) || 0) * 58) * 0.5;
    pose.sx *= 1.014 + chatter * 0.012;
    pose.sy *= 0.994;
    pose.y += 0.004 + chatter * 0.005;
    pose.rz -= 0.015 + chatter * 0.014;
    return 'machinegun-chatter';
  }
  if (weapon === 'shotgun') {
    pose.sx *= 1.05;
    pose.sy *= 0.972;
    pose.y += 0.012;
    pose.rz += 0.052;
    return 'shotgun-kick';
  }
  if (weapon === 'panzerfaust') {
    pose.sx *= 1.072;
    pose.sy *= 0.948;
    pose.y -= 0.012;
    pose.rz += 0.078;
    return 'panzerfaust-brace';
  }
  pose.sx *= 1.018;
  pose.rz -= 0.012;
  return 'generic';
}

export function pawnSlugMatthiasPremiumPose({
  time = 0,
  airborne = false,
  running = false,
  firing = false,
  hurt = false,
  crouch = false,
  weapon = 'pistol',
  pistolPhase = null,
  previousAirborne = false,
  landedAt = Number.NEGATIVE_INFINITY,
  landingStrength = 1,
  jumpFrame = 0,
  jumpFrames = 9,
} = {}) {
  const safeTime = Number(time) || 0;
  const jumpProgress = clamp01((Number(jumpFrame) || 0) / Math.max(1, jumpFrames - 1));
  const jumpPhase = airborne ? pawnSlugJumpVisualPhase(jumpProgress) : 'ground';
  const landingAge = Math.max(0, safeTime - (Number(landedAt) || 0));
  const landing = previousAirborne && !airborne ? 1 : clamp01(1 - landingAge / 0.14);
  const impact = Math.max(0.72, Math.min(1.25, Number(landingStrength) || 1));

  let sx = 1;
  let sy = 1;
  let y = 0;
  let rz = 0;
  let locomotion = 'ground';
  let weaponRecoil = 'idle';

  if (jumpPhase === 'takeoff') {
    sx *= 1.055;
    sy *= 0.94;
    y -= 0.034;
    rz -= 0.032;
  } else if (jumpPhase === 'rise') {
    sx *= 0.965;
    sy *= 1.045;
    y += 0.025;
    rz -= 0.018;
  } else if (jumpPhase === 'apex') {
    sx *= 1.01;
    sy *= 1.015;
    y += 0.012;
  } else if (jumpPhase === 'fall') {
    sx *= 1.035;
    sy *= 0.965;
    y -= 0.016;
    rz += 0.028;
  }
  if (crouch) {
    sx *= 1.018;
    sy *= 0.985;
    locomotion = 'crouch';
  } else if (running && !airborne) {
    sx *= 1.018;
    sy *= 0.992;
    y -= 0.006;
    rz -= 0.018;
    locomotion = 'run-forward';
  }
  if (landing > 0) {
    const pulse = Math.sin(landing * Math.PI) * landing * impact;
    sx *= 1 + pulse * 0.06;
    sy *= 1 - pulse * 0.085;
    y -= pulse * 0.035;
  }

  if (weapon === 'pistol' && pistolPhase?.active) {
    weaponRecoil = `pistol-${pistolPhase.phase}`;
    if (pistolPhase.phase === 'raise') {
      const p = clamp01(pistolPhase.progress);
      y += 0.018 * p;
      rz -= 0.024 * p;
      sx *= 1 + 0.008 * p;
    } else if (pistolPhase.phase === 'blast') {
      const snap = 1 - clamp01(pistolPhase.progress);
      y += 0.018;
      rz += 0.042 * snap;
      sx *= 1.028;
      sy *= 0.992;
    } else if (pistolPhase.phase === 'recover') {
      const settle = 1 - clamp01(pistolPhase.progress);
      y += 0.012 * settle;
      rz -= 0.016 * settle;
      sx *= 1 + 0.01 * settle;
    }
  } else if (firing) {
    const pose = { sx, sy, y, rz };
    weaponRecoil = applyWeaponRecoil(pose, weapon, safeTime);
    ({ sx, sy, y, rz } = pose);
  }

  if (hurt) {
    sx *= 1.045;
    sy *= 0.93;
    rz += 0.065;
    y += 0.025;
  }

  return Object.freeze({
    sx,
    sy,
    y,
    rz,
    landing,
    landingStrength: impact,
    jumpPhase,
    locomotion,
    pistolPhase: pistolPhase?.phase || 'idle',
    weaponRecoil,
  });
}

export function applyPawnSlugMatthiasPremiumMotion(sprite, state = {}) {
  if (!sprite) return null;
  const time = Number(state.time) || 0;
  const previousAirborne = Boolean(sprite.userData.premiumWasAirborne);
  if (!previousAirborne && state.airborne) sprite.userData.premiumAirborneStartedAt = time;
  if (previousAirborne && !state.airborne) {
    sprite.userData.premiumLandedAt = time;
    const startedAt = Number(sprite.userData.premiumAirborneStartedAt);
    const airtime = Number.isFinite(startedAt) ? Math.max(0, time - startedAt) : 0;
    sprite.userData.premiumLandingStrength = pawnSlugLandingVisualStrength(airtime);
  }
  const animation = sprite.userData.animation || {};
  const weapon = animation.weapon || 'pistol';

  if (weapon === 'pistol' && state.firing && !sprite.userData.premiumWasFiring) {
    sprite.userData.pistolFireStartedAt = time;
  }
  const pistolAge = Math.max(0, time - (sprite.userData.pistolFireStartedAt ?? Number.NEGATIVE_INFINITY));
  const pistolRemaining = weapon === 'pistol'
    ? Math.max(0, PAWN_SLUG_PISTOL_FEEL.recoilSeconds - pistolAge)
    : 0;
  const pistolPhase = pawnSlugPistolFirePhase(pistolRemaining);

  const pose = pawnSlugMatthiasPremiumPose({
    ...state,
    time,
    weapon,
    pistolPhase,
    previousAirborne,
    landedAt: sprite.userData.premiumLandedAt,
    landingStrength: sprite.userData.premiumLandingStrength,
    jumpFrame: animation.frameIndex,
  });
  sprite.userData.premiumWasAirborne = Boolean(state.airborne);
  sprite.userData.premiumWasFiring = Boolean(state.firing);
  sprite.userData.premiumPose = pose;
  sprite.position.y += pose.y;
  sprite.scale.x *= pose.sx;
  sprite.scale.y *= pose.sy;
  sprite.material.rotation += pose.rz * (state.dir < 0 ? -1 : 1);
  return pose;
}
