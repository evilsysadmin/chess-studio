import * as THREE from 'three';
import { registerWarRoomHansPostRenderStage } from './WarRoomHansPostRenderPipeline.js';

export const WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION = 'hearth-facing-guard-v1';

const HANS_NAME = 'war-room-hans-butler';
const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const FIRE_CORE_NAME = 'war-room-fire-core';
const POST_RENDER_ORDER = 15;
const MIN_DOT = 0.995;

function planar(vector) {
  vector.y = 0;
  return vector;
}

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

function renderedDirections(hans, head, faceAnchor, target) {
  const parent = hans?.parent;
  if (!parent || !head || !faceAnchor || !target) return null;

  parent.updateMatrixWorld?.(true);
  head.updateMatrixWorld?.(true);
  faceAnchor.updateMatrixWorld?.(true);
  target.updateMatrixWorld?.(true);

  const headWorld = head.getWorldPosition(new THREE.Vector3());
  const faceWorld = faceAnchor.getWorldPosition(new THREE.Vector3());
  const targetWorld = target.getWorldPosition(new THREE.Vector3());
  const headLocal = parent.worldToLocal(headWorld.clone());
  const faceLocal = parent.worldToLocal(faceWorld.clone());
  const targetLocal = parent.worldToLocal(targetWorld.clone());

  const face = planar(faceLocal.sub(headLocal));
  const towardTarget = planar(targetLocal.sub(headLocal));
  if (face.lengthSq() < 1e-8 || towardTarget.lengthSq() < 1e-8) return null;
  return { face: face.normalize(), towardTarget: towardTarget.normalize() };
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

      const directions = renderedDirections(hans, head, faceAnchor, fireCore);
      if (!directions) return;
      const dotBefore = directions.face.dot(directions.towardTarget);
      let dotAfter = dotBefore;

      if (dotBefore < MIN_DOT) {
        hans.rotation.y += signedPlanarAngle(directions.face, directions.towardTarget);
        hans.updateMatrixWorld?.(true);
        const corrected = renderedDirections(hans, head, faceAnchor, fireCore);
        dotAfter = corrected?.face.dot(corrected.towardTarget) ?? dotBefore;
        corrections += 1;
      }

      hans.userData.warRoomHansHearthFacingGuard = WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION;
      hans.userData.warRoomHansHearthFacingTarget = 'fire-core-rendered';
      hans.userData.warRoomHansHearthFacingDotBefore = dotBefore;
      hans.userData.warRoomHansHearthFacingDotAfter = dotAfter;
      hans.userData.warRoomHansHearthFacingCorrections = corrections;
    },
  });
  if (!registered) return 0;

  driver.userData.warRoomHansHearthFacingGuard = WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION;
  hans.userData.warRoomHansHearthFacingGuard = WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION;
  return 1;
}
