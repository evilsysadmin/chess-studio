import * as THREE from 'three';

export const WAR_ROOM_HANS_FACING_GUARD_VERSION = 'rendered-face-travel-guard-v1';

const HANS_NAME = 'war-room-hans-butler';
const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const MIN_TRAVEL = 0.00004;
const MIN_ACCEPTABLE_DOT = 0.78;

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

function faceVectorInParent(hans, head, faceAnchor) {
  const parent = hans?.parent;
  if (!parent || !head || !faceAnchor) return null;

  parent.updateMatrixWorld?.(true);
  head.updateMatrixWorld?.(true);
  faceAnchor.updateMatrixWorld?.(true);

  const headWorld = head.getWorldPosition(new THREE.Vector3());
  const faceWorld = faceAnchor.getWorldPosition(new THREE.Vector3());
  const headLocal = parent.worldToLocal(headWorld.clone());
  const faceLocal = parent.worldToLocal(faceWorld.clone());
  const vector = planar(faceLocal.sub(headLocal));
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

  const original = driver.onBeforeRender;
  const previousPosition = new THREE.Vector3(hans.position.x, 0, hans.position.z);
  let corrections = 0;

  driver.onBeforeRender = (...args) => {
    original(...args);

    if (!hans.visible) {
      previousPosition.set(hans.position.x, 0, hans.position.z);
      return;
    }

    const currentPosition = new THREE.Vector3(hans.position.x, 0, hans.position.z);
    const movement = currentPosition.clone().sub(previousPosition);
    const travel = movement.length();
    const phase = driver.userData?.warRoomHansPhase
      || hans.userData?.warRoomHansChoreographyPhase
      || 'idle';

    let dotBefore = null;
    let dotAfter = null;
    if (MOVING_PHASES.has(phase) && travel > MIN_TRAVEL) {
      movement.normalize();
      const face = faceVectorInParent(hans, head, faceAnchor);
      if (face) {
        dotBefore = face.dot(movement);
        if (dotBefore < MIN_ACCEPTABLE_DOT) {
          hans.rotation.y += signedPlanarAngle(face, movement);
          hans.updateMatrixWorld?.(true);
          const correctedFace = faceVectorInParent(hans, head, faceAnchor);
          dotAfter = correctedFace?.dot(movement) ?? null;
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
    previousPosition.copy(currentPosition);
  };

  driver.userData.warRoomHansFacingGuard = WAR_ROOM_HANS_FACING_GUARD_VERSION;
  driver.userData.warRoomHansFacingGuardMode = 'rendered-face-vs-travel';
  hans.userData.warRoomHansFacingGuard = WAR_ROOM_HANS_FACING_GUARD_VERSION;
  return 1;
}
