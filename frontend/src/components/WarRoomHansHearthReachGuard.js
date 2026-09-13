import { registerWarRoomHansPostRenderStage } from './WarRoomHansPostRenderPipeline.js';

export const WAR_ROOM_HANS_HEARTH_REACH_GUARD_VERSION = 'hans-hearth-reach-direction-v1';

const HANS_NAME = 'war-room-hans-butler';
const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const POST_RENDER_ORDER = 19;

function inferForward(body) {
  const logZ = Number(body?.carriedLog?.position?.z);
  if (Number.isFinite(logZ) && Math.abs(logZ) > 0.0001) return Math.sign(logZ);
  const pokerZ = Number(body?.carriedPoker?.position?.z);
  if (Number.isFinite(pokerZ) && Math.abs(pokerZ) > 0.0001) return Math.sign(pokerZ);
  return 1;
}

export function orientHansHearthReachRotation(rotationX, forward = 1) {
  const current = Number(rotationX);
  if (!Number.isFinite(current)) return rotationX;
  const direction = Math.sign(Number(forward) || 1) || 1;
  return -direction * Math.abs(current);
}

export function installWarRoomHansHearthReachGuard(root) {
  if (!root) return 0;
  const hans = root.getObjectByName?.(HANS_NAME);
  const driver = root.getObjectByName?.(DRIVER_NAME);
  const body = hans?.userData?.refs;
  if (!hans || !driver || !body || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansHearthReachGuard === WAR_ROOM_HANS_HEARTH_REACH_GUARD_VERSION) return 0;

  const forward = inferForward(body);
  const registered = registerWarRoomHansPostRenderStage(driver, {
    key: WAR_ROOM_HANS_HEARTH_REACH_GUARD_VERSION,
    order: POST_RENDER_ORDER,
    run: () => {
      const phase = driver.userData?.warRoomHansPhase || hans.userData?.warRoomHansChoreographyPhase || '';
      if (!hans.visible || phase !== 'place-log') return;

      if (body.leftArm?.rotation) {
        body.leftArm.rotation.x = orientHansHearthReachRotation(body.leftArm.rotation.x, forward);
      }
      if (body.rightArm?.rotation) {
        body.rightArm.rotation.x = orientHansHearthReachRotation(body.rightArm.rotation.x, forward);
      }

      hans.userData.warRoomHansHearthReach = WAR_ROOM_HANS_HEARTH_REACH_GUARD_VERSION;
      hans.userData.warRoomHansHearthReachForward = forward;
      hans.userData.warRoomHansHearthReachPose = 'arms-toward-hearth';
    },
  });
  if (!registered) return 0;

  driver.userData.warRoomHansHearthReachGuard = WAR_ROOM_HANS_HEARTH_REACH_GUARD_VERSION;
  driver.userData.warRoomHansHearthReachOrder = POST_RENDER_ORDER;
  hans.userData.warRoomHansHearthReachGuard = WAR_ROOM_HANS_HEARTH_REACH_GUARD_VERSION;
  return 1;
}
