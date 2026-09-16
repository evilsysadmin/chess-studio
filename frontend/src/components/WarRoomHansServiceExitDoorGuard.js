import * as THREE from 'three';
import { setWarRoomHansServiceDoorOpen } from './WarRoomHansServiceDoor.js';

export const WAR_ROOM_HANS_SERVICE_EXIT_DOOR_GUARD_VERSION = 'hans-service-exit-door-guard-v3-bidirectional-latch-release';

const HANS_NAME = 'war-room-hans-butler';
const FLOOR_NAME = 'war-room-castle-floor-slab';
const OPEN_START_DISTANCE = 1.1;
const FULL_OPEN_DISTANCE = 0.34;
const HOLD_OPEN_MS = 700;
const CLOSE_MS = 520;
const SERVICE_ROUTE_PREFIXES = Object.freeze(['service-', 'chore-', 'mop-']);
const OWNERSHIP_EPSILON = 1e-6;

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function serviceDoorTransitRoute(route) {
  const name = String(route || '');
  return name === 'entry'
    || name.startsWith('leave-')
    || SERVICE_ROUTE_PREFIXES.some((prefix) => name.startsWith(prefix));
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
  let latchedAt = null;
  let lastOpen = 0;
  let lastGuardOpen = null;

  floor.onAfterRender = (...args) => {
    previous?.(...args);
    const now = nowMs();
    const route = String(hans.userData?.warRoomHansRoute || '');
    let open = 0;
    let latchExpired = false;

    // The producer routines may still animate the door on their own timeline, but
    // physical clearance wins in both directions. This prevents the panel from
    // closing through Hans while he is only a few tenths of a unit past the jamb.
    if (hans.visible !== false && serviceDoorTransitRoute(route) && doorAnchor?.getWorldPosition) {
      hans.getWorldPosition(hansWorld);
      doorAnchor.getWorldPosition(doorWorld);
      const distance = Math.hypot(hansWorld.x - doorWorld.x, hansWorld.z - doorWorld.z);
      if (distance <= OPEN_START_DISTANCE) {
        open = 1 - clamp01((distance - FULL_OPEN_DISTANCE) / (OPEN_START_DISTANCE - FULL_OPEN_DISTANCE));
        if (open > 0) {
          // `performance.now()` can legitimately be 0 on the first rendered frame,
          // so null (not numeric zero) is the only safe "not latched" sentinel.
          latchedAt = now;
          lastOpen = Math.max(lastOpen, open);
        }
      }
    }

    if (latchedAt != null) {
      const age = now - latchedAt;
      if (age <= HOLD_OPEN_MS) open = Math.max(open, lastOpen);
      else if (age <= HOLD_OPEN_MS + CLOSE_MS) {
        open = Math.max(open, lastOpen * (1 - clamp01((age - HOLD_OPEN_MS) / CLOSE_MS)));
      } else {
        latchedAt = null;
        lastOpen = 0;
        latchExpired = true;
      }
    }

    if (open > 0) {
      lastGuardOpen = setWarRoomHansServiceDoorOpen(doorRefs, open);
      return;
    }

    if (latchExpired && lastGuardOpen != null) {
      // A producer can finish first and close the door, after which this
      // onAfterRender guard may reopen it for its physical-clearance hold. When
      // that hold expires, release only the value we last wrote. If another
      // producer has intentionally taken ownership meanwhile, leave it alone.
      const current = Number(doorRefs.group?.userData?.warRoomHansDoorOpen);
      if (!Number.isFinite(current) || Math.abs(current - lastGuardOpen) <= OWNERSHIP_EPSILON) {
        setWarRoomHansServiceDoorOpen(doorRefs, 0);
      }
      lastGuardOpen = null;
    }
  };

  floor.userData.warRoomHansServiceExitDoorGuard = WAR_ROOM_HANS_SERVICE_EXIT_DOOR_GUARD_VERSION;
  return 1;
}
