import * as THREE from 'three';
import { registerWarRoomHansPostRenderStage } from './WarRoomHansPostRenderPipeline.js';

export const WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION = 'board-depth-guard-v6-world-foot-grounding';

const HANS_NAME = 'war-room-hans-butler';
const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const FIREPLACE_NAME = 'war-room-fireplace';
const BOARD_HALF_EXTENT = 4.52;
const HANS_BOARD_CLEARANCE = 0.58;
const SAFE_BOARD_HALF_EXTENT = BOARD_HALF_EXTENT + HANS_BOARD_CLEARANCE;
const STANDING_Y = -0.34;
const COLLISION_POST_RENDER_ORDER = 5;
const GROUNDING_POST_RENDER_ORDER = 30;
const GROUNDING_STAGE_KEY = `${WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION}:world-foot-grounding`;
const MAX_GROUND_CORRECTION = 0.55;
const SURFACE_NAMES = [
  'war-room-command-carpet-inner-field',
  'war-room-command-carpet-bed',
  'war-room-castle-floor-slab',
];
const TRANSIT_PHASES = new Set(['fire-dimming', 'walk-to-basket', 'leave']);

function isTransitPhase(phase, route) {
  const routeName = String(route || '');
  return TRANSIT_PHASES.has(String(phase || ''))
    || routeName === 'entry'
    || routeName.startsWith('leave-');
}

function insideBoardFootprint(worldPosition) {
  return Math.abs(Number(worldPosition?.x || 0)) < SAFE_BOARD_HALF_EXTENT
    && Math.abs(Number(worldPosition?.z || 0)) < SAFE_BOARD_HALF_EXTENT;
}

function safeRearWorldZ(fireplaceWorld, hansWorld) {
  const side = Math.sign(Number(fireplaceWorld?.z || 0))
    || Math.sign(Number(hansWorld?.z || 0))
    || -1;
  return side * SAFE_BOARD_HALF_EXTENT;
}

function captureGroundSurfaces(root) {
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
    const box = surface.box;
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

function groundHansToRenderedSurface(hans, body, surfaces, scratch) {
  if (!hans?.visible || !hans.parent || !surfaces.length) return false;
  const leftShoe = body?.leftShoe || null;
  const rightShoe = body?.rightShoe || null;
  if (!leftShoe && !rightShoe) return false;

  hans.parent.updateMatrixWorld?.(true);
  hans.getWorldPosition(scratch.hansWorld);
  const surface = groundSurfaceAt(surfaces, scratch.hansWorld);
  if (!surface) return false;

  const leftBottom = shoeBottomWorldY(leftShoe, scratch.leftShoeBox);
  const rightBottom = shoeBottomWorldY(rightShoe, scratch.rightShoeBox);
  const bottoms = [leftBottom, rightBottom].filter(Number.isFinite);
  if (!bottoms.length) return false;

  const footBottom = Math.min(...bottoms);
  const groundY = surface.box.max.y;
  const correction = groundY - footBottom;
  if (!Number.isFinite(correction) || Math.abs(correction) > MAX_GROUND_CORRECTION) return false;

  scratch.targetWorld.copy(scratch.hansWorld);
  scratch.targetWorld.y += correction;
  scratch.targetLocal.copy(scratch.targetWorld);
  hans.parent.worldToLocal?.(scratch.targetLocal);
  if (!Number.isFinite(scratch.targetLocal.y)) return false;

  hans.position.y = scratch.targetLocal.y;
  hans.updateMatrixWorld?.(true);
  hans.userData.warRoomHansWorldGrounding = 'shoe-bottom-to-rendered-surface-v1';
  hans.userData.warRoomHansGroundSurface = surface.name;
  hans.userData.warRoomHansGroundWorldY = groundY;
  hans.userData.warRoomHansFootBottomWorldY = footBottom;
  hans.userData.warRoomHansGroundCorrection = correction;
  hans.userData.warRoomHansGroundedY = hans.position.y;
  return true;
}

export function installWarRoomHansBoardCollisionGuard(root) {
  if (!root) return 0;
  const hans = root.getObjectByName?.(HANS_NAME);
  const driver = root.getObjectByName?.(DRIVER_NAME);
  const fireplace = root.getObjectByName?.(FIREPLACE_NAME);
  const body = hans?.userData?.refs || null;
  if (!hans || !driver || !fireplace || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansBoardCollisionGuard === WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION) return 0;

  const hansWorld = new THREE.Vector3();
  const fireplaceWorld = new THREE.Vector3();
  const safeWorldPosition = new THREE.Vector3();
  const surfaces = captureGroundSurfaces(root);
  const groundScratch = {
    hansWorld: new THREE.Vector3(),
    targetWorld: new THREE.Vector3(),
    targetLocal: new THREE.Vector3(),
    leftShoeBox: new THREE.Box3(),
    rightShoeBox: new THREE.Box3(),
  };

  const collisionRegistered = registerWarRoomHansPostRenderStage(driver, {
    key: WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION,
    order: COLLISION_POST_RENDER_ORDER,
    run: () => {
      if (!hans.visible) {
        hans.userData.warRoomHansBoardCollisionApplied = false;
        return;
      }

      // Keep the legacy local baseline for all consumers that still sample Hans
      // before the final visual grounding stage. The actual rendered ground is
      // resolved from shoe geometry + room surface later in this same pipeline.
      hans.position.y = STANDING_Y;
      hans.userData.warRoomHansBoardGroundedY = STANDING_Y;

      const phase = driver.userData?.warRoomHansPhase || hans.userData?.warRoomHansChoreographyPhase || '';
      const route = hans.userData?.warRoomHansRoute || '';
      if (!isTransitPhase(phase, route)) {
        hans.userData.warRoomHansBoardCollisionApplied = false;
        return;
      }

      hans.getWorldPosition(hansWorld);
      if (!insideBoardFootprint(hansWorld)) {
        hans.userData.warRoomHansBoardCollisionApplied = false;
        return;
      }

      fireplace.getWorldPosition(fireplaceWorld);
      const logicalX = Number(hans.position.x);
      const safeZ = safeRearWorldZ(fireplaceWorld, hansWorld);
      safeWorldPosition.set(hansWorld.x, hansWorld.y, safeZ);
      hans.parent?.worldToLocal?.(safeWorldPosition);

      // X is the canonical choreography progress coordinate. Only depth is
      // clamped here; final Y comes from the visible shoe/surface contract.
      hans.position.z = safeWorldPosition.z;
      hans.position.y = STANDING_Y;
      if (Number.isFinite(logicalX)) hans.position.x = logicalX;

      hans.userData.warRoomHansBoardCollisionApplied = true;
      hans.userData.warRoomHansBoardCollisionGuard = WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION;
      hans.userData.warRoomHansBoardCollisionAxis = 'z';
      hans.userData.warRoomHansBoardSafeWorldZ = safeZ;
      hans.userData.warRoomHansBoardGroundedY = STANDING_Y;
    },
  });
  if (!collisionRegistered) return 0;

  const groundingRegistered = registerWarRoomHansPostRenderStage(driver, {
    key: GROUNDING_STAGE_KEY,
    order: GROUNDING_POST_RENDER_ORDER,
    run: () => {
      if (!hans.visible) return;
      groundHansToRenderedSurface(hans, body, surfaces, groundScratch);
    },
  });
  if (!groundingRegistered) return 0;

  driver.userData.warRoomHansBoardCollisionGuard = WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION;
  driver.userData.warRoomHansBoardCollisionGuardOrder = COLLISION_POST_RENDER_ORDER;
  driver.userData.warRoomHansWorldGroundingOrder = GROUNDING_POST_RENDER_ORDER;
  hans.userData.warRoomHansBoardCollisionGuard = WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION;
  root.userData.warRoomHansBoardCollisionGuard = WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION;
  return 1;
}
