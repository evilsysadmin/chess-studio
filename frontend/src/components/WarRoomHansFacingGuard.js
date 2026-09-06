import * as THREE from 'three';
import { registerWarRoomHansPostRenderStage } from './WarRoomHansPostRenderPipeline.js';

export const WAR_ROOM_HANS_FACING_GUARD_VERSION = 'rendered-face-travel-guard-v2-scratch';

const HANS_NAME = 'war-room-hans-butler';
const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const MIN_TRAVEL = 0.00004;
const MIN_TRAVEL_SQ = MIN_TRAVEL * MIN_TRAVEL;
const MIN_ACCEPTABLE_DOT = 0.78;
const POST_RENDER_ORDER = 10;

const MOVING_PHASES = new Set([
  'fire-dimming',
  'walk-to-basket',
  'carry-log',
  'take-poker',
  'stoke-fire',
  'return-poker',
  'leave',
]);

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

function faceVectorInParent(hans, head, faceAnchor, scratch, refreshMatrices = true) {
  const parent = hans?.parent;
  if (!parent || !head || !faceAnchor) return null;

  if (refreshMatrices) {
    // One forced parent update refreshes Hans + head + anchor together. The old
    // guard forced all three independently and then allocated four vectors.
    parent.updateMatrixWorld?.(true);
    scratch.parentInverse.copy(parent.matrixWorld).invert();
  }

  scratch.headLocal
    .setFromMatrixPosition(head.matrixWorld)
    .applyMatrix4(scratch.parentInverse);
  scratch.faceLocal
    .setFromMatrixPosition(faceAnchor.matrixWorld)
    .applyMatrix4(scratch.parentInverse);

  const vector = planar(scratch.faceVector.copy(scratch.faceLocal).sub(scratch.headLocal));
  if (vector.lengthSq() < 1e-8) return null;
  return vector.normalize();
}

function signedPlanarAngle(from, to) {
  const fromAngle = Math.atan2(from.x, from.z);
  const toAngle = Math.atan2(to.x, to.z);
  const delta = toAngle - fromAngle;
  return Math.atan2(Math.sin(delta), Math.cos(delta));
}

export function installWarRoomHansFacingGuard(root) {
  if (!root) return 0;
  const hans = root.getObjectByName?.(HANS_NAME);
  const driver = root.getObjectByName?.(DRIVER_NAME);
  const head = hans?.userData?.refs?.head;
  const faceAnchor = findFaceAnchor(head);
  if (!hans || !driver || !head || !faceAnchor || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansFacingGuard === WAR_ROOM_HANS_FACING_GUARD_VERSION) return 0;

  let previousX = Number(hans.position.x || 0);
  let previousZ = Number(hans.position.z || 0);
  const scratch = {
    movement: new THREE.Vector3(),
    headLocal: new THREE.Vector3(),
    faceLocal: new THREE.Vector3(),
    faceVector: new THREE.Vector3(),
    parentInverse: new THREE.Matrix4(),
  };
  let corrections = 0;

  const registered = registerWarRoomHansPostRenderStage(driver, {
    key: WAR_ROOM_HANS_FACING_GUARD_VERSION,
    order: POST_RENDER_ORDER,
    run: () => {
      const currentX = Number(hans.position.x || 0);
      const currentZ = Number(hans.position.z || 0);
      const dx = currentX - previousX;
      const dz = currentZ - previousZ;

      if (!hans.visible) {
        previousX = currentX;
        previousZ = currentZ;
        return;
      }

      const travelSq = dx * dx + dz * dz;
      const phase = driver.userData?.warRoomHansPhase
        || hans.userData?.warRoomHansChoreographyPhase
        || 'idle';

      let dotBefore = null;
      let dotAfter = null;
      if (MOVING_PHASES.has(phase) && travelSq > MIN_TRAVEL_SQ) {
        scratch.movement.set(dx, 0, dz).multiplyScalar(1 / Math.sqrt(travelSq));
        const face = faceVectorInParent(hans, head, faceAnchor, scratch, true);
        if (face) {
          dotBefore = face.dot(scratch.movement);
          if (dotBefore < MIN_ACCEPTABLE_DOT) {
            hans.rotation.y += signedPlanarAngle(face, scratch.movement);
            hans.updateMatrixWorld?.(true);
            const correctedFace = faceVectorInParent(hans, head, faceAnchor, scratch, false);
            dotAfter = correctedFace?.dot(scratch.movement) ?? null;
            corrections += 1;
          } else {
            dotAfter = dotBefore;
          }
        }
      }

      hans.userData.warRoomHansFacingGuard = WAR_ROOM_HANS_FACING_GUARD_VERSION;
      hans.userData.warRoomHansFacingGuardMode = 'rendered-face-vs-travel';
      hans.userData.warRoomHansFacingGuardCorrections = corrections;
      hans.userData.warRoomHansFacingGuardDotBefore = dotBefore;
      hans.userData.warRoomHansFacingGuardDotAfter = dotAfter;
      hans.userData.warRoomHansFacingGuardHotPath = 'preallocated-scratch-v2';
      previousX = currentX;
      previousZ = currentZ;
    },
  });
  if (!registered) return 0;

  driver.userData.warRoomHansFacingGuard = WAR_ROOM_HANS_FACING_GUARD_VERSION;
  driver.userData.warRoomHansFacingGuardMode = 'rendered-face-vs-travel';
  driver.userData.warRoomHansFacingGuardHotPath = 'preallocated-scratch-v2';
  hans.userData.warRoomHansFacingGuard = WAR_ROOM_HANS_FACING_GUARD_VERSION;
  return 1;
}
