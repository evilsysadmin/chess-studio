import * as THREE from 'three';
import { registerWarRoomHansPostRenderStage } from './WarRoomHansPostRenderPipeline.js';

export const WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION = 'board-depth-guard-v5-always-grounded';

const HANS_NAME = 'war-room-hans-butler';
const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const FIREPLACE_NAME = 'war-room-fireplace';
const BOARD_HALF_EXTENT = 4.52;
const HANS_BOARD_CLEARANCE = 0.58;
const SAFE_BOARD_HALF_EXTENT = BOARD_HALF_EXTENT + HANS_BOARD_CLEARANCE;
const STANDING_Y = -0.34;
const POST_RENDER_ORDER = 5;
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

export function installWarRoomHansBoardCollisionGuard(root) {
  if (!root) return 0;
  const hans = root.getObjectByName?.(HANS_NAME);
  const driver = root.getObjectByName?.(DRIVER_NAME);
  const fireplace = root.getObjectByName?.(FIREPLACE_NAME);
  if (!hans || !driver || !fireplace || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansBoardCollisionGuard === WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION) return 0;

  const hansWorld = new THREE.Vector3();
  const fireplaceWorld = new THREE.Vector3();
  const safeWorldPosition = new THREE.Vector3();

  const registered = registerWarRoomHansPostRenderStage(driver, {
    key: WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION,
    order: POST_RENDER_ORDER,
    run: () => {
      if (!hans.visible) {
        hans.userData.warRoomHansBoardCollisionApplied = false;
        return;
      }

      // Hans' root stays physically planted on the room floor in every visible
      // routine. Crouches and elder gait are articulated poses, not root-Y
      // translation, so ambient chores cannot reintroduce the levitation bug.
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

      // Run before facing/gait so every later stage sees the same position that
      // is actually rendered. X remains the canonical choreography progress
      // coordinate; only depth is clamped behind the board.
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
  if (!registered) return 0;

  driver.userData.warRoomHansBoardCollisionGuard = WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION;
  driver.userData.warRoomHansBoardCollisionGuardOrder = POST_RENDER_ORDER;
  hans.userData.warRoomHansBoardCollisionGuard = WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION;
  root.userData.warRoomHansBoardCollisionGuard = WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION;
  return 1;
}
