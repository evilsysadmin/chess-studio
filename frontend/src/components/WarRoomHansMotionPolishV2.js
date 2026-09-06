import * as THREE from 'three';

export const WAR_ROOM_HANS_MOTION_POLISH_V2_VERSION = 'grounded-butler-motion-v2';
export const WAR_ROOM_HANS_CANONICAL_SCALE = 0.74;

const LEGACY_MOTION_MARKER = 'grounded-butler-motion-v1';
const HANS_NAME = 'war-room-hans-butler';
const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const FIREPLACE_NAME = 'war-room-fireplace';
const SERVICE_DOOR_NAME = 'war-room-hans-service-door';
const VISUAL_ROOT_NAME = 'war-room-hans-visual-root';
const HANS_UNSCALED_HALF_WIDTH = 0.49;
const WALL_MARGIN = 0.13;
const STEP_LENGTH = 0.54;
const MAX_GAIT_DISTANCE_PER_FRAME = 0.16;
const STANDING_Y_FALLBACK = -0.34;

const MOVING_PHASES = new Set([
  'fire-dimming',
  'walk-to-basket',
  'carry-log',
  'take-poker',
  'stoke-fire',
  'return-poker',
  'leave',
]);

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function planarDistance(a, b) {
  return Math.hypot(
    Number(a?.x || 0) - Number(b?.x || 0),
    Number(a?.z || 0) - Number(b?.z || 0),
  );
}

function inferSide(fireplace, door) {
  const declared = Number(door?.userData?.refs?.side);
  if (declared === -1 || declared === 1) return declared;
  return Math.sign(Number(fireplace?.position?.x || -1)) || -1;
}

function inferForward(body) {
  const logZ = Number(body?.carriedLog?.position?.z);
  if (Number.isFinite(logZ) && Math.abs(logZ) > 0.0001) return Math.sign(logZ);
  const pokerZ = Number(body?.carriedPoker?.position?.z);
  if (Number.isFinite(pokerZ) && Math.abs(pokerZ) > 0.0001) return Math.sign(pokerZ);
  return 1;
}

function ensureCompatibilityVisualRoot(hans) {
  let visualRoot = hans.getObjectByName?.(VISUAL_ROOT_NAME);
  if (!visualRoot) {
    visualRoot = new THREE.Group();
    visualRoot.name = VISUAL_ROOT_NAME;
    hans.add(visualRoot);
  }
  // v1 used this node to offset the whole visible rig behind its logical
  // position. v2 deliberately keeps it neutral: no conveyor-belt lag and no
  // vertical correction that can make horizontal travel read as levitation.
  visualRoot.position.set(0, 0, 0);
  visualRoot.rotation.set(0, 0, 0);
  return visualRoot;
}

function capturePoseBases(body) {
  const bases = {};
  for (const key of ['leftLeg', 'rightLeg', 'torso', 'head', 'leftArm', 'rightArm', 'carriedPoker']) {
    const part = body?.[key];
    if (!part?.position || !part?.rotation) continue;
    bases[key] = {
      positionX: part.position.x,
      positionY: part.position.y,
      positionZ: part.position.z,
      rotationX: part.rotation.x,
      rotationY: part.rotation.y,
      rotationZ: part.rotation.z,
    };
  }
  return bases;
}

function restorePoseBases(body, bases) {
  for (const [key, base] of Object.entries(bases || {})) {
    const part = body?.[key];
    if (!part) continue;
    part.position.set(base.positionX, base.positionY, base.positionZ);
    part.rotation.set(base.rotationX, base.rotationY, base.rotationZ);
  }
}

function actualDoorWallFrameX(fireplace, door, scale) {
  const recess = door?.getObjectByName?.('war-room-hans-service-door-recess');
  const frame = door?.getObjectByName?.('war-room-hans-service-door-frame');
  const wallX = Number(recess?.position?.x ?? frame?.position?.x);
  const fireplaceX = Number(fireplace?.position?.x);
  if (!Number.isFinite(wallX) || !Number.isFinite(fireplaceX)) return 2.28;
  const centerDistance = Math.abs(wallX - fireplaceX);
  const halfWidth = HANS_UNSCALED_HALF_WIDTH * scale;
  return Math.max(1.8, centerDistance - halfWidth - WALL_MARGIN);
}

export function clampHansExitToDoorGeometry(hans, {
  phase,
  route,
  fireplace,
  door,
  side,
  scale = WAR_ROOM_HANS_CANONICAL_SCALE,
} = {}) {
  if (!hans || (phase !== 'leave' && !String(route || '').startsWith('leave-'))) return false;
  const safeFrameX = actualDoorWallFrameX(fireplace, door, scale);
  const frameX = Number(hans.position.x) / side;
  if (!Number.isFinite(frameX) || frameX <= safeFrameX) return false;
  hans.position.x = side * safeFrameX;
  hans.userData.warRoomHansDoorSafeFrameX = safeFrameX;
  return true;
}

function applyIdlePose({ body, bases, phase, now }) {
  const breathe = Math.sin(now * 0.0015);
  if (body.torso && bases.torso) body.torso.position.y = bases.torso.positionY + breathe * 0.004;
  if (body.head && bases.head) body.head.position.y = bases.head.positionY + breathe * 0.002;
  if (phase === 'satisfied' && body.head && bases.head) {
    body.head.rotation.z = bases.head.rotationZ + 0.016;
  }
}

function applyDistanceDrivenPose({ body, bases, gaitDistance }) {
  const phaseAngle = (gaitDistance / STEP_LENGTH) * Math.PI * 2;
  const wave = Math.sin(phaseAngle);
  const pulse = (1 - Math.cos(phaseAngle * 2)) * 0.5;
  const carryingLog = body.carriedLog?.visible === true;
  const carryingPoker = body.carriedPoker?.visible === true;
  const carry = carryingLog || carryingPoker;
  const legAmplitude = carry ? 0.135 : 0.165;

  if (body.leftLeg && bases.leftLeg) body.leftLeg.rotation.x = bases.leftLeg.rotationX + wave * legAmplitude;
  if (body.rightLeg && bases.rightLeg) body.rightLeg.rotation.x = bases.rightLeg.rotationX - wave * legAmplitude;

  if (body.torso && bases.torso) {
    body.torso.position.y = bases.torso.positionY + pulse * 0.008;
    body.torso.rotation.y = bases.torso.rotationY + wave * (carry ? 0.012 : 0.02);
    body.torso.rotation.z = bases.torso.rotationZ - wave * 0.009;
  }
  if (body.head && bases.head) {
    body.head.position.y = bases.head.positionY + pulse * 0.004;
    body.head.rotation.y = bases.head.rotationY - wave * 0.012;
    body.head.rotation.z = bases.head.rotationZ + wave * 0.006;
  }

  if (carryingLog) {
    if (body.leftArm && bases.leftArm) {
      body.leftArm.rotation.x = bases.leftArm.rotationX - 0.43;
      body.leftArm.rotation.z = bases.leftArm.rotationZ + 0.035;
    }
    if (body.rightArm && bases.rightArm) {
      body.rightArm.rotation.x = bases.rightArm.rotationX - 0.5;
      body.rightArm.rotation.z = bases.rightArm.rotationZ - 0.025;
    }
  } else if (carryingPoker) {
    if (body.leftArm && bases.leftArm) body.leftArm.rotation.x = bases.leftArm.rotationX - 0.12;
    if (body.rightArm && bases.rightArm) body.rightArm.rotation.x = bases.rightArm.rotationX - 0.42;
  } else {
    if (body.leftArm && bases.leftArm) body.leftArm.rotation.z = bases.leftArm.rotationZ + wave * 0.014;
    if (body.rightArm && bases.rightArm) body.rightArm.rotation.z = bases.rightArm.rotationZ - wave * 0.014;
  }
}

function applyTakeLogPose({ body, bases, amount, side, forward }) {
  const q = clamp01(amount);
  if (body.torso && bases.torso) {
    body.torso.position.y = bases.torso.positionY - q * 0.025;
    body.torso.rotation.x = bases.torso.rotationX + forward * q * 0.34;
    body.torso.rotation.z = bases.torso.rotationZ + side * q * 0.045;
  }
  if (body.head && bases.head) {
    body.head.rotation.x = bases.head.rotationX + forward * q * 0.14;
    body.head.rotation.y = bases.head.rotationY - side * q * 0.08;
  }
  if (body.rightArm && bases.rightArm) {
    body.rightArm.rotation.x = bases.rightArm.rotationX - q * 0.98;
    body.rightArm.rotation.z = bases.rightArm.rotationZ - q * 0.08;
  }
  if (body.leftArm && bases.leftArm) {
    body.leftArm.rotation.x = bases.leftArm.rotationX - q * 0.46;
    body.leftArm.rotation.z = bases.leftArm.rotationZ + q * 0.055;
  }
  if (body.leftLeg && bases.leftLeg) {
    body.leftLeg.rotation.x = bases.leftLeg.rotationX + q * 0.15;
    body.leftLeg.rotation.z = bases.leftLeg.rotationZ - q * 0.055;
  }
  if (body.rightLeg && bases.rightLeg) {
    body.rightLeg.rotation.x = bases.rightLeg.rotationX - q * 0.045;
    body.rightLeg.rotation.z = bases.rightLeg.rotationZ + q * 0.025;
  }
}

function applyPlaceLogPose({ body, bases, amount, side, forward }) {
  const q = clamp01(amount);
  if (body.torso && bases.torso) {
    body.torso.position.y = bases.torso.positionY - q * 0.012;
    body.torso.position.z = bases.torso.positionZ + forward * q * 0.025;
    body.torso.rotation.x = bases.torso.rotationX + forward * q * 0.2;
    body.torso.rotation.z = bases.torso.rotationZ - side * q * 0.025;
  }
  if (body.head && bases.head) {
    body.head.rotation.x = bases.head.rotationX + forward * q * 0.085;
    body.head.rotation.y = bases.head.rotationY + side * q * 0.035;
  }
  if (body.rightArm && bases.rightArm) {
    body.rightArm.rotation.x = bases.rightArm.rotationX - q * 0.9;
    body.rightArm.rotation.z = bases.rightArm.rotationZ - q * 0.045;
  }
  if (body.leftArm && bases.leftArm) {
    body.leftArm.rotation.x = bases.leftArm.rotationX - q * 0.73;
    body.leftArm.rotation.z = bases.leftArm.rotationZ + q * 0.035;
  }
  if (body.leftLeg && bases.leftLeg) {
    body.leftLeg.rotation.x = bases.leftLeg.rotationX + q * 0.085;
    body.leftLeg.rotation.z = bases.leftLeg.rotationZ - q * 0.025;
  }
  if (body.rightLeg && bases.rightLeg) {
    body.rightLeg.rotation.x = bases.rightLeg.rotationX - q * 0.03;
    body.rightLeg.rotation.z = bases.rightLeg.rotationZ + q * 0.015;
  }
}

function applyStokeFirePose({ body, bases, stokeSignal, side, forward }) {
  const thrust = THREE.MathUtils.clamp(Number(stokeSignal) || 0, -1, 1);
  const effort = Math.abs(thrust);
  if (body.torso && bases.torso) {
    body.torso.rotation.x = bases.torso.rotationX + forward * (0.11 + effort * 0.025);
    body.torso.rotation.y = bases.torso.rotationY + side * thrust * 0.028;
  }
  if (body.head && bases.head) {
    body.head.rotation.x = bases.head.rotationX + forward * 0.05;
    body.head.rotation.y = bases.head.rotationY - side * thrust * 0.03;
  }
  if (body.leftLeg && bases.leftLeg) {
    body.leftLeg.rotation.x = bases.leftLeg.rotationX + 0.055;
    body.leftLeg.rotation.z = bases.leftLeg.rotationZ - 0.02;
  }
  if (body.rightLeg && bases.rightLeg) {
    body.rightLeg.rotation.x = bases.rightLeg.rotationX - 0.035;
    body.rightLeg.rotation.z = bases.rightLeg.rotationZ + 0.018;
  }
  if (body.leftArm && bases.leftArm) {
    body.leftArm.rotation.x = bases.leftArm.rotationX - 0.12;
    body.leftArm.rotation.z = bases.leftArm.rotationZ + 0.02;
  }
  if (body.rightArm && bases.rightArm) {
    body.rightArm.rotation.x = bases.rightArm.rotationX - 0.53 - thrust * 0.17;
    body.rightArm.rotation.z = bases.rightArm.rotationZ - thrust * 0.045;
  }
  if (body.carriedPoker && bases.carriedPoker) {
    body.carriedPoker.rotation.z = bases.carriedPoker.rotationZ + thrust * 0.12;
  }
}

export function installWarRoomHansMotionPolish(root) {
  if (!root) return 0;
  const hans = root.getObjectByName?.(HANS_NAME);
  const driver = root.getObjectByName?.(DRIVER_NAME);
  const fireplace = root.getObjectByName?.(FIREPLACE_NAME);
  const door = root.getObjectByName?.(SERVICE_DOOR_NAME);
  const body = hans?.userData?.refs;
  if (!hans || !driver || !fireplace || !body || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansMotionPolishV2 === WAR_ROOM_HANS_MOTION_POLISH_V2_VERSION) return 0;

  const side = inferSide(fireplace, door);
  const forward = inferForward(body);
  const visualRoot = ensureCompatibilityVisualRoot(hans);
  const bases = capturePoseBases(body);
  const original = driver.onBeforeRender;
  const previousPosition = new THREE.Vector3(hans.position.x, 0, hans.position.z);
  const standingY = Number.isFinite(hans.position.y) ? hans.position.y : STANDING_Y_FALLBACK;
  let gaitDistance = 0;

  // Hans is an environmental character, not a boss miniature. Keep him only
  // modestly larger than the chess cast/Matthias instead of towering over it.
  hans.scale.setScalar(WAR_ROOM_HANS_CANONICAL_SCALE);
  hans.userData.warRoomHansCanonicalScale = WAR_ROOM_HANS_CANONICAL_SCALE;

  driver.onBeforeRender = (...args) => {
    original(...args);
    if (!hans.visible) {
      previousPosition.set(hans.position.x, 0, hans.position.z);
      visualRoot.position.set(0, 0, 0);
      return;
    }

    const phase = driver.userData?.warRoomHansPhase || hans.userData?.warRoomHansChoreographyPhase || 'idle';
    const route = hans.userData?.warRoomHansRoute || null;
    const currentPosition = new THREE.Vector3(hans.position.x, 0, hans.position.z);
    const travelled = planarDistance(currentPosition, previousPosition);
    const moving = MOVING_PHASES.has(phase) && travelled > 0.00004;
    if (moving) gaitDistance += Math.min(travelled, MAX_GAIT_DISTANCE_PER_FRAME);

    // Read the original choreography's intent before replacing the old
    // full-body genuflection with articulated poses.
    const rawCrouch = Math.max(0, standingY - Number(hans.position.y || standingY));
    const rawStoke = Number(body.carriedPoker?.rotation?.z || 0);
    const takeLogAmount = clamp01(rawCrouch / 0.145);
    const placeLogAmount = clamp01(rawCrouch / 0.105);
    const stokeSignal = THREE.MathUtils.clamp(rawStoke / 0.22, -1, 1);

    const wallClearanceApplied = clampHansExitToDoorGeometry(hans, {
      phase,
      route,
      fireplace,
      door,
      side,
      scale: WAR_ROOM_HANS_CANONICAL_SCALE,
    });

    restorePoseBases(body, bases);

    let actionPose = null;
    if (moving) {
      applyDistanceDrivenPose({ body, bases, gaitDistance });
    } else if (phase === 'take-log') {
      hans.position.y = standingY;
      applyTakeLogPose({ body, bases, amount: takeLogAmount, side, forward });
      actionPose = 'pick-log';
    } else if (phase === 'place-log') {
      hans.position.y = standingY;
      applyPlaceLogPose({ body, bases, amount: placeLogAmount, side, forward });
      actionPose = 'place-log';
    } else if (phase === 'stoke-fire') {
      hans.position.y = standingY;
      applyStokeFirePose({ body, bases, stokeSignal, side, forward });
      actionPose = 'stoke-fire-action';
    } else {
      applyIdlePose({
        body,
        bases,
        phase,
        now: typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now(),
      });
    }

    // The rig root stays neutral. Action depth lives in hips/torso/limbs, not
    // in a global Y offset, so picking or placing a log no longer reads as a
    // ceremonial squat and horizontal travel cannot float above the floor.
    visualRoot.position.set(0, 0, 0);

    hans.userData.warRoomHansMotionState = moving
      ? (body.carriedLog?.visible ? 'walk-carry-log' : (body.carriedPoker?.visible ? 'walk-carry-poker' : 'walk'))
      : (actionPose || phase);
    hans.userData.warRoomHansActionPose = actionPose;
    hans.userData.warRoomHansGrounded = true;
    hans.userData.warRoomHansVisualLag = 0;
    hans.userData.warRoomHansWallClearanceApplied = wallClearanceApplied;
    hans.userData.warRoomHansMotionPolishV2 = WAR_ROOM_HANS_MOTION_POLISH_V2_VERSION;

    previousPosition.set(hans.position.x, 0, hans.position.z);
  };

  // Keep the legacy marker for diagnostics/tests that only care that a motion
  // layer is installed; v2 has its own explicit marker for runtime diagnosis.
  driver.userData.warRoomHansMotionPolish = LEGACY_MOTION_MARKER;
  driver.userData.warRoomHansMotionPolishV2 = WAR_ROOM_HANS_MOTION_POLISH_V2_VERSION;
  hans.userData.warRoomHansMotionPolish = LEGACY_MOTION_MARKER;
  hans.userData.warRoomHansMotionPolishV2 = WAR_ROOM_HANS_MOTION_POLISH_V2_VERSION;
  hans.userData.warRoomHansVisualRoot = VISUAL_ROOT_NAME;
  driver.userData.warRoomHansMotionCadence = 'distance-driven-grounded-v2';
  driver.userData.warRoomHansMotionWallClearance = 'door-geometry-derived-v2';
  driver.userData.warRoomHansActionPoses = 'pick-place-stoke-articulated-v1';
  return 1;
}
