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

const MOVING_PHASES = new Set([
  'fire-dimming',
  'walk-to-basket',
  'carry-log',
  'take-poker',
  'stoke-fire',
  'return-poker',
  'leave',
]);

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

function captureSecondaryBases(body) {
  const bases = {};
  for (const key of ['torso', 'head', 'leftArm', 'rightArm']) {
    const part = body?.[key];
    if (!part?.position || !part?.rotation) continue;
    bases[key] = {
      positionY: part.position.y,
      rotationY: part.rotation.y,
      rotationZ: part.rotation.z,
    };
  }
  return bases;
}

function restoreSecondaryBases(body, bases) {
  for (const [key, base] of Object.entries(bases || {})) {
    const part = body?.[key];
    if (!part) continue;
    part.position.y = base.positionY;
    part.rotation.y = base.rotationY;
    part.rotation.z = base.rotationZ;
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

function applyDistanceDrivenPose({ body, bases, phase, moving, gaitDistance, now }) {
  restoreSecondaryBases(body, bases);

  if (!moving) {
    const breathe = Math.sin(now * 0.0015);
    if (body.torso && bases.torso) body.torso.position.y = bases.torso.positionY + breathe * 0.004;
    if (body.head && bases.head) body.head.position.y = bases.head.positionY + breathe * 0.002;
    if (phase === 'satisfied' && body.head && bases.head) {
      body.head.rotation.z = bases.head.rotationZ + 0.016;
    }
    return;
  }

  const phaseAngle = (gaitDistance / STEP_LENGTH) * Math.PI * 2;
  const wave = Math.sin(phaseAngle);
  const pulse = (1 - Math.cos(phaseAngle * 2)) * 0.5;
  const carry = Boolean(body.carriedLog?.visible || body.carriedPoker?.visible);
  const legAmplitude = carry ? 0.135 : 0.165;

  if (body.leftLeg) body.leftLeg.rotation.x = wave * legAmplitude;
  if (body.rightLeg) body.rightLeg.rotation.x = -wave * legAmplitude;

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
  if (!carry) {
    if (body.leftArm && bases.leftArm) body.leftArm.rotation.z = bases.leftArm.rotationZ + wave * 0.014;
    if (body.rightArm && bases.rightArm) body.rightArm.rotation.z = bases.rightArm.rotationZ - wave * 0.014;
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
  const visualRoot = ensureCompatibilityVisualRoot(hans);
  const bases = captureSecondaryBases(body);
  const original = driver.onBeforeRender;
  const previousPosition = new THREE.Vector3(hans.position.x, 0, hans.position.z);
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

    const wallClearanceApplied = clampHansExitToDoorGeometry(hans, {
      phase,
      route,
      fireplace,
      door,
      side,
      scale: WAR_ROOM_HANS_CANONICAL_SCALE,
    });

    applyDistanceDrivenPose({
      body,
      bases,
      phase,
      moving,
      gaitDistance,
      now: typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now(),
    });

    // The choreography owns world Y (including deliberate crouches). v2 never
    // adds a whole-body bob, so lateral movement cannot float above the floor.
    visualRoot.position.set(0, 0, 0);

    hans.userData.warRoomHansMotionState = moving
      ? (body.carriedLog?.visible ? 'walk-carry-log' : (body.carriedPoker?.visible ? 'walk-carry-poker' : 'walk'))
      : phase;
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
  return 1;
}
