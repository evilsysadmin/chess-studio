import * as THREE from 'three';
import { registerWarRoomHansPostRenderStage } from './WarRoomHansPostRenderPipeline.js';

export const WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION = 'hearth-facing-guard-v1';

const HANS_NAME = 'war-room-hans-butler';
const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const FIRE_CORE_NAME = 'war-room-fire-core';
const POST_RENDER_ORDER = 15;
const MIN_DOT = 0.995;
const HEARTH_FACING_HOT_PATH_VERSION = 'preallocated-scratch-v2';

function findFaceAnchor(head) {
  if (!head?.children?.length) return null;
  let candidate = null;
  let strongestDepth = 0;
  for (const child of head.children) {
    const depth = Math.abs(Number(child?.position?.z));
    if (!Number.isFinite(depth) || depth <= strongestDepth) continue;
    strongestDepth = depth;
    candidate = child;
  }
  return candidate;
}

function signedPlanarAngle(from, to) {
  const fromAngle = Math.atan2(from.x, from.z);
  const toAngle = Math.atan2(to.x, to.z);
  const delta = toAngle - fromAngle;
  return Math.atan2(Math.sin(delta), Math.cos(delta));
}

function createDirectionScratch() {
  return {
    headWorld: new THREE.Vector3(),
    faceWorld: new THREE.Vector3(),
    targetWorld: new THREE.Vector3(),
    face: new THREE.Vector3(),
    towardTarget: new THREE.Vector3(),
  };
}

function sampleRenderedDirections(hans, head, faceAnchor, target, scratch) {
  const parent = hans?.parent;
  if (!parent || !head || !faceAnchor || !target || !scratch) return false;

  parent.updateMatrixWorld?.(true);
  head.updateMatrixWorld?.(true);
  faceAnchor.updateMatrixWorld?.(true);
  target.updateMatrixWorld?.(true);

  head.getWorldPosition(scratch.headWorld);
  faceAnchor.getWorldPosition(scratch.faceWorld);
  target.getWorldPosition(scratch.targetWorld);
  parent.worldToLocal(scratch.headWorld);
  parent.worldToLocal(scratch.faceWorld);
  parent.worldToLocal(scratch.targetWorld);

  scratch.face.copy(scratch.faceWorld).sub(scratch.headWorld);
  scratch.towardTarget.copy(scratch.targetWorld).sub(scratch.headWorld);
  scratch.face.y = 0;
  scratch.towardTarget.y = 0;
  if (scratch.face.lengthSq() < 1e-8 || scratch.towardTarget.lengthSq() < 1e-8) return false;
  scratch.face.normalize();
  scratch.towardTarget.normalize();
  return true;
}

export function installWarRoomHansHearthFacingGuard(root) {
  if (!root) return 0;
  const hans = root.getObjectByName?.(HANS_NAME);
  const driver = root.getObjectByName?.(DRIVER_NAME);
  const head = hans?.userData?.refs?.head;
  const faceAnchor = findFaceAnchor(head);
  const fireCore = root.getObjectByName?.(FIRE_CORE_NAME);
  if (!hans || !driver || !head || !faceAnchor || !fireCore || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansHearthFacingGuard === WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION) return 0;

  const scratch = createDirectionScratch();
  let corrections = 0;
  const registered = registerWarRoomHansPostRenderStage(driver, {
    key: WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION,
    order: POST_RENDER_ORDER,
    run: () => {
      if (!hans.visible) return;
      const phase = driver.userData?.warRoomHansPhase
        || hans.userData?.warRoomHansChoreographyPhase
        || 'idle';
      if (phase !== 'place-log') return;

      if (!sampleRenderedDirections(hans, head, faceAnchor, fireCore, scratch)) return;
      const dotBefore = scratch.face.dot(scratch.towardTarget);
      let dotAfter = dotBefore;

      if (dotBefore < MIN_DOT) {
        hans.rotation.y += signedPlanarAngle(scratch.face, scratch.towardTarget);
        hans.updateMatrixWorld?.(true);
        if (sampleRenderedDirections(hans, head, faceAnchor, fireCore, scratch)) {
          dotAfter = scratch.face.dot(scratch.towardTarget);
        }
        corrections += 1;
      }

      hans.userData.warRoomHansHearthFacingGuard = WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION;
      hans.userData.warRoomHansHearthFacingTarget = 'fire-core-rendered';
      hans.userData.warRoomHansHearthFacingDotBefore = dotBefore;
      hans.userData.warRoomHansHearthFacingDotAfter = dotAfter;
      hans.userData.warRoomHansHearthFacingCorrections = corrections;
      hans.userData.warRoomHansHearthFacingHotPath = HEARTH_FACING_HOT_PATH_VERSION;
    },
  });
  if (!registered) return 0;

  driver.userData.warRoomHansHearthFacingGuard = WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION;
  driver.userData.warRoomHansHearthFacingHotPath = HEARTH_FACING_HOT_PATH_VERSION;
  hans.userData.warRoomHansHearthFacingGuard = WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION;
  hans.userData.warRoomHansHearthFacingHotPath = HEARTH_FACING_HOT_PATH_VERSION;
  return 1;
}
