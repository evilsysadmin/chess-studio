import * as THREE from 'three';
import { registerWarRoomHansPostRenderStage } from './WarRoomHansPostRenderPipeline.js';
import { warRoomHansLocalForward } from './WarRoomHansTransformOwner.js';

export const WAR_ROOM_HANS_FACING_GUARD_VERSION = 'rendered-face-travel-guard-v5-canonical-forward';

const HANS_NAME = 'war-room-hans-butler';
const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const MIN_TRAVEL = 0.00004;
const MIN_TRAVEL_SQ = MIN_TRAVEL * MIN_TRAVEL;
const MIN_ACCEPTABLE_DOT = 0.78;
const POST_RENDER_ORDER = 10;
const VISIBLE_FACING_HOOK = 'war-room-hans-visible-facing-v1';

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

function faceVectorInParent(hans, scratch) {
  if (!hans?.parent) return null;
  const forward = warRoomHansLocalForward(hans);
  scratch.faceVector.set(0, 0, forward).applyQuaternion(hans.quaternion);
  planar(scratch.faceVector);
  if (scratch.faceVector.lengthSq() < 1e-8) return null;
  return scratch.faceVector.normalize();
}

function signedPlanarAngle(from, to) {
  const fromAngle = Math.atan2(from.x, from.z);
  const toAngle = Math.atan2(to.x, to.z);
  const delta = toAngle - fromAngle;
  return Math.atan2(Math.sin(delta), Math.cos(delta));
}

function hansTravelOwnsFacing(hans, phase) {
  const facingOwner = String(hans?.userData?.warRoomHansMovementFacing || '');
  if (facingOwner === 'work-target') return false;
  if (facingOwner === 'velocity-vector') return true;

  const motion = String(hans?.userData?.warRoomHansMotionState || '');
  const route = String(hans?.userData?.warRoomHansRoute || '');
  return MOVING_PHASES.has(String(phase || ''))
    || motion.startsWith('walk')
    || route === 'entry'
    || route.startsWith('leave-');
}

function activePhase(hans, driver) {
  return driver?.userData?.warRoomHansPhase
    || hans?.userData?.warRoomHansChoreographyPhase
    || 'idle';
}

function markFacingDiagnostics(hans, state, source, dotBefore = null, dotAfter = null) {
  hans.userData.warRoomHansFacingGuard = WAR_ROOM_HANS_FACING_GUARD_VERSION;
  hans.userData.warRoomHansFacingGuardMode = 'canonical-forward-vs-travel';
  hans.userData.warRoomHansFacingGuardTravelContract = 'phase-motion-route-v1';
  hans.userData.warRoomHansFacingGuardCorrections = state.corrections;
  hans.userData.warRoomHansFacingGuardDotBefore = dotBefore;
  hans.userData.warRoomHansFacingGuardDotAfter = dotAfter;
  hans.userData.warRoomHansFacingGuardSource = source;
  hans.userData.warRoomHansFacingGuardHotPath = 'preallocated-scratch-v5-visible';
}

function reconcileTravelFacing({
  hans,
  driver,
  scratch,
  dx,
  dz,
  source,
  state,
}) {
  if (!hans?.visible) return false;
  const phase = activePhase(hans, driver);
  if (!hansTravelOwnsFacing(hans, phase)) {
    markFacingDiagnostics(hans, state, source);
    return false;
  }

  let travelX = Number(dx) || 0;
  let travelZ = Number(dz) || 0;
  let travelSq = travelX * travelX + travelZ * travelZ;
  if (travelSq <= MIN_TRAVEL_SQ && state.lastTravelSq > MIN_TRAVEL_SQ) {
    travelX = state.lastTravelX;
    travelZ = state.lastTravelZ;
    travelSq = state.lastTravelSq;
  }
  if (travelSq <= MIN_TRAVEL_SQ) {
    markFacingDiagnostics(hans, state, source);
    return false;
  }

  const travelLength = Math.sqrt(travelSq);
  scratch.movement.set(travelX / travelLength, 0, travelZ / travelLength);
  state.lastTravelX = scratch.movement.x;
  state.lastTravelZ = scratch.movement.z;
  state.lastTravelSq = 1;

  const face = faceVectorInParent(hans, scratch);
  if (!face) {
    markFacingDiagnostics(hans, state, source);
    return false;
  }

  const dotBefore = face.dot(scratch.movement);
  let dotAfter = dotBefore;
  if (dotBefore < MIN_ACCEPTABLE_DOT) {
    hans.rotation.y += signedPlanarAngle(face, scratch.movement);
    hans.updateMatrixWorld?.(true);
    const correctedFace = faceVectorInParent(hans, scratch);
    dotAfter = correctedFace?.dot(scratch.movement) ?? null;
    state.corrections += 1;
  }

  markFacingDiagnostics(hans, state, source, dotBefore, dotAfter);
  return true;
}

function installVisibleFacingFinalizer(hans, reconcile, state) {
  let hooks = 0;
  hans?.traverse?.((object) => {
    if (!object?.isMesh || object.userData?.warRoomHansVisibleFacingHook === VISIBLE_FACING_HOOK) return;
    const previous = object.onBeforeRender;
    object.onBeforeRender = (renderer, scene, camera, geometry, material, renderGroup) => {
      previous?.(renderer, scene, camera, geometry, material, renderGroup);
      const renderFrame = Number(renderer?.info?.render?.frame);
      if (Number.isFinite(renderFrame) && state.lastVisibleRenderFrame === renderFrame) return;
      if (Number.isFinite(renderFrame)) state.lastVisibleRenderFrame = renderFrame;

      const currentX = Number(hans.position.x || 0);
      const currentZ = Number(hans.position.z || 0);
      const dx = currentX - state.previousVisibleX;
      const dz = currentZ - state.previousVisibleZ;
      reconcile(dx, dz, 'visible-mesh-pre-render');
      state.previousVisibleX = currentX;
      state.previousVisibleZ = currentZ;
    };
    object.userData ||= {};
    object.userData.warRoomHansVisibleFacingHook = VISIBLE_FACING_HOOK;
    hooks += 1;
  });
  return hooks;
}

export function installWarRoomHansFacingGuard(root) {
  if (!root) return 0;
  const hans = root.getObjectByName?.(HANS_NAME);
  const driver = root.getObjectByName?.(DRIVER_NAME);
  if (!hans || !driver || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansFacingGuard === WAR_ROOM_HANS_FACING_GUARD_VERSION) return 0;

  let previousX = Number(hans.position.x || 0);
  let previousZ = Number(hans.position.z || 0);
  const scratch = {
    movement: new THREE.Vector3(),
    faceVector: new THREE.Vector3(),
  };
  const state = {
    corrections: 0,
    lastTravelX: 0,
    lastTravelZ: 0,
    lastTravelSq: 0,
    previousVisibleX: previousX,
    previousVisibleZ: previousZ,
    lastVisibleRenderFrame: -1,
  };

  const reconcile = (dx, dz, source) => reconcileTravelFacing({
    hans,
    driver,
    scratch,
    dx,
    dz,
    source,
    state,
  });

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
        state.previousVisibleX = currentX;
        state.previousVisibleZ = currentZ;
        return;
      }

      reconcile(dx, dz, 'post-render-pipeline');
      previousX = currentX;
      previousZ = currentZ;
    },
  });
  if (!registered) return 0;

  const visibleFacingHooks = installVisibleFacingFinalizer(hans, reconcile, state);

  driver.userData.warRoomHansFacingGuard = WAR_ROOM_HANS_FACING_GUARD_VERSION;
  driver.userData.warRoomHansFacingGuardMode = 'canonical-forward-vs-travel';
  driver.userData.warRoomHansFacingGuardTravelContract = 'phase-motion-route-v1';
  driver.userData.warRoomHansFacingGuardHotPath = 'preallocated-scratch-v5-visible';
  driver.userData.warRoomHansVisibleFacingHooks = visibleFacingHooks;
  hans.userData.warRoomHansFacingGuard = WAR_ROOM_HANS_FACING_GUARD_VERSION;
  hans.userData.warRoomHansVisibleFacingHooks = visibleFacingHooks;
  return 1;
}
