import * as THREE from 'three';
import { squarePosition } from './Board3DBoardMath.js';
import { consumeWarRoomMoveFinishEvent } from './WarRoomMoveFinishEvent.js';

const EPSILON = 0.002;

const BODY_PROFILES = Object.freeze({
  p: Object.freeze({ lean: 0.052, anticipationLean: 0.018, compression: 0.018, landing: 0.014, airborneStretch: 0.004, sway: 0, brake: 0.012, rebound: 0.006 }),
  n: Object.freeze({ lean: 0.105, anticipationLean: -0.032, compression: 0.058, landing: 0.048, airborneStretch: 0.038, sway: 0.009, brake: 0.020, rebound: 0.055 }),
  b: Object.freeze({ lean: 0.036, anticipationLean: 0.006, compression: 0.008, landing: 0.010, airborneStretch: 0.008, sway: 0.020, brake: 0.010, rebound: 0.008 }),
  r: Object.freeze({ lean: 0.023, anticipationLean: -0.014, compression: 0.038, landing: 0.046, airborneStretch: 0.002, sway: 0, brake: 0.040, rebound: 0.010 }),
  q: Object.freeze({ lean: 0.030, anticipationLean: 0.006, compression: 0.006, landing: 0.008, airborneStretch: 0.010, sway: 0.005, brake: 0.007, rebound: 0.006 }),
  k: Object.freeze({ lean: 0.017, anticipationLean: -0.006, compression: 0.022, landing: 0.030, airborneStretch: 0.003, sway: 0, brake: 0.024, rebound: 0.008 }),
});

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function bell(start, peak, end, progress) {
  const p = clamp01(progress);
  if (p <= start || p >= end) return 0;
  if (p <= peak) return smoothstep(start, peak, p);
  return 1 - smoothstep(peak, end, p);
}

export function derivePieceBodyPose({
  type = 'p',
  progress = 0,
  dx = 0,
  dz = 0,
  airborne = 0,
  travelDistance = 0,
  promotionEnergy = 0,
  checkmateFinish = false,
  coarsePointer = false,
} = {}) {
  const normalizedType = String(type || 'p').toLowerCase();
  const profile = BODY_PROFILES[normalizedType] || BODY_PROFILES.p;
  const p = clamp01(progress);
  const air = clamp01(airborne);
  const amplitude = coarsePointer ? 0.60 : 1;
  const distance = Math.hypot(dx, dz);
  const ux = distance > EPSILON ? dx / distance : 0;
  const uz = distance > EPSILON ? dz / distance : 0;

  const anticipation = 1 - smoothstep(0, 0.18, p);
  const transit = Math.sin(Math.PI * p);
  const landingPhase = clamp01((p - 0.68) / 0.32);
  const landing = p > 0.68 ? Math.sin(Math.PI * landingPhase) : 0;
  const braking = bell(0.58, 0.78, 0.96, p);
  const rebound = bell(0.80, 0.91, 0.995, p);
  const mateSeal = checkmateFinish ? bell(0.70, 0.90, 0.998, p) * amplitude : 0;
  const diagonalPawnCapture = normalizedType === 'p' && Math.abs(ux) > 0.25 && Math.abs(uz) > 0.25;
  const captureDrive = diagonalPawnCapture ? bell(0.32, 0.67, 0.92, p) * 0.060 * amplitude : 0;
  const castleBrace = normalizedType === 'k' && Number(travelDistance) > 1.5
    ? bell(0.08, 0.48, 0.90, p) * 0.020 * amplitude
    : 0;
  const promotion = clamp01(promotionEnergy) * amplitude;

  const sway = profile.sway * Math.sin(Math.PI * 2 * p) * amplitude;
  const transitLean = profile.lean * transit;
  const anticipationLean = profile.anticipationLean * anticipation;
  const brakeLean = profile.brake * braking;
  const mateLean = mateSeal * 0.016;
  const lean = (transitLean + anticipationLean - brakeLean) * amplitude - mateLean;
  const compression = (profile.compression * anticipation + profile.landing * landing) * amplitude;
  const stretch = profile.airborneStretch * air * transit * amplitude;
  const reboundLift = profile.rebound * rebound * amplitude;

  return {
    pitch: uz * lean + ux * sway,
    roll: -ux * lean + uz * sway,
    yaw: castleBrace * (ux >= 0 ? -1 : 1),
    xOffset: ux * captureDrive,
    zOffset: uz * captureDrive,
    yOffset: -compression * 0.055 + stretch * 0.025 + reboundLift * 0.055 + promotion * 0.020 + mateSeal * 0.008,
    scaleY: 1 - compression + stretch + reboundLift + promotion * 0.040 + mateSeal * 0.022,
    scaleXZ: 1 + compression * 0.30 - stretch * 0.12 - reboundLift * 0.10 - promotion * 0.012 - mateSeal * 0.008,
    finish: {
      braking,
      rebound,
      diagonalPawnCapture,
      castleBrace: castleBrace > 0,
      promotion: promotion > 0,
      checkmate: mateSeal > 0,
    },
  };
}

function isStaticRootChild(child) {
  return Boolean(child?.userData?.contactShadow || child?.userData?.touchHitTarget);
}

function promotionEnergyFor(group) {
  const baseScale = group?.userData?.baseScale;
  if (!baseScale?.isVector3) return 0;
  const ratios = [
    Number(group.scale?.x) / Math.max(EPSILON, Number(baseScale.x) || 1),
    Number(group.scale?.y) / Math.max(EPSILON, Number(baseScale.y) || 1),
    Number(group.scale?.z) / Math.max(EPSILON, Number(baseScale.z) || 1),
  ].filter(Number.isFinite);
  const peakRatio = ratios.length ? Math.max(...ratios) : 1;
  return clamp01((peakRatio - 1) / 0.085);
}

export function installPieceBodyMotion(group, type, { coarsePointer = false } = {}) {
  if (!group?.isObject3D || group.userData?.board3DBodyMotionProfile) return group;

  const body = new THREE.Group();
  body.name = 'board3d-motion-body';
  body.userData.board3DBodyMotionBody = true;

  const movableChildren = [...group.children].filter((child) => !isStaticRootChild(child));
  for (const child of movableChildren) body.add(child);
  if (movableChildren.length === 0) return group;
  group.add(body);

  const basePosition = body.position.clone();
  const baseQuaternion = body.quaternion.clone();
  const baseScale = body.scale.clone();
  const motionEuler = new THREE.Euler(0, 0, 0, 'XYZ');
  const motionQuaternion = new THREE.Quaternion();
  const state = {
    targetSquare: '',
    maxDistance: 0,
    lastFrame: -1,
    active: false,
    finishEvent: null,
  };

  function resetPose() {
    if (!state.active) return false;
    body.position.copy(basePosition);
    body.quaternion.copy(baseQuaternion);
    body.scale.copy(baseScale);
    state.active = false;
    state.finishEvent = null;
    group.userData.board3DBodyFinishState = null;
    return true;
  }

  function updatePose(renderer) {
    const frame = Number(renderer?.info?.render?.frame);
    if (Number.isFinite(frame) && state.lastFrame === frame) return;
    if (Number.isFinite(frame)) state.lastFrame = frame;

    const targetSquare = String(group.userData?.square || '');
    if (!targetSquare) {
      if (resetPose()) group.updateMatrixWorld(true);
      return;
    }

    const target = squarePosition(targetSquare);
    const dx = target.x - group.position.x;
    const dz = target.z - group.position.z;
    const remaining = Math.hypot(dx, dz);

    if (state.targetSquare !== targetSquare) {
      state.targetSquare = targetSquare;
      state.maxDistance = remaining;
      state.finishEvent = remaining > EPSILON ? consumeWarRoomMoveFinishEvent(targetSquare) : null;
    } else if (remaining > state.maxDistance) {
      // Handles a reconciled/interrupted animation without retaining stale travel.
      state.maxDistance = remaining;
      if (!state.finishEvent) state.finishEvent = consumeWarRoomMoveFinishEvent(targetSquare);
    }

    if (remaining <= EPSILON || state.maxDistance <= EPSILON) {
      state.maxDistance = 0;
      if (resetPose()) group.updateMatrixWorld(true);
      return;
    }

    const progress = clamp01(1 - remaining / state.maxDistance);
    const baseY = Number(group.userData?.baseY ?? 0.1);
    const airborne = clamp01((group.position.y - baseY) / 0.25);
    const pose = derivePieceBodyPose({
      type,
      progress,
      dx,
      dz,
      airborne,
      travelDistance: state.maxDistance,
      promotionEnergy: promotionEnergyFor(group),
      checkmateFinish: state.finishEvent?.checkmate === true,
      coarsePointer,
    });

    body.position.set(
      basePosition.x + pose.xOffset,
      basePosition.y + pose.yOffset,
      basePosition.z + pose.zOffset,
    );
    motionEuler.set(pose.pitch, pose.yaw, pose.roll, 'XYZ');
    motionQuaternion.setFromEuler(motionEuler);
    body.quaternion.copy(baseQuaternion).multiply(motionQuaternion);
    body.scale.set(
      baseScale.x * pose.scaleXZ,
      baseScale.y * pose.scaleY,
      baseScale.z * pose.scaleXZ,
    );
    state.active = true;
    group.userData.board3DBodyFinishState = pose.finish;
    group.updateMatrixWorld(true);
  }

  body.traverse((child) => {
    if (!child?.isMesh || isStaticRootChild(child)) return;
    const previous = child.onBeforeRender;
    child.onBeforeRender = function onBeforeRender(...args) {
      previous?.apply(this, args);
      updatePose(args[0]);
    };
  });

  group.userData.board3DBodyMotionProfile = coarsePointer ? 'piece-body-lite-v1' : 'piece-body-v1';
  group.userData.board3DBodyMotionType = String(type || 'p').toLowerCase();
  group.userData.board3DBodyFinishProfile = coarsePointer ? 'piece-finish-lite-v1' : 'piece-finish-v1';
  group.userData.board3DCheckmateFinishProfile = coarsePointer ? 'mate-seal-lite-v1' : 'mate-seal-v1';
  return group;
}

export { BODY_PROFILES };
