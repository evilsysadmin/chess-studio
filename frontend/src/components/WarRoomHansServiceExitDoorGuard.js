import * as THREE from 'three';
import { setWarRoomHansServiceDoorOpen } from './WarRoomHansServiceDoor.js';

export const WAR_ROOM_HANS_SERVICE_EXIT_DOOR_GUARD_VERSION = 'hans-service-exit-door-guard-v1';

const HANS_NAME = 'war-room-hans-butler';
const FLOOR_NAME = 'war-room-castle-floor-slab';
const OPEN_START_DISTANCE = 1.1;
const FULL_OPEN_DISTANCE = 0.34;
const HOLD_OPEN_MS = 700;
const CLOSE_MS = 520;

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function returningRoute(route) {
  return String(route || '').endsWith('return');
}

export function installWarRoomHansServiceExitDoorGuard(root, doorRefs) {
  const floor = root?.getObjectByName?.(FLOOR_NAME);
  const hans = root?.getObjectByName?.(HANS_NAME);
  if (!floor || !hans || !doorRefs || typeof floor.onAfterRender !== 'function') return 0;
  if (floor.userData?.warRoomHansServiceExitDoorGuard === WAR_ROOM_HANS_SERVICE_EXIT_DOOR_GUARD_VERSION) return 0;

  const previous = floor.onAfterRender;
  const hansWorld = new THREE.Vector3();
  const doorWorld = new THREE.Vector3();
  const doorAnchor = doorRefs.recess || doorRefs.group || null;
  let latchedAt = 0;
  let lastOpen = 0;

  floor.onAfterRender = (...args) => {
    previous?.(...args);
    const now = nowMs();
    const route = String(hans.userData?.warRoomHansRoute || '');
    let open = 0;

    if (hans.visible !== false && returningRoute(route) && doorAnchor?.getWorldPosition) {
      hans.getWorldPosition(hansWorld);
      doorAnchor.getWorldPosition(doorWorld);
      const distance = Math.hypot(hansWorld.x - doorWorld.x, hansWorld.z - doorWorld.z);
      if (distance <= OPEN_START_DISTANCE) {
        open = 1 - clamp01((distance - FULL_OPEN_DISTANCE) / (OPEN_START_DISTANCE - FULL_OPEN_DISTANCE));
        if (open > 0) {
          latchedAt = now;
          lastOpen = Math.max(lastOpen, open);
        }
      }
    }

    if (latchedAt > 0) {
      const age = now - latchedAt;
      if (age <= HOLD_OPEN_MS) open = Math.max(open, lastOpen);
      else if (age <= HOLD_OPEN_MS + CLOSE_MS) {
        open = Math.max(open, lastOpen * (1 - clamp01((age - HOLD_OPEN_MS) / CLOSE_MS)));
      } else {
        latchedAt = 0;
        lastOpen = 0;
      }
    }

    if (open > 0) setWarRoomHansServiceDoorOpen(doorRefs, open);
  };

  floor.userData.warRoomHansServiceExitDoorGuard = WAR_ROOM_HANS_SERVICE_EXIT_DOOR_GUARD_VERSION;
  return 1;
}
