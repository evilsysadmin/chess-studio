import * as THREE from 'three';

export const WAR_ROOM_HANS_MOTION_POLISH_V2_VERSION = 'grounded-butler-motion-v3-articulated';
export const WAR_ROOM_HANS_CANONICAL_SCALE = 0.74;

const LEGACY_MOTION_MARKER = 'grounded-butler-motion-v1';
const HANS_NAME = 'war-room-hans-butler';
const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const FIREPLACE_NAME = 'war-room-fireplace';
const SERVICE_DOOR_NAME = 'war-room-hans-service-door';
const VISUAL_ROOT_NAME = 'war-room-hans-visual-root';
const HANS_UNSCALED_HALF_WIDTH = 0.49;
const WALL_MARGIN = 0.13;
const ARMOR_MARGIN = 0.16;
const STEP_LENGTH = 0.72;
const MAX_GAIT_DISTANCE_PER_FRAME = 0.12;
const STANDING_Y = -0.34;
const ENTRY_DOOR_X = 2.65;
const ENTRY_BASKET_X = -1.62;
const ENTRY_WORK_Z = 0.72;
const ENTRY_ARMOR_BYPASS_X = 1.42;
const ENTRY_DOOR_PAST_ARMOR_OFFSET = 1.55;
const ENTRY_ARMOR_CLEARANCE_AFTER = 0.72;
const ENTRY_DOOR_SEGMENT_END = 0.24;
const ENTRY_BYPASS_SEGMENT_END = 0.62;

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

function lerp(a, b, t) {
  return a + (b - a) * t;
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

function headingFromMovement(dx, dz, localForwardZ) {
  const targetYaw = Math.atan2(dx, dz);
  return targetYaw + (Number(localForwardZ) < 0 ? Math.PI : 0);
}

function ensureCompatibilityVisualRoot(hans) {
  let visualRoot = hans.getObjectByName?.(VISUAL_ROOT_NAME);
  if (!visualRoot) {
    visualRoot = new THREE.Group();
    visualRoot.name = VISUAL_ROOT_NAME;
    hans.add(visualRoot);
  }
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

function inferDoorDepth(fireplace, door, hans) {
  const fireplaceZ = Number(fireplace?.position?.z || 0);
  const worldDoorZ = Number(door?.userData?.warRoomHansDoorWorldZ);
  if (Number.isFinite(worldDoorZ)) return Math.max(ENTRY_WORK_Z, Math.abs(worldDoorZ - fireplaceZ));
  const refDoorZ = Number(door?.userData?.refs?.doorZ);
  if (Number.isFinite(refDoorZ)) return Math.max(ENTRY_WORK_Z, Math.abs(refDoorZ - fireplaceZ));
  return Math.max(ENTRY_WORK_Z, Math.abs(Number(hans?.position?.z || ENTRY_WORK_Z)));
}

function entryBypassDepth(doorDepth) {
  return Math.max(
    ENTRY_WORK_Z,
    Number(doorDepth || 0) - ENTRY_DOOR_PAST_ARMOR_OFFSET + ENTRY_ARMOR_CLEARANCE_AFTER,
  );
}

function deriveEntryProgress(hans, side) {
  const logicalX = Number(hans?.position?.x) / side;
  if (!Number.isFinite(logicalX)) return 0;
  return clamp01((ENTRY_DOOR_X - logicalX) / (ENTRY_DOOR_X - ENTRY_BASKET_X));
}

function applyRearWallEntryPath(hans, {
  phase,
  route,
  side,
  forward,
  doorDepth,
} = {}) {
  if (!hans || (route !== 'entry' && phase !== 'walk-to-basket')) return null;

  const progress = deriveEntryProgress(hans, side);
  const bypassDepth = entryBypassDepth(doorDepth);
  let logicalX = ENTRY_DOOR_X;
  let depth = doorDepth;
  let stage = 'entry-door';

  if (progress < ENTRY_DOOR_SEGMENT_END) {
    const local = clamp01(progress / ENTRY_DOOR_SEGMENT_END);
    logicalX = lerp(ENTRY_DOOR_X, ENTRY_ARMOR_BYPASS_X, local);
    depth = lerp(doorDepth, bypassDepth, local);
    stage = 'entry-door';
  } else if (progress < ENTRY_BYPASS_SEGMENT_END) {
    const local = clamp01(
      (progress - ENTRY_DOOR_SEGMENT_END)
      / (ENTRY_BYPASS_SEGMENT_END - ENTRY_DOOR_SEGMENT_END),
    );
    logicalX = ENTRY_ARMOR_BYPASS_X;
    depth = lerp(bypassDepth, ENTRY_WORK_Z, local);
    stage = 'entry-bypass';
  } else {
    const local = clamp01(
      (progress - ENTRY_BYPASS_SEGMENT_END)
      / (1 - ENTRY_BYPASS_SEGMENT_END),
    );
    logicalX = lerp(ENTRY_ARMOR_BYPASS_X, ENTRY_BASKET_X, local);
    depth = ENTRY_WORK_Z;
    stage = 'entry-rear-wall';
  }

  const zSign = Math.sign(Number(hans.position.z)) || Math.sign(Number(forward)) || 1;
  hans.position.x = side * logicalX;
  hans.position.z = zSign * depth;
  hans.userData.warRoomHansEntryPath = 'door-bypass-rear-wall-v1';
  hans.userData.warRoomHansEntryRouteStage = stage;
  hans.userData.warRoomHansEntryRouteProgress = progress;
  return stage;
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

function findArmor(root, side) {
  const names = side < 0
    ? ['war-room-teutonic-armor-left', 'war-room-armor-guard-left']
    : ['war-room-teutonic-armor-right', 'war-room-armor-guard-right'];
  for (const name of names) {
    const armor = root?.getObjectByName?.(name);
    if (armor?.visible !== false) return armor;
  }
  return null;
}

function actualArmorSafeFrameX(root, fireplace, side, scale) {
  const armor = findArmor(root, side);
  if (!armor || !fireplace) return null;
  root.updateMatrixWorld?.(true);
  const box = new THREE.Box3().setFromObject(armor);
  if (box.isEmpty()) return null;
  const fireplaceWorld = new THREE.Vector3();
  fireplace.getWorldPosition(fireplaceWorld);
  const halfWidth = HANS_UNSCALED_HALF_WIDTH * scale;
  const safeWorldX = side < 0
    ? box.max.x + halfWidth + ARMOR_MARGIN
    : box.min.x - halfWidth - ARMOR_MARGIN;
  const frameX = (safeWorldX - fireplaceWorld.x) / side;
  if (!Number.isFinite(frameX)) return null;
  return Math.max(0.18, frameX);
}

function applyArmorBypassClearance(hans, { phase, route, side, safeFrameX } = {}) {
  if (!hans || phase !== 'leave' || (route !== 'leave-side' && route !== 'leave-bypass')) return false;
  if (!Number.isFinite(safeFrameX)) return false;
  const frameX = Number(hans.position.x) / side;
  if (!Number.isFinite(frameX) || frameX <= safeFrameX) return false;
  hans.position.x = side * safeFrameX;
  hans.userData.warRoomHansArmorSafeFrameX = safeFrameX;
  return true;
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
  const breathe = Math.sin(now * 0.0013);
  if (body.torso && bases.torso) body.torso.position.y = bases.torso.positionY + breathe * 0.003;
  if (body.head && bases.head) body.head.position.y = bases.head.positionY + breathe * 0.0015;
  if (phase === 'satisfied' && body.head && bases.head) body.head.rotation.z = bases.head.rotationZ + 0.016;
}

function applyDistanceDrivenPose({ body, bases, gaitDistance }) {
  const phaseAngle = (gaitDistance / STEP_LENGTH) * Math.PI * 2;
  const wave = Math.sin(phaseAngle);
  const carryingLog = body.carriedLog?.visible === true;
  const carryingPoker = body.carriedPoker?.visible === true;
  const carry = carryingLog || carryingPoker;
  const legAmplitude = carry ? 0.105 : 0.125;

  if (body.leftLeg && bases.leftLeg) body.leftLeg.rotation.x = bases.leftLeg.rotationX + wave * legAmplitude;
  if (body.rightLeg && bases.rightLeg) body.rightLeg.rotation.x = bases.rightLeg.rotationX - wave * legAmplitude;
  if (body.torso && bases.torso) {
    body.torso.rotation.y = bases.torso.rotationY + wave * (carry ? 0.009 : 0.014);
    body.torso.rotation.z = bases.torso.rotationZ - wave * 0.007;
  }
  if (body.head && bases.head) {
    body.head.rotation.y = bases.head.rotationY - wave * 0.009;
    body.head.rotation.z = bases.head.rotationZ + wave * 0.004;
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
  if (body.carriedPoker && bases.carriedPoker) body.carriedPoker.rotation.z = bases.carriedPoker.rotationZ + thrust * 0.12;
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
  const doorDepth = inferDoorDepth(fireplace, door, hans);
  applyRearWallEntryPath(hans, {
    phase: driver.userData?.warRoomHansPhase,
    route: hans.userData?.warRoomHansRoute,
    side,
    forward,
    doorDepth,
  });
  const previousPosition = new THREE.Vector3(hans.position.x, 0, hans.position.z);
  const armorSafeFrameX = actualArmorSafeFrameX(root, fireplace, side, WAR_ROOM_HANS_CANONICAL_SCALE);
  let gaitDistance = 0;

  hans.scale.setScalar(WAR_ROOM_HANS_CANONICAL_SCALE);
  hans.userData.warRoomHansCanonicalScale = WAR_ROOM_HANS_CANONICAL_SCALE;
  hans.userData.warRoomHansArmorSafeFrameX = armorSafeFrameX;

  driver.onBeforeRender = (...args) => {
    original(...args);
    if (!hans.visible) {
      previousPosition.set(hans.position.x, 0, hans.position.z);
      visualRoot.position.set(0, 0, 0);
      return;
    }

    const phase = driver.userData?.warRoomHansPhase || hans.userData?.warRoomHansChoreographyPhase || 'idle';
    const route = hans.userData?.warRoomHansRoute || null;
    const rawCrouch = Math.max(0, STANDING_Y - Number(hans.position.y || STANDING_Y));
    const rawStoke = Number(body.carriedPoker?.rotation?.z || 0);

    hans.position.y = STANDING_Y;

    const entryRouteStage = applyRearWallEntryPath(hans, {
      phase,
      route,
      side,
      forward,
      doorDepth,
    });
    const armorClearanceApplied = applyArmorBypassClearance(hans, {
      phase,
      route,
      side,
      safeFrameX: armorSafeFrameX,
    });
    const wallClearanceApplied = clampHansExitToDoorGeometry(hans, {
      phase,
      route,
      fireplace,
      door,
      side,
      scale: WAR_ROOM_HANS_CANONICAL_SCALE,
    });

    const currentPosition = new THREE.Vector3(hans.position.x, 0, hans.position.z);
    const dx = currentPosition.x - previousPosition.x;
    const dz = currentPosition.z - previousPosition.z;
    const travelled = Math.hypot(dx, dz);
    const moving = MOVING_PHASES.has(phase) && travelled > 0.00004;
    if (moving) {
      gaitDistance += Math.min(travelled, MAX_GAIT_DISTANCE_PER_FRAME);
      hans.rotation.y = headingFromMovement(dx, dz, forward);
    }

    restorePoseBases(body, bases);
    let actionPose = null;
    if (moving) {
      applyDistanceDrivenPose({ body, bases, gaitDistance });
    } else if (phase === 'take-log') {
      applyTakeLogPose({ body, bases, amount: clamp01(rawCrouch / 0.15), side, forward });
      actionPose = 'pick-log';
    } else if (phase === 'place-log') {
      applyPlaceLogPose({ body, bases, amount: clamp01(rawCrouch / 0.11), side, forward });
      actionPose = 'place-log';
    } else if (phase === 'stoke-fire') {
      applyStokeFirePose({
        body,
        bases,
        stokeSignal: THREE.MathUtils.clamp(rawStoke / 0.22, -1, 1),
        side,
        forward,
      });
      actionPose = 'stoke-fire-action';
    } else {
      applyIdlePose({
        body,
        bases,
        phase,
        now: typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now(),
      });
    }

    visualRoot.position.set(0, 0, 0);
    hans.userData.warRoomHansMotionState = moving
      ? (body.carriedLog?.visible ? 'walk-carry-log' : (body.carriedPoker?.visible ? 'walk-carry-poker' : 'walk'))
      : (actionPose || phase);
    hans.userData.warRoomHansActionPose = actionPose;
    hans.userData.warRoomHansGrounded = true;
    hans.userData.warRoomHansVisualLag = 0;
    hans.userData.warRoomHansArmorClearanceApplied = armorClearanceApplied;
    hans.userData.warRoomHansWallClearanceApplied = wallClearanceApplied;
    hans.userData.warRoomHansMotionPolishV2 = WAR_ROOM_HANS_MOTION_POLISH_V2_VERSION;
    hans.userData.warRoomHansMovementFacing = moving ? 'velocity-vector' : 'work-target';
    hans.userData.warRoomHansEntryRouteStage = entryRouteStage || hans.userData.warRoomHansEntryRouteStage || null;

    previousPosition.copy(currentPosition);
  };

  driver.userData.warRoomHansMotionPolish = LEGACY_MOTION_MARKER;
  driver.userData.warRoomHansMotionPolishV2 = WAR_ROOM_HANS_MOTION_POLISH_V2_VERSION;
  hans.userData.warRoomHansMotionPolish = LEGACY_MOTION_MARKER;
  hans.userData.warRoomHansMotionPolishV2 = WAR_ROOM_HANS_MOTION_POLISH_V2_VERSION;
  hans.userData.warRoomHansVisualRoot = VISUAL_ROOT_NAME;
  driver.userData.warRoomHansMotionCadence = 'distance-driven-slower-v3';
  driver.userData.warRoomHansMotionWallClearance = 'door-geometry-derived-v2';
  driver.userData.warRoomHansArmorClearance = 'box3-expanded-by-hans-v1';
  driver.userData.warRoomHansActionPoses = 'pick-place-stoke-articulated-v1';
  driver.userData.warRoomHansEntryPath = 'door-bypass-rear-wall-v1';
  return 1;
}
