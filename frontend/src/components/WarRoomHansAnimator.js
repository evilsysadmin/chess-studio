import { installWarRoomHansArticulatedWalk } from './WarRoomHansArticulatedWalk.js';
import { installWarRoomHansBoardCollisionGuard } from './WarRoomHansBoardCollisionGuard.js';
import { installWarRoomHansBoardPeekPose } from './WarRoomHansBoardPeekPose.js';
import { installWarRoomHansFacingGuard } from './WarRoomHansFacingGuard.js';
import { installWarRoomHansHearthFacingGuard } from './WarRoomHansHearthFacingGuard.js';
import { installWarRoomHansMotionPolish } from './WarRoomHansMotionPolishV2.js';

export const WAR_ROOM_HANS_ANIMATOR_VERSION = 'war-room-hans-animator-v1-body-owner';

const TARGET_EPSILON = 0.09;

function markAnimator(root, hans, driver, installed = []) {
  if (root?.userData) root.userData.warRoomHansAnimator = WAR_ROOM_HANS_ANIMATOR_VERSION;
  if (hans?.userData) hans.userData.warRoomHansAnimator = WAR_ROOM_HANS_ANIMATOR_VERSION;
  if (driver?.userData) {
    driver.userData.warRoomHansAnimator = WAR_ROOM_HANS_ANIMATOR_VERSION;
    driver.userData.warRoomHansAnimatorModules = installed;
  }
}

export function moveWarRoomHansToward(hans, target, maxStep) {
  if (!hans || !target) return { arrived: false, travelled: 0, blocked: true };
  const dx = target.x - hans.position.x;
  const dz = target.z - hans.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= TARGET_EPSILON) return { arrived: true, travelled: 0, blocked: false };
  const step = Math.min(distance, Math.max(0, Number(maxStep) || 0));
  hans.position.x += dx / distance * step;
  hans.position.z += dz / distance * step;
  // Y is deliberately untouched. Rendered shoe/surface grounding is the only
  // authority for vertical placement; task navigation owns horizontal travel.
  hans.rotation.y = Math.atan2(dx, dz);
  return { arrived: distance - step <= TARGET_EPSILON, travelled: step, blocked: false };
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
