import * as THREE from 'three';
import { squarePosition } from './Board3DBoardMath.js';

const EPSILON = 0.002;

const BODY_PROFILES = Object.freeze({
  p: Object.freeze({ lean: 0.052, anticipationLean: 0.018, compression: 0.018, landing: 0.014, airborneStretch: 0.004, sway: 0 }),
  n: Object.freeze({ lean: 0.105, anticipationLean: -0.032, compression: 0.058, landing: 0.048, airborneStretch: 0.038, sway: 0.009 }),
  b: Object.freeze({ lean: 0.036, anticipationLean: 0.006, compression: 0.008, landing: 0.010, airborneStretch: 0.008, sway: 0.020 }),
  r: Object.freeze({ lean: 0.023, anticipationLean: -0.014, compression: 0.038, landing: 0.046, airborneStretch: 0.002, sway: 0 }),
  q: Object.freeze({ lean: 0.030, anticipationLean: 0.006, compression: 0.006, landing: 0.008, airborneStretch: 0.010, sway: 0.005 }),
  k: Object.freeze({ lean: 0.017, anticipationLean: -0.006, compression: 0.022, landing: 0.030, airborneStretch: 0.003, sway: 0 }),
});

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function derivePieceBodyPose({
  type = 'p',
  progress = 0,
  dx = 0,
  dz = 0,
  airborne = 0,
  coarsePointer = false,
} = {}) {
  const profile = BODY_PROFILES[String(type || 'p').toLowerCase()] || BODY_PROFILES.p;
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
  const sway = profile.sway * Math.sin(Math.PI * 2 * p) * amplitude;
  const lean = (profile.lean * transit + profile.anticipationLean * anticipation) * amplitude;
  const compression = (profile.compression * anticipation + profile.landing * landing) * amplitude;
  const stretch = profile.airborneStretch * air * transit * amplitude;

  return {
    pitch: uz * lean + ux * sway,
    roll: -ux * lean + uz * sway,
    yOffset: -compression * 0.055 + stretch * 0.025,
    scaleY: 1 - compression + stretch,
    scaleXZ: 1 + compression * 0.30 - stretch * 0.12,
  };
}

function isStaticRootChild(child) {
  return Boolean(child?.userData?.contactShadow || child?.userData?.touchHitTarget);
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
  };

  function resetPose() {
    if (!state.active) return false;
    body.position.copy(basePosition);
    body.quaternion.copy(baseQuaternion);
    body.scale.copy(baseScale);
    state.active = false;
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
    } else if (remaining > state.maxDistance) {
      // Handles a reconciled/interrupted animation without retaining stale travel.
      state.maxDistance = remaining;
    }

    if (remaining <= EPSILON || state.maxDistance <= EPSILON) {
      state.maxDistance = 0;
      if (resetPose()) group.updateMatrixWorld(true);
      return;
    }

    const progress = clamp01(1 - remaining / state.maxDistance);
    const baseY = Number(group.userData?.baseY ?? 0.1);
    const airborne = clamp01((group.position.y - baseY) / 0.25);
    const pose = derivePieceBodyPose({ type, progress, dx, dz, airborne, coarsePointer });

    body.position.set(basePosition.x, basePosition.y + pose.yOffset, basePosition.z);
    motionEuler.set(pose.pitch, 0, pose.roll, 'XYZ');
    motionQuaternion.setFromEuler(motionEuler);
    body.quaternion.copy(baseQuaternion).multiply(motionQuaternion);
    body.scale.set(
      baseScale.x * pose.scaleXZ,
      baseScale.y * pose.scaleY,
      baseScale.z * pose.scaleXZ,
    );
    state.active = true;
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
  return group;
}

export { BODY_PROFILES };
