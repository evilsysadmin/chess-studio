import { installWarRoomHansArticulatedWalk } from './WarRoomHansArticulatedWalk.js';
import { installWarRoomHansBoardCollisionGuard } from './WarRoomHansBoardCollisionGuard.js';
import { installWarRoomHansBoardPeekPose } from './WarRoomHansBoardPeekPose.js';
import { installWarRoomHansFacingGuard } from './WarRoomHansFacingGuard.js';
import { installWarRoomHansHearthFacingGuard } from './WarRoomHansHearthFacingGuard.js';
import { installWarRoomHansHearthReachGuard } from './WarRoomHansHearthReachGuard.js';
import { installWarRoomHansMotionPolish } from './WarRoomHansMotionPolishV2.js';
import {
  moveWarRoomHansToward as moveWarRoomHansTransformToward,
  placeWarRoomHansHorizontal as placeWarRoomHansTransformHorizontal,
} from './WarRoomHansTransformOwner.js';

export const WAR_ROOM_HANS_ANIMATOR_VERSION = 'war-room-hans-animator-v5-transform-owner-hearth-reach-pose-baseline-single-gait';
export const WAR_ROOM_HANS_GAIT_OWNER = 'articulated-walk-distance-owner-v1';
export const WAR_ROOM_HANS_POSE_BASELINE_VERSION = 'hans-task-pose-baseline-v1';

const CORE_RESET_PARTS = Object.freeze([
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
  'leftLeg',
  'rightLeg',
]);
const FULL_RESET_PARTS = Object.freeze([
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
  'leftShoe',
  'rightShoe',
  'leftLeg',
  'rightLeg',
  'torso',
  'head',
  'leftArm',
  'rightArm',
  'cane',
  'tailcoat',
]);

function capturePart(part) {
  if (!part?.position || !part?.rotation) return null;
  return {
    x: part.position.x,
    y: part.position.y,
    z: part.position.z,
    rx: part.rotation.x,
    ry: part.rotation.y,
    rz: part.rotation.z,
  };
}

function restorePart(part, base) {
  if (!part || !base) return;
  part.position.set(base.x, base.y, base.z);
  part.rotation.set(base.rx, base.ry, base.rz);
}

function markAnimator(root, hans, driver, installed = []) {
  if (root?.userData) root.userData.warRoomHansAnimator = WAR_ROOM_HANS_ANIMATOR_VERSION;
  if (hans?.userData) hans.userData.warRoomHansAnimator = WAR_ROOM_HANS_ANIMATOR_VERSION;
  if (driver?.userData) {
    driver.userData.warRoomHansAnimator = WAR_ROOM_HANS_ANIMATOR_VERSION;
    driver.userData.warRoomHansAnimatorModules = installed;
    driver.userData.warRoomHansGaitOwner = WAR_ROOM_HANS_GAIT_OWNER;
  }
}

// Compatibility facade: callers keep the existing animator API while all Hans
// root X/Z/yaw writes are owned by WarRoomHansTransformOwner.
export function placeWarRoomHansHorizontal(actor, point) {
  return placeWarRoomHansTransformHorizontal(actor, point, 'animator-place');
}

export function moveWarRoomHansToward(hans, target, maxStep) {
  return moveWarRoomHansTransformToward(hans, target, maxStep, 'animator-navigation');
}

export function createWarRoomHansPoseBaseline(actor) {
  const body = actor?.body;
  if (!body) return null;
  const bases = {};
  for (const key of FULL_RESET_PARTS) {
    const base = capturePart(body[key]);
    if (base) bases[key] = base;
  }
  return {
    version: WAR_ROOM_HANS_POSE_BASELINE_VERSION,
    body,
    bases,
  };
}

export function resetWarRoomHansTaskPose(baseline, { full = true } = {}) {
  if (!baseline?.body || !baseline?.bases) return false;
  const keys = full ? FULL_RESET_PARTS : CORE_RESET_PARTS;
  for (const key of keys) restorePart(baseline.body[key], baseline.bases[key]);
  return true;
}

// Transitional aliases while Service/Chore/Mop callers move to the explicit
// pose-baseline vocabulary. These APIs no longer create or drive a walk cycle.
export function createWarRoomHansWalkController(actor, options = {}) {
  const baseline = createWarRoomHansPoseBaseline(actor);
  if (baseline) {
    baseline.forward = Math.sign(Number(options.forward) || 1) || 1;
    baseline.warRoomHansCompatibilityResetOnly = true;
    baseline.warRoomHansGaitOwner = WAR_ROOM_HANS_GAIT_OWNER;
  }
  return baseline;
}

export function advanceWarRoomHansWalk(controller, { travelled = 0 } = {}) {
  if (!controller) return false;
  controller.warRoomHansDelegatedTravelDistance = Math.max(
    0,
    Number(controller.warRoomHansDelegatedTravelDistance || 0) + Math.max(0, Number(travelled) || 0),
  );
  controller.warRoomHansGaitOwner = WAR_ROOM_HANS_GAIT_OWNER;
  // Deliberately no body mutation here. ArticulatedWalk derives gait once from
  // the actor's real X/Z travel in the ordered post-render pipeline.
  return true;
}

export function resetWarRoomHansWalk(controller, options = {}) {
  return resetWarRoomHansTaskPose(controller, { full: options.full === true });
}

export function applyWarRoomHansTaskPose(actor, pose, { elapsedMs = 0 } = {}) {
  const body = actor?.body;
  if (!body) return false;
  const poseName = String(pose || '');
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const wave = Math.sin(elapsed * 0.006);

  if (poseName === 'water-plant') {
    if (body.rightArm) body.rightArm.rotation.x -= 0.58;
    if (body.torso) body.torso.rotation.x += 0.035;
  } else if (poseName === 'espresso') {
    if (body.leftArm) body.leftArm.rotation.x -= 0.38;
    if (body.rightArm) body.rightArm.rotation.x -= 0.38;
  } else if (poseName === 'dust-armor' || poseName === 'dust-board') {
    if (body.rightArm) body.rightArm.rotation.x -= 0.62 + wave * 0.18;
    if (body.torso) body.torso.rotation.x += 0.025;
  } else if (poseName === 'bring-book' || poseName === 'mail') {
    if (body.leftArm) body.leftArm.rotation.x -= 0.34;
    if (body.rightArm) body.rightArm.rotation.x -= 0.34;
  } else if (poseName === 'straighten-room') {
    if (body.leftArm) body.leftArm.rotation.x -= 0.48;
    if (body.rightArm) body.rightArm.rotation.x -= 0.62;
  } else if (poseName === 'sweep-ashes') {
    if (body.rightArm) body.rightArm.rotation.x -= 0.72 + wave * 0.14;
    if (body.torso) body.torso.rotation.x += 0.06;
  } else if (poseName === 'polish-brass') {
    if (body.rightArm) body.rightArm.rotation.x -= 0.55 + wave * 0.16;
    if (body.leftArm) body.leftArm.rotation.x -= 0.18;
  } else if (poseName === 'mop') {
    if (body.leftArm) body.leftArm.rotation.x -= 0.52;
    if (body.rightArm) body.rightArm.rotation.x -= 0.72;
    if (body.torso) body.torso.rotation.x += 0.04;
  } else {
    return false;
  }

  if (actor?.hans?.userData) actor.hans.userData.warRoomHansTaskPose = poseName;
  return true;
}

export function installWarRoomHansAnimator(root) {
  if (!root) return 0;
  const hans = root.getObjectByName?.('war-room-hans-butler');
  const driver = root.getObjectByName?.('war-room-hans-fireplace-driver');
  if (!hans || !driver) return 0;
  if (root.userData?.warRoomHansAnimator === WAR_ROOM_HANS_ANIMATOR_VERSION) return 0;

  const installed = [];
  const stages = [
    ['motion-polish', installWarRoomHansMotionPolish],
    ['facing', installWarRoomHansFacingGuard],
    ['hearth-facing', installWarRoomHansHearthFacingGuard],
    ['hearth-reach', installWarRoomHansHearthReachGuard],
    ['board-peek-pose', installWarRoomHansBoardPeekPose],
    ['articulated-walk', installWarRoomHansArticulatedWalk],
  ];
  for (const [name, install] of stages) {
    if (install(root)) installed.push(name);
  }

  markAnimator(root, hans, driver, installed);
  return 1;
}

export function installWarRoomHansGrounding(root) {
  if (!root) return 0;
  const hans = root.getObjectByName?.('war-room-hans-butler');
  const driver = root.getObjectByName?.('war-room-hans-fireplace-driver');
  if (!hans || !driver) return 0;
  const installed = installWarRoomHansBoardCollisionGuard(root);
  if (installed && driver.userData) {
    driver.userData.warRoomHansAnimatorGrounding = WAR_ROOM_HANS_ANIMATOR_VERSION;
  }
  return installed;
}
