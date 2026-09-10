function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function pawnSlugMatthiasPremiumPose({
  time = 0,
  airborne = false,
  firing = false,
  hurt = false,
  crouch = false,
  previousAirborne = false,
  landedAt = Number.NEGATIVE_INFINITY,
  jumpFrame = 0,
  jumpFrames = 9,
} = {}) {
  const safeTime = Number(time) || 0;
  const jumpProgress = clamp01((Number(jumpFrame) || 0) / Math.max(1, jumpFrames - 1));
  const landingAge = Math.max(0, safeTime - (Number(landedAt) || 0));
  const landing = previousAirborne && !airborne ? 1 : clamp01(1 - landingAge / 0.14);

  let sx = 1;
  let sy = 1;
  let y = 0;
  let rz = 0;

  if (airborne) {
    const ascent = jumpProgress < 0.48;
    sx *= ascent ? 0.965 : 1.025;
    sy *= ascent ? 1.045 : 0.975;
    y += ascent ? 0.025 : -0.012;
  }
  if (crouch) {
    sx *= 1.018;
    sy *= 0.985;
  }
  if (landing > 0) {
    const pulse = Math.sin(landing * Math.PI) * landing;
    sx *= 1 + pulse * 0.06;
    sy *= 1 - pulse * 0.085;
    y -= pulse * 0.035;
  }
  if (firing) {
    sx *= 1.018;
    rz -= 0.012;
  }
  if (hurt) {
    sx *= 1.045;
    sy *= 0.93;
    rz += 0.065;
    y += 0.025;
  }

  return Object.freeze({ sx, sy, y, rz, landing });
}

export function applyPawnSlugMatthiasPremiumMotion(sprite, state = {}) {
  if (!sprite) return null;
  const time = Number(state.time) || 0;
  const previousAirborne = Boolean(sprite.userData.premiumWasAirborne);
  if (previousAirborne && !state.airborne) sprite.userData.premiumLandedAt = time;
  const animation = sprite.userData.animation || {};
  const pose = pawnSlugMatthiasPremiumPose({
    ...state,
    time,
    previousAirborne,
    landedAt: sprite.userData.premiumLandedAt,
    jumpFrame: animation.frameIndex,
  });
  sprite.userData.premiumWasAirborne = Boolean(state.airborne);
  sprite.userData.premiumPose = pose;
  sprite.position.y += pose.y;
  sprite.scale.x *= pose.sx;
  sprite.scale.y *= pose.sy;
  sprite.material.rotation += pose.rz * (state.dir < 0 ? -1 : 1);
  return pose;
}
