import * as THREE from 'three';

export const WAR_ROOM_HANS_MOTION_POLISH_VERSION = 'grounded-butler-motion-v1';

const HANS_NAME = 'war-room-hans-butler';
const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const FIREPLACE_NAME = 'war-room-fireplace';
const SERVICE_DOOR_NAME = 'war-room-hans-service-door';
const VISUAL_ROOT_NAME = 'war-room-hans-visual-root';
const BASE_HANS_Y = -0.34;
const SAFE_CORRIDOR_FRAME_X = 1.82;
const SAFE_DOOR_APPROACH_FRAME_X = 2.08;
const MAX_DT_SECONDS = 0.1;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const MOVING_PHASES = new Set([
  'fire-dimming',
  'walk-to-basket',
  'carry-log',
  'take-poker',
  'stoke-fire',
  'return-poker',
  'leave',
]);

const ACTION_CATCHUP_PHASES = new Set([
  'take-log',
  'place-log',
  'satisfied',
]);

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function planarDistance(a, b) {
  return Math.hypot(Number(a?.x || 0) - Number(b?.x || 0), Number(a?.z || 0) - Number(b?.z || 0));
}

function moveTowardsPlanar(current, target, maxDistance) {
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  const distance = Math.hypot(dx, dz);
  if (!Number.isFinite(distance) || distance <= maxDistance || distance < 0.000001) {
    current.x = target.x;
    current.z = target.z;
    return distance;
  }
  const scale = maxDistance / distance;
  current.x += dx * scale;
  current.z += dz * scale;
  return maxDistance;
}

function motionProfile(phase, route) {
  if (ACTION_CATCHUP_PHASES.has(phase)) return { maxSpeed: 1.22, maxLag: 0.16, cadence: 2.1 };
  if (phase === 'take-poker') return { maxSpeed: 1.02, maxLag: 0.42, cadence: 2.35 };
  if (phase === 'return-poker') return { maxSpeed: 0.98, maxLag: 0.4, cadence: 2.3 };
  if (phase === 'carry-log') return { maxSpeed: 0.88, maxLag: 0.34, cadence: 2.25 };
  if (phase === 'stoke-fire') return { maxSpeed: 0.92, maxLag: 0.4, cadence: 2.3 };
  if (phase === 'leave' || String(route || '').startsWith('leave-')) {
    return { maxSpeed: 0.94, maxLag: 0.48, cadence: 2.25 };
  }
  if (phase === 'fire-dimming' || phase === 'walk-to-basket') {
    return { maxSpeed: 0.92, maxLag: 0.4, cadence: 2.3 };
  }
  return { maxSpeed: 1.18, maxLag: 0.2, cadence: 2.05 };
}

function inferSide(fireplace, door) {
  const declared = Number(door?.userData?.refs?.side);
  if (declared === -1 || declared === 1) return declared;
  return Math.sign(Number(fireplace?.position?.x || -1)) || -1;
}

function ensureVisualRoot(hans) {
  if (!hans) return null;
  const existing = hans.getObjectByName?.(VISUAL_ROOT_NAME);
  if (existing) return existing;

  const body = hans.userData?.refs;
  if (!body) return null;

  const visualRoot = new THREE.Group();
  visualRoot.name = VISUAL_ROOT_NAME;
  visualRoot.userData.warRoomHansMotionPolish = WAR_ROOM_HANS_MOTION_POLISH_VERSION;
  hans.add(visualRoot);

  const parts = [
    body.leftLeg,
    body.rightLeg,
    body.torso,
    body.leftArm,
    body.rightArm,
    body.head,
    body.carriedLog,
    body.carriedPoker,
  ];
  const seen = new Set();
  for (const part of parts) {
    if (!part || seen.has(part)) continue;
    seen.add(part);
    visualRoot.add(part);
  }

  const bases = {};
  for (const [key, part] of Object.entries(body)) {
    if (!part?.position || !part?.rotation) continue;
    bases[key] = {
      positionY: part.position.y,
      rotationY: part.rotation.y,
      rotationZ: part.rotation.z,
    };
  }
  visualRoot.userData.poseBases = bases;
  return visualRoot;
}

function resetSecondaryPose(body, bases) {
  for (const [key, base] of Object.entries(bases || {})) {
    const part = body?.[key];
    if (!part) continue;
    part.position.y = base.positionY;
    part.rotation.y = base.rotationY;
    part.rotation.z = base.rotationZ;
  }
}

function applySecondaryPose({ body, visualRoot, phase, moving, gaitClock, yawDelta, now }) {
  const bases = visualRoot.userData.poseBases || {};
  resetSecondaryPose(body, bases);

  const wave = Math.sin(gaitClock);
  const stepPulse = (1 - Math.cos(gaitClock * 2)) * 0.5;
  const turnAmount = THREE.MathUtils.clamp(yawDelta * 4.2, -1, 1);

  if (moving) {
    const legSwing = wave * 0.105;
    if (body.leftLeg) body.leftLeg.rotation.x = legSwing;
    if (body.rightLeg) body.rightLeg.rotation.x = -legSwing;

    if (body.torso && bases.torso) {
      body.torso.position.y = bases.torso.positionY + stepPulse * 0.018;
      body.torso.rotation.y = bases.torso.rotationY + wave * 0.026;
      body.torso.rotation.z = bases.torso.rotationZ - wave * 0.014;
    }
    if (body.head && bases.head) {
      body.head.position.y = bases.head.positionY + stepPulse * 0.011;
      body.head.rotation.y = bases.head.rotationY - wave * 0.016;
      body.head.rotation.z = bases.head.rotationZ + wave * 0.01;
    }
    if (body.leftArm && bases.leftArm) {
      body.leftArm.position.y = bases.leftArm.positionY + stepPulse * 0.007;
      body.leftArm.rotation.z = bases.leftArm.rotationZ + wave * 0.018;
    }
    if (body.rightArm && bases.rightArm) {
      body.rightArm.position.y = bases.rightArm.positionY + stepPulse * 0.007;
      body.rightArm.rotation.z = bases.rightArm.rotationZ - wave * 0.018;
    }

    // The simple rigid-leg rig raises both soles slightly when the hips swing.
    // Compensate at the visual-root level so horizontal travel reads as planted
    // footsteps instead of the whole butler hovering a centimetre above stone.
    visualRoot.position.y = -Math.abs(wave) * 0.014;
  } else {
    const breathe = Math.sin(now * 0.00155);
    visualRoot.position.y = 0;
    if (body.torso && bases.torso) body.torso.position.y = bases.torso.positionY + breathe * 0.006;
    if (body.head && bases.head) body.head.position.y = bases.head.positionY + breathe * 0.003;

    if (Math.abs(turnAmount) > 0.02) {
      if (body.leftLeg) body.leftLeg.rotation.z = turnAmount * 0.035;
      if (body.rightLeg) body.rightLeg.rotation.z = -turnAmount * 0.035;
      if (body.torso && bases.torso) body.torso.rotation.y = bases.torso.rotationY + turnAmount * 0.04;
      if (body.head && bases.head) body.head.rotation.y = bases.head.rotationY - turnAmount * 0.025;
    }
  }

  if (phase === 'stoke-fire' && !moving) {
    const stokeSway = Math.sin(now * 0.0074);
    if (body.torso && bases.torso) body.torso.rotation.y += stokeSway * 0.034;
    if (body.head && bases.head) body.head.rotation.y -= stokeSway * 0.018;
  } else if (phase === 'satisfied') {
    if (body.torso && bases.torso) body.torso.rotation.z = bases.torso.rotationZ - 0.012;
    if (body.head && bases.head) body.head.rotation.z = bases.head.rotationZ + 0.018;
  }
}

export function safeHansDoorFrameX(frameX, { doorOpen = 0, nearDoor = false } = {}) {
  const open = clamp01(doorOpen);
  const approach = nearDoor ? clamp01((open - 0.72) / 0.28) : 0;
  const allowed = THREE.MathUtils.lerp(SAFE_CORRIDOR_FRAME_X, SAFE_DOOR_APPROACH_FRAME_X, approach);
  return Math.min(Number(frameX) || 0, allowed);
}

function applyLeaveWallClearance({ phase, route, visiblePosition, side, door, doorDepth }) {
  if (phase !== 'leave' && !String(route || '').startsWith('leave-')) return false;
  const open = Number(door?.userData?.warRoomHansDoorOpen || 0);
  const absoluteDepth = Math.abs(Number(visiblePosition.z || 0));
  const nearDoor = Number.isFinite(doorDepth) && doorDepth > 0
    ? absoluteDepth >= doorDepth * 0.72
    : String(route || '') === 'leave-corridor';
  const frameX = visiblePosition.x / side;
  const safeFrameX = safeHansDoorFrameX(frameX, { doorOpen: open, nearDoor });
  if (safeFrameX >= frameX - 0.0001) return false;
  visiblePosition.x = side * safeFrameX;
  return true;
}

function localCorrectionForYaw(logical, visible, yaw) {
  return new THREE.Vector3(
    visible.x - logical.x,
    0,
    visible.z - logical.z,
  ).applyAxisAngle(Y_AXIS, -yaw);
}

export function installWarRoomHansMotionPolish(root) {
  if (!root) return 0;
  const hans = root.getObjectByName?.(HANS_NAME);
  const driver = root.getObjectByName?.(DRIVER_NAME);
  const fireplace = root.getObjectByName?.(FIREPLACE_NAME);
  if (!hans || !driver || !fireplace || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansMotionPolish === WAR_ROOM_HANS_MOTION_POLISH_VERSION) return 0;

  const visualRoot = ensureVisualRoot(hans);
  const body = hans.userData?.refs;
  if (!visualRoot || !body) return 0;

  const door = root.getObjectByName?.(SERVICE_DOOR_NAME);
  const side = inferSide(fireplace, door);
  const doorDepth = Math.abs(Number(door?.userData?.refs?.doorZ) - Number(fireplace.position.z));
  const original = driver.onBeforeRender;
  const visiblePosition = new THREE.Vector3(hans.position.x, 0, hans.position.z);
  const previousLogical = new THREE.Vector3(hans.position.x, 0, hans.position.z);
  let previousNow = null;
  let previousYaw = hans.rotation.y;
  let gaitClock = 0;

  const wrapped = (...args) => {
    original(...args);
    const now = nowMs();
    const dt = previousNow == null ? 0 : Math.min(MAX_DT_SECONDS, Math.max(0, (now - previousNow) / 1000));
    previousNow = now;

    if (!hans.visible) {
      visiblePosition.set(hans.position.x, 0, hans.position.z);
      visualRoot.position.set(0, 0, 0);
      previousLogical.set(hans.position.x, 0, hans.position.z);
      previousYaw = hans.rotation.y;
      return;
    }

    const phase = driver.userData?.warRoomHansPhase || hans.userData?.warRoomHansChoreographyPhase || 'idle';
    const route = hans.userData?.warRoomHansRoute || null;
    const profile = motionProfile(phase, route);
    const logical = new THREE.Vector3(hans.position.x, 0, hans.position.z);
    const logicalDelta = planarDistance(logical, previousLogical);

    if (dt === 0 || !Number.isFinite(visiblePosition.x)) {
      visiblePosition.copy(logical);
    } else {
      moveTowardsPlanar(visiblePosition, logical, profile.maxSpeed * dt);
      const lag = planarDistance(visiblePosition, logical);
      if (lag > profile.maxLag && lag > 0.000001) {
        const retain = profile.maxLag / lag;
        visiblePosition.x = logical.x + (visiblePosition.x - logical.x) * retain;
        visiblePosition.z = logical.z + (visiblePosition.z - logical.z) * retain;
      }
    }

    const wallClearanceApplied = applyLeaveWallClearance({
      phase,
      route,
      visiblePosition,
      side,
      door,
      doorDepth,
    });

    const visibleTravel = planarDistance(visiblePosition, {
      x: hans.position.x + visualRoot.position.x,
      z: hans.position.z + visualRoot.position.z,
    });
    const moving = MOVING_PHASES.has(phase)
      && (logicalDelta > 0.00025 || visibleTravel > 0.00025);
    if (moving) gaitClock += dt * profile.cadence;

    const yawDeltaRaw = THREE.MathUtils.euclideanModulo(hans.rotation.y - previousYaw + Math.PI, Math.PI * 2) - Math.PI;
    applySecondaryPose({
      body,
      visualRoot,
      phase,
      moving,
      gaitClock,
      yawDelta: yawDeltaRaw,
      now,
    });

    const correction = localCorrectionForYaw(logical, visiblePosition, hans.rotation.y);
    visualRoot.position.x = correction.x;
    visualRoot.position.z = correction.z;

    hans.position.y = Number.isFinite(hans.position.y) ? hans.position.y : BASE_HANS_Y;
    hans.userData.warRoomHansMotionPolish = WAR_ROOM_HANS_MOTION_POLISH_VERSION;
    hans.userData.warRoomHansMotionState = moving
      ? (body.carriedLog?.visible ? 'walk-carry-log' : (body.carriedPoker?.visible ? 'walk-carry-poker' : 'walk'))
      : (Math.abs(yawDeltaRaw) > 0.015 ? 'turn-in-place' : phase);
    hans.userData.warRoomHansGrounded = true;
    hans.userData.warRoomHansWallClearanceApplied = wallClearanceApplied;
    hans.userData.warRoomHansVisualLag = planarDistance(visiblePosition, logical);

    previousLogical.copy(logical);
    previousYaw = hans.rotation.y;
  };

  driver.onBeforeRender = wrapped;
  driver.userData.warRoomHansMotionPolish = WAR_ROOM_HANS_MOTION_POLISH_VERSION;
  driver.userData.warRoomHansMotionCadence = 'slow-grounded-v1';
  driver.userData.warRoomHansMotionWallClearance = SAFE_CORRIDOR_FRAME_X;
  hans.userData.warRoomHansMotionPolish = WAR_ROOM_HANS_MOTION_POLISH_VERSION;
  hans.userData.warRoomHansVisualRoot = VISUAL_ROOT_NAME;
  return 1;
}
