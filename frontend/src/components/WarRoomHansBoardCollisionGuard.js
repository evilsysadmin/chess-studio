import * as THREE from 'three';

export const WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION = 'board-depth-guard-v3';

const HANS_NAME = 'war-room-hans-butler';
const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const FIREPLACE_NAME = 'war-room-fireplace';
const BOARD_HALF_EXTENT = 4.52;
const HANS_BOARD_CLEARANCE = 0.58;
const SAFE_BOARD_HALF_EXTENT = BOARD_HALF_EXTENT + HANS_BOARD_CLEARANCE;
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

  const original = driver.onBeforeRender;
  const hansWorld = new THREE.Vector3();
  const fireplaceWorld = new THREE.Vector3();
  const safeWorldPosition = new THREE.Vector3();

  driver.onBeforeRender = (...args) => {
    original(...args);
    if (!hans.visible) return;

    const phase = driver.userData?.warRoomHansPhase || hans.userData?.warRoomHansChoreographyPhase || '';
    const route = hans.userData?.warRoomHansRoute || '';
    if (!isTransitPhase(phase, route)) return;

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

    // X is the canonical choreography progress coordinate. Never alter it:
    // FireCall/telemetry use it to decide when Hans is far enough onscreen to
    // answer Matthias. Only push depth behind the physical board footprint.
    hans.position.z = safeWorldPosition.z;
    if (Number.isFinite(logicalX)) hans.position.x = logicalX;

    hans.userData.warRoomHansBoardCollisionApplied = true;
    hans.userData.warRoomHansBoardCollisionGuard = WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION;
    hans.userData.warRoomHansBoardCollisionAxis = 'z';
    hans.userData.warRoomHansBoardSafeWorldZ = safeZ;
  };

  driver.userData.warRoomHansBoardCollisionGuard = WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION;
  hans.userData.warRoomHansBoardCollisionGuard = WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION;
  root.userData.warRoomHansBoardCollisionGuard = WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION;
  return 1;
}
