import * as THREE from 'three';
import { getWarRoomHansActor } from './WarRoomHansActor.js';
import { warRoomHansChoreForEvent } from './WarRoomHansChoreContract.js';
import {
  commitWarRoomHansGroundedY,
  warRoomHansLocalForward,
} from './WarRoomHansTransformOwner.js';

export const WAR_ROOM_HANS_TASK_VISUAL_GUARD_VERSION = 'hans-task-visual-guard-v4-canonical-forward';

const FLOOR_NAME = 'war-room-castle-floor-slab';
const SURFACE_NAMES = [
  'war-room-command-carpet-inner-field',
  'war-room-command-carpet-bed',
  FLOOR_NAME,
];
const ACTIVE_TASK_KINDS = new Set(['chore', 'service', 'mop']);
const MAX_GROUND_CORRECTION = 0.8;
const MIN_FACING_DOT = 0.995;
const VISIBLE_TASK_VISUAL_HOOK = 'war-room-hans-visible-task-visual-v1';

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

function taskVisualActive(hans) {
  const taskKind = String(hans?.userData?.warRoomHansActiveTaskKind || '');
  const taskId = String(hans?.userData?.warRoomHansActiveTask || '');
  return Boolean(hans?.visible && taskId && ACTIVE_TASK_KINDS.has(taskKind));
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
  if (!commitWarRoomHansGroundedY(hans, state.targetLocal.y, 'task-visual-grounding')) return false;

  hans.updateMatrixWorld?.(true);
  hans.userData.warRoomHansTaskVisualGrounding = WAR_ROOM_HANS_TASK_VISUAL_GUARD_VERSION;
  hans.userData.warRoomHansTaskGroundSurface = surface.name;
  hans.userData.warRoomHansTaskGroundCorrection = correction;
  return true;
}

export function faceWarRoomHansTowardObject(hans, head, targetObject, scratch = null) {
  const parent = hans?.parent;
  if (!parent || !head || !targetObject) return false;

  const state = scratch || {
    headWorld: new THREE.Vector3(),
    targetWorld: new THREE.Vector3(),
    face: new THREE.Vector3(),
    towardTarget: new THREE.Vector3(),
  };

  parent.updateMatrixWorld?.(true);
  head.updateMatrixWorld?.(true);
  targetObject.updateMatrixWorld?.(true);
  head.getWorldPosition(state.headWorld);
  targetObject.getWorldPosition(state.targetWorld);
  parent.worldToLocal(state.headWorld);
  parent.worldToLocal(state.targetWorld);

  state.face
    .set(0, 0, warRoomHansLocalForward(hans))
    .applyQuaternion(hans.quaternion);
  state.towardTarget.copy(state.targetWorld).sub(state.headWorld);
  state.face.y = 0;
  state.towardTarget.y = 0;
  if (state.face.lengthSq() < 1e-8 || state.towardTarget.lengthSq() < 1e-8) return false;
  state.face.normalize();
  state.towardTarget.normalize();

  const dotBefore = state.face.dot(state.towardTarget);
  let dotAfter = dotBefore;
  if (dotBefore < MIN_FACING_DOT) {
    hans.rotation.y += signedPlanarAngle(state.face, state.towardTarget);
    hans.updateMatrixWorld?.(true);
    state.face
      .set(0, 0, warRoomHansLocalForward(hans))
      .applyQuaternion(hans.quaternion);
    state.face.y = 0;
    if (state.face.lengthSq() >= 1e-8) dotAfter = state.face.normalize().dot(state.towardTarget);
  }

  hans.userData.warRoomHansTaskVisualFacing = WAR_ROOM_HANS_TASK_VISUAL_GUARD_VERSION;
  hans.userData.warRoomHansTaskFacingContract = 'canonical-local-forward-v1';
  hans.userData.warRoomHansTaskFacingTarget = targetObject.name || 'task-target';
  hans.userData.warRoomHansTaskFacingDotBefore = dotBefore;
  hans.userData.warRoomHansTaskFacingDotAfter = dotAfter;
  return true;
}

function createTaskVisualState(root, hans, body, surfaces) {
  return {
    root,
    hans,
    body,
    surfaces,
    lastVisibleRenderFrame: -1,
    groundScratch: {
      hansWorld: new THREE.Vector3(),
      targetWorld: new THREE.Vector3(),
      targetLocal: new THREE.Vector3(),
      leftShoeBox: new THREE.Box3(),
      rightShoeBox: new THREE.Box3(),
    },
    facingScratch: {
      headWorld: new THREE.Vector3(),
      targetWorld: new THREE.Vector3(),
      face: new THREE.Vector3(),
      towardTarget: new THREE.Vector3(),
    },
  };
}

function reconcileTaskVisualState(state, source) {
  const { root, hans, body, surfaces, groundScratch, facingScratch } = state;
  if (!taskVisualActive(hans)) return false;

  const grounded = groundWarRoomHansTaskActor(hans, body, surfaces, groundScratch);
  const targetObject = taskTargetObject(root, hans);
  const faced = targetObject
    ? faceWarRoomHansTowardObject(hans, body.head, targetObject, facingScratch)
    : false;

  hans.userData.warRoomHansTaskVisualGuard = WAR_ROOM_HANS_TASK_VISUAL_GUARD_VERSION;
  hans.userData.warRoomHansTaskVisualGuardOrder = 'producer-pass-plus-visible-mesh-finalizer';
  hans.userData.warRoomHansTaskVisualSource = source;
  return grounded || faced;
}

function installVisibleTaskVisualFinalizer(hans, state) {
  let hooks = 0;
  hans?.traverse?.((object) => {
    if (!object?.isMesh || object.userData?.warRoomHansVisibleTaskVisualHook === VISIBLE_TASK_VISUAL_HOOK) return;
    const previous = object.onBeforeRender;
    object.onBeforeRender = (renderer, scene, camera, geometry, material, renderGroup) => {
      previous?.(renderer, scene, camera, geometry, material, renderGroup);
      const renderFrame = Number(renderer?.info?.render?.frame);
      if (Number.isFinite(renderFrame) && state.lastVisibleRenderFrame === renderFrame) return;
      if (Number.isFinite(renderFrame)) state.lastVisibleRenderFrame = renderFrame;
      reconcileTaskVisualState(state, 'visible-mesh-pre-render');
    };
    object.userData ||= {};
    object.userData.warRoomHansVisibleTaskVisualHook = VISIBLE_TASK_VISUAL_HOOK;
    hooks += 1;
  });
  return hooks;
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

  const state = createTaskVisualState(root, hans, body, surfaces);
  const previous = floor.onBeforeRender;

  floor.onBeforeRender = (...args) => {
    previous?.(...args);
    // Preserve the producer-following pass for task position/pose changes. A
    // second pass on Hans' first visible mesh is the final authority in case a
    // later choreography writer resets root Y or facing before he is painted.
    reconcileTaskVisualState(state, 'task-producer-pass');
  };

  const visibleHooks = installVisibleTaskVisualFinalizer(hans, state);

  floor.userData.warRoomHansTaskVisualGuard = WAR_ROOM_HANS_TASK_VISUAL_GUARD_VERSION;
  hans.userData.warRoomHansTaskVisualGuard = WAR_ROOM_HANS_TASK_VISUAL_GUARD_VERSION;
  hans.userData.warRoomHansVisibleTaskVisualHooks = visibleHooks;
  return 1;
}
