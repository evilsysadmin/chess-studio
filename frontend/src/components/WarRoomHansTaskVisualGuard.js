import * as THREE from 'three';
import { getWarRoomHansActor } from './WarRoomHansActor.js';
import { warRoomHansChoreForEvent } from './WarRoomHansChoreContract.js';

export const WAR_ROOM_HANS_TASK_VISUAL_GUARD_VERSION = 'hans-task-visual-guard-v1-ground-face';

const FLOOR_NAME = 'war-room-castle-floor-slab';
const SURFACE_NAMES = [
  'war-room-command-carpet-inner-field',
  'war-room-command-carpet-bed',
  FLOOR_NAME,
];
const ACTIVE_TASK_KINDS = new Set(['chore', 'service', 'mop']);
const MAX_GROUND_CORRECTION = 0.8;
const MIN_FACING_DOT = 0.995;

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

function firstNamed(root, names = []) {
  for (const name of names) {
    const object = root?.getObjectByName?.(name);
    if (object) return object;
  }
  return null;
}

function taskTargetObject(root, hans) {
  if (!root || !hans || hans.userData?.warRoomHansTaskPhase !== 'acting') return null;
  const kind = String(hans.userData?.warRoomHansActiveTaskKind || '');

  if (kind === 'chore') {
    const eventName = String(hans.userData?.warRoomHansChoreEvent || '');
    const chore = warRoomHansChoreForEvent(eventName);
    return firstNamed(root, chore?.targetNames || []);
  }

  if (kind === 'service') {
    const eventName = String(hans.userData?.warRoomHansServiceEvent || '');
    if (eventName === 'water-plant') return root.getObjectByName?.('war-room-hans-plant') || null;
    if (eventName === 'espresso') return root.getObjectByName?.('war-room-command-desk-top') || null;
  }

  return null;
}

export function captureWarRoomHansTaskGroundSurfaces(root) {
  root?.updateMatrixWorld?.(true);
  return SURFACE_NAMES
    .map((name) => {
      const object = root?.getObjectByName?.(name);
      if (!object) return null;
      const box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty()) return null;
      return { name, box };
    })
    .filter(Boolean)
    .sort((a, b) => b.box.max.y - a.box.max.y);
}

function groundSurfaceAt(surfaces, worldPosition) {
  const x = Number(worldPosition?.x);
  const z = Number(worldPosition?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  for (const surface of surfaces) {
    const { box } = surface;
    if (x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z) return surface;
  }
  return null;
}

function shoeBottomWorldY(shoe, scratchBox) {
  if (!shoe?.geometry || !shoe?.matrixWorld) return null;
  if (!shoe.geometry.boundingBox) shoe.geometry.computeBoundingBox?.();
  if (!shoe.geometry.boundingBox) return null;
  shoe.updateMatrixWorld?.(true);
  scratchBox.copy(shoe.geometry.boundingBox).applyMatrix4(shoe.matrixWorld);
  return Number.isFinite(scratchBox.min.y) ? scratchBox.min.y : null;
}

export function groundWarRoomHansTaskActor(hans, body, surfaces, scratch = null) {
  if (!hans?.visible || !hans.parent || !Array.isArray(surfaces) || !surfaces.length) return false;
  const leftShoe = body?.leftShoe || null;
  const rightShoe = body?.rightShoe || null;
  if (!leftShoe && !rightShoe) return false;

  const state = scratch || {
    hansWorld: new THREE.Vector3(),
    targetWorld: new THREE.Vector3(),
    targetLocal: new THREE.Vector3(),
    leftShoeBox: new THREE.Box3(),
    rightShoeBox: new THREE.Box3(),
  };

  hans.parent.updateMatrixWorld?.(true);
  hans.getWorldPosition(state.hansWorld);
  const surface = groundSurfaceAt(surfaces, state.hansWorld);
  if (!surface) return false;

  const bottoms = [
    shoeBottomWorldY(leftShoe, state.leftShoeBox),
    shoeBottomWorldY(rightShoe, state.rightShoeBox),
  ].filter(Number.isFinite);
  if (!bottoms.length) return false;

  const footBottom = Math.min(...bottoms);
  const groundY = surface.box.max.y;
  const correction = groundY - footBottom;
  if (!Number.isFinite(correction) || Math.abs(correction) > MAX_GROUND_CORRECTION) return false;

  state.targetWorld.copy(state.hansWorld);
  state.targetWorld.y += correction;
  state.targetLocal.copy(state.targetWorld);
  hans.parent.worldToLocal?.(state.targetLocal);
  if (!Number.isFinite(state.targetLocal.y)) return false;

  hans.position.y = state.targetLocal.y;
  hans.updateMatrixWorld?.(true);
  hans.userData.warRoomHansTaskVisualGrounding = WAR_ROOM_HANS_TASK_VISUAL_GUARD_VERSION;
  hans.userData.warRoomHansTaskGroundSurface = surface.name;
  hans.userData.warRoomHansTaskGroundCorrection = correction;
  return true;
}

export function faceWarRoomHansTowardObject(hans, head, targetObject, scratch = null) {
  const parent = hans?.parent;
  const faceAnchor = findFaceAnchor(head);
  if (!parent || !head || !faceAnchor || !targetObject) return false;

  const state = scratch || {
    headWorld: new THREE.Vector3(),
    faceWorld: new THREE.Vector3(),
    targetWorld: new THREE.Vector3(),
    face: new THREE.Vector3(),
    towardTarget: new THREE.Vector3(),
  };

  parent.updateMatrixWorld?.(true);
  head.updateMatrixWorld?.(true);
  faceAnchor.updateMatrixWorld?.(true);
  targetObject.updateMatrixWorld?.(true);
  head.getWorldPosition(state.headWorld);
  faceAnchor.getWorldPosition(state.faceWorld);
  targetObject.getWorldPosition(state.targetWorld);
  parent.worldToLocal(state.headWorld);
  parent.worldToLocal(state.faceWorld);
  parent.worldToLocal(state.targetWorld);

  state.face.copy(state.faceWorld).sub(state.headWorld);
  state.towardTarget.copy(state.targetWorld).sub(state.headWorld);
  state.face.y = 0;
  state.towardTarget.y = 0;
  if (state.face.lengthSq() < 1e-8 || state.towardTarget.lengthSq() < 1e-8) return false;
  state.face.normalize();
  state.towardTarget.normalize();

  const dotBefore = state.face.dot(state.towardTarget);
  if (dotBefore < MIN_FACING_DOT) {
    hans.rotation.y += signedPlanarAngle(state.face, state.towardTarget);
    hans.updateMatrixWorld?.(true);
  }

  hans.userData.warRoomHansTaskVisualFacing = WAR_ROOM_HANS_TASK_VISUAL_GUARD_VERSION;
  hans.userData.warRoomHansTaskFacingTarget = targetObject.name || 'task-target';
  hans.userData.warRoomHansTaskFacingDotBefore = dotBefore;
  return true;
}

export function installWarRoomHansTaskVisualGuard(root) {
  const actor = getWarRoomHansActor(root);
  const hans = actor?.hans;
  const body = actor?.body;
  const floor = root?.getObjectByName?.(FLOOR_NAME);
  if (!hans || !body || !floor || typeof floor.onBeforeRender !== 'function') return 0;
  if (floor.userData?.warRoomHansTaskVisualGuard === WAR_ROOM_HANS_TASK_VISUAL_GUARD_VERSION) return 0;

  const surfaces = captureWarRoomHansTaskGroundSurfaces(root);
  if (!surfaces.length) return 0;

  const previous = floor.onBeforeRender;
  const groundScratch = {
    hansWorld: new THREE.Vector3(),
    targetWorld: new THREE.Vector3(),
    targetLocal: new THREE.Vector3(),
    leftShoeBox: new THREE.Box3(),
    rightShoeBox: new THREE.Box3(),
  };
  const facingScratch = {
    headWorld: new THREE.Vector3(),
    faceWorld: new THREE.Vector3(),
    targetWorld: new THREE.Vector3(),
    face: new THREE.Vector3(),
    towardTarget: new THREE.Vector3(),
  };

  floor.onBeforeRender = (...args) => {
    previous?.(...args);
    const taskKind = String(hans.userData?.warRoomHansActiveTaskKind || '');
    const taskId = String(hans.userData?.warRoomHansActiveTask || '');
    if (!hans.visible || !taskId || !ACTIVE_TASK_KINDS.has(taskKind)) return;

    // This hook is deliberately installed after Mop/Service/Chore. It therefore
    // sees Hans at the position and pose those producers chose for this exact
    // frame, then resolves his visual contact with the room before rendering.
    groundWarRoomHansTaskActor(hans, body, surfaces, groundScratch);

    const targetObject = taskTargetObject(root, hans);
    if (targetObject) {
      faceWarRoomHansTowardObject(hans, body.head, targetObject, facingScratch);
    }

    hans.userData.warRoomHansTaskVisualGuard = WAR_ROOM_HANS_TASK_VISUAL_GUARD_VERSION;
    hans.userData.warRoomHansTaskVisualGuardOrder = 'after-task-producers-same-frame';
  };

  floor.userData.warRoomHansTaskVisualGuard = WAR_ROOM_HANS_TASK_VISUAL_GUARD_VERSION;
  hans.userData.warRoomHansTaskVisualGuard = WAR_ROOM_HANS_TASK_VISUAL_GUARD_VERSION;
  return 1;
}
