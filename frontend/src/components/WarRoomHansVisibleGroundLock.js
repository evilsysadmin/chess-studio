import * as THREE from 'three';

export const WAR_ROOM_HANS_VISIBLE_GROUND_LOCK_VERSION = 'hans-visible-ground-lock-v2-dom-health';

const HANS_NAME = 'war-room-hans-butler';
const CANVAS_SELECTOR = '.game-board-stack-3d .board3d-main-canvas';
const SURFACE_NAMES = Object.freeze([
  'war-room-command-carpet-inner-field',
  'war-room-command-carpet-bed',
  'war-room-castle-floor-slab',
]);
const HOOK_MARKER = 'war-room-hans-visible-ground-lock-v2';
const MAX_CORRECTION = 1.5;

function captureSurfaces(root) {
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

function surfaceAt(surfaces, worldPosition) {
  const x = Number(worldPosition?.x);
  const z = Number(worldPosition?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return surfaces.find(({ box }) => (
    x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z
  )) || null;
}

function shoeBottomWorldY(shoe, scratchBox) {
  if (!shoe?.geometry || !shoe?.matrixWorld) return null;
  if (!shoe.geometry.boundingBox) shoe.geometry.computeBoundingBox?.();
  if (!shoe.geometry.boundingBox) return null;
  shoe.updateMatrixWorld?.(true);
  scratchBox.copy(shoe.geometry.boundingBox).applyMatrix4(shoe.matrixWorld);
  return Number.isFinite(scratchBox.min.y) ? scratchBox.min.y : null;
}

function publishGroundHealth(state, surfaceName, gap) {
  if (!Number.isFinite(gap)) return;
  if (!state.canvas || state.canvas.isConnected === false) {
    state.canvas = globalThis.document?.querySelector?.(CANVAS_SELECTOR) || null;
  }
  if (!state.canvas?.dataset) return;
  state.canvas.dataset.warRoomHansGroundGap = gap.toFixed(5);
  state.canvas.dataset.warRoomHansGroundSurface = String(surfaceName || '');
  state.canvas.dataset.warRoomHansGroundLock = WAR_ROOM_HANS_VISIBLE_GROUND_LOCK_VERSION;
}

function reconcileVisibleGround(state, source = 'visible-mesh-finalizer') {
  const { hans, body, surfaces, scratch } = state;
  if (!hans?.visible || !hans.parent || !surfaces.length) return false;

  const leftShoe = body?.leftShoe || null;
  const rightShoe = body?.rightShoe || null;
  if (!leftShoe && !rightShoe) return false;

  hans.parent.updateMatrixWorld?.(true);
  hans.updateMatrixWorld?.(true);
  hans.getWorldPosition(scratch.hansWorld);
  const surface = surfaceAt(surfaces, scratch.hansWorld);
  if (!surface) return false;

  const bottoms = [
    shoeBottomWorldY(leftShoe, scratch.leftShoeBox),
    shoeBottomWorldY(rightShoe, scratch.rightShoeBox),
  ].filter(Number.isFinite);
  if (!bottoms.length) return false;

  const footBottom = Math.min(...bottoms);
  const groundY = surface.box.max.y;
  const correction = groundY - footBottom;
  if (!Number.isFinite(correction) || Math.abs(correction) > MAX_CORRECTION) return false;

  scratch.targetWorld.copy(scratch.hansWorld);
  scratch.targetWorld.y += correction;
  scratch.targetLocal.copy(scratch.targetWorld);
  hans.parent.worldToLocal?.(scratch.targetLocal);
  if (!Number.isFinite(scratch.targetLocal.y)) return false;

  hans.position.y = scratch.targetLocal.y;
  hans.updateMatrixWorld?.(true);

  const correctedBottoms = [
    shoeBottomWorldY(leftShoe, scratch.leftShoeBox),
    shoeBottomWorldY(rightShoe, scratch.rightShoeBox),
  ].filter(Number.isFinite);
  const renderedBottom = correctedBottoms.length ? Math.min(...correctedBottoms) : groundY;
  const gap = Math.abs(renderedBottom - groundY);

  hans.userData.warRoomHansVisibleGroundLock = WAR_ROOM_HANS_VISIBLE_GROUND_LOCK_VERSION;
  hans.userData.warRoomHansVisibleGroundLockSource = source;
  hans.userData.warRoomHansVisibleGroundSurface = surface.name;
  hans.userData.warRoomHansVisibleGroundCorrection = correction;
  hans.userData.warRoomHansVisibleGroundGap = gap;
  publishGroundHealth(state, surface.name, gap);
  return true;
}

export function installWarRoomHansVisibleGroundLock(root) {
  if (!root) return 0;
  const hans = root.getObjectByName?.(HANS_NAME);
  const body = hans?.userData?.refs || null;
  if (!hans || !body?.leftShoe || !body?.rightShoe) return 0;
  if (hans.userData?.warRoomHansVisibleGroundLock === WAR_ROOM_HANS_VISIBLE_GROUND_LOCK_VERSION) return 0;

  const surfaces = captureSurfaces(root);
  if (!surfaces.length) return 0;

  const state = {
    hans,
    body,
    surfaces,
    canvas: null,
    scratch: {
      hansWorld: new THREE.Vector3(),
      targetWorld: new THREE.Vector3(),
      targetLocal: new THREE.Vector3(),
      leftShoeBox: new THREE.Box3(),
      rightShoeBox: new THREE.Box3(),
    },
  };

  let hooks = 0;
  hans.traverse?.((object) => {
    if (!object?.isMesh || object.userData?.warRoomHansVisibleGroundLockHook === HOOK_MARKER) return;
    const previous = object.onBeforeRender;
    object.onBeforeRender = (renderer, scene, camera, geometry, material, renderGroup) => {
      previous?.(renderer, scene, camera, geometry, material, renderGroup);
      // This is deliberately the last visible-mesh writer installed for Hans.
      // Any legacy choreography hook may move him first; rendered shoe contact wins.
      reconcileVisibleGround(state);
    };
    object.userData ||= {};
    object.userData.warRoomHansVisibleGroundLockHook = HOOK_MARKER;
    hooks += 1;
  });

  hans.userData.warRoomHansVisibleGroundLock = WAR_ROOM_HANS_VISIBLE_GROUND_LOCK_VERSION;
  hans.userData.warRoomHansVisibleGroundLockHooks = hooks;
  root.userData.warRoomHansVisibleGroundLock = WAR_ROOM_HANS_VISIBLE_GROUND_LOCK_VERSION;
  return hooks > 0 ? 1 : 0;
}
