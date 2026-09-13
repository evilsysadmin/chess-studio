import * as THREE from 'three';
import {
  getWarRoomHansActor,
  getWarRoomHansNarrativePhase,
} from './WarRoomHansActor.js';
import { hansBoardPeekHoldsMovement } from './WarRoomHansFireCallContract.js';
import { registerWarRoomHansPostRenderStage } from './WarRoomHansPostRenderPipeline.js';

export const WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION = 'hearth-facing-guard-v6-visible-work-targets';

const FIRE_CORE_NAME = 'war-room-fire-core';
const BASKET_NAME = 'war-room-hearth-log-basket';
const TOOLS_NAME = 'war-room-hearth-tool-stand';
const POST_RENDER_ORDER = 15;
const MIN_DOT = 0.995;
const HEARTH_FACING_HOT_PATH_VERSION = 'preallocated-scratch-v5-board-world';
const VISIBLE_HEARTH_FACING_HOOK = 'war-room-hans-visible-hearth-facing-v1';

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

function sampleRenderedDirectionsToBoard(hans, head, faceAnchor, scratch) {
  const parent = hans?.parent;
  if (!parent || !head || !faceAnchor || !scratch) return false;
  parent.updateMatrixWorld?.(true);
  head.updateMatrixWorld?.(true);
  faceAnchor.updateMatrixWorld?.(true);

  head.getWorldPosition(scratch.headWorld);
  faceAnchor.getWorldPosition(scratch.faceWorld);
  scratch.targetWorld.set(0, scratch.headWorld.y, 0);
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

function stationaryWorkTarget(root, hans, phase) {
  const owner = String(hans?.userData?.warRoomHansMovementFacing || '');
  const workOwned = owner === 'work-target';
  const targetLabel = String(hans?.userData?.warRoomHansFacingTarget || '');

  // Legacy/tests may not publish MotionPolish ownership yet. These phases are
  // inherently stationary in the fireplace timeline and remain safe fallbacks.
  const stationaryFallback = phase === 'take-log' || phase === 'place-log' || phase === 'satisfied';
  if (!workOwned && !stationaryFallback) return null;

  if (phase === 'take-log' || targetLabel === 'basket') {
    return root?.getObjectByName?.(BASKET_NAME) || null;
  }
  if (phase === 'take-poker' || phase === 'return-poker' || targetLabel === 'tools') {
    return root?.getObjectByName?.(TOOLS_NAME) || null;
  }
  // carry-log starts with a deliberate stationary turn toward the fire even
  // though its public facingTarget diagnostic says "hearth". orientationTarget
  // in the iteration is the fire, so work-target ownership resolves it here.
  if (
    phase === 'carry-log'
    || phase === 'place-log'
    || phase === 'stoke-fire'
    || phase === 'satisfied'
    || targetLabel === 'fire'
    || targetLabel === 'hearth'
  ) {
    return root?.getObjectByName?.(FIRE_CORE_NAME) || null;
  }
  return null;
}

function installVisibleHearthFacingFinalizer(hans, reconcile, state) {
  let hooks = 0;
  hans?.traverse?.((object) => {
    if (!object?.isMesh || object.userData?.warRoomHansVisibleHearthFacingHook === VISIBLE_HEARTH_FACING_HOOK) return;
    const previous = object.onBeforeRender;
    object.onBeforeRender = (renderer, scene, camera, geometry, material, renderGroup) => {
      previous?.(renderer, scene, camera, geometry, material, renderGroup);
      const renderFrame = Number(renderer?.info?.render?.frame);
      if (Number.isFinite(renderFrame) && state.lastVisibleRenderFrame === renderFrame) return;
      if (Number.isFinite(renderFrame)) state.lastVisibleRenderFrame = renderFrame;
      reconcile('visible-mesh-pre-render');
    };
    object.userData ||= {};
    object.userData.warRoomHansVisibleHearthFacingHook = VISIBLE_HEARTH_FACING_HOOK;
    hooks += 1;
  });
  return hooks;
}

export function installWarRoomHansHearthFacingGuard(root) {
  const actor = getWarRoomHansActor(root);
  const hans = actor?.hans;
  const driver = actor?.driver;
  const head = actor?.body?.head;
  const faceAnchor = findFaceAnchor(head);
  const fireCore = root?.getObjectByName?.(FIRE_CORE_NAME);
  if (!hans || !driver || !head || !faceAnchor || !fireCore || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansHearthFacingGuard === WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION) return 0;

  const scratch = createDirectionScratch();
  const state = {
    corrections: 0,
    lastVisibleRenderFrame: -1,
  };

  const reconcile = (source) => {
    if (!hans.visible) return false;
    const narrativePhase = getWarRoomHansNarrativePhase(actor);
    const boardPeek = hansBoardPeekHoldsMovement(narrativePhase);
    const phase = driver.userData?.warRoomHansPhase
      || hans.userData?.warRoomHansChoreographyPhase
      || 'idle';
    const workTarget = boardPeek ? null : stationaryWorkTarget(root, hans, phase);
    if (!boardPeek && !workTarget) return false;

    const sampled = boardPeek
      ? sampleRenderedDirectionsToBoard(hans, head, faceAnchor, scratch)
      : sampleRenderedDirections(hans, head, faceAnchor, workTarget, scratch);
    if (!sampled) return false;

    const dotBefore = scratch.face.dot(scratch.towardTarget);
    let dotAfter = dotBefore;
    if (dotBefore < MIN_DOT) {
      hans.rotation.y += signedPlanarAngle(scratch.face, scratch.towardTarget);
      hans.updateMatrixWorld?.(true);
      const resampled = boardPeek
        ? sampleRenderedDirectionsToBoard(hans, head, faceAnchor, scratch)
        : sampleRenderedDirections(hans, head, faceAnchor, workTarget, scratch);
      if (resampled) dotAfter = scratch.face.dot(scratch.towardTarget);
      state.corrections += 1;
    }

    hans.userData.warRoomHansHearthFacingGuard = WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION;
    hans.userData.warRoomHansHearthFacingTarget = boardPeek
      ? 'board-center-world'
      : (workTarget.name || 'hearth-work-target');
    hans.userData.warRoomHansHearthFacingDotBefore = dotBefore;
    hans.userData.warRoomHansHearthFacingDotAfter = dotAfter;
    hans.userData.warRoomHansHearthFacingCorrections = state.corrections;
    hans.userData.warRoomHansHearthFacingHotPath = HEARTH_FACING_HOT_PATH_VERSION;
    hans.userData.warRoomHansHearthFacingSource = source;
    return true;
  };

  const registered = registerWarRoomHansPostRenderStage(driver, {
    key: WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION,
    order: POST_RENDER_ORDER,
    run: () => reconcile('post-render-pipeline'),
  });
  if (!registered) return 0;

  const visibleFacingHooks = installVisibleHearthFacingFinalizer(hans, reconcile, state);

  driver.userData.warRoomHansHearthFacingGuard = WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION;
  driver.userData.warRoomHansHearthFacingHotPath = HEARTH_FACING_HOT_PATH_VERSION;
  driver.userData.warRoomHansVisibleHearthFacingHooks = visibleFacingHooks;
  hans.userData.warRoomHansHearthFacingGuard = WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION;
  hans.userData.warRoomHansHearthFacingHotPath = HEARTH_FACING_HOT_PATH_VERSION;
  hans.userData.warRoomHansVisibleHearthFacingHooks = visibleFacingHooks;
  return 1;
}
