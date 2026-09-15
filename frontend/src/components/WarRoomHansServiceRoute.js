import * as THREE from 'three';
import { moveWarRoomHansToward } from './WarRoomHansAnimator.js';
import { installWarRoomHansServiceExitDoorGuard } from './WarRoomHansServiceExitDoorGuard.js';
import { setWarRoomHansServiceDoorOpen } from './WarRoomHansServiceDoor.js';

export { moveWarRoomHansToward };

export const WAR_ROOM_HANS_SERVICE_ROUTE_VERSION = 'hans-service-route-v10-bounds-aware-furniture-standoff';
export const HANS_SERVICE_WALK_SPEED = 0.32;
export const HANS_SERVICE_FURNITURE_CLEARANCE = 0.58;

const DOOR_NAME = 'war-room-hans-service-door';
const DOOR_RECESS_NAME = 'war-room-hans-service-door-recess';
const STANDING_Y = -0.34;

function localPoint(parent, world) {
  parent.updateMatrixWorld?.(true);
  return parent.worldToLocal(world.clone());
}

function isWallArmor(object) {
  const name = String(object?.name || '');
  return name.startsWith('war-room-teutonic-armor-') || name.startsWith('war-room-armor-guard-');
}

function commandDeskHost(object) {
  let current = object || null;
  while (current) {
    const name = String(current.name || '');
    if (name === 'war-room-teutonic-command-desk-v28' || name === 'command-cabinet') return current;
    current = current.parent || null;
  }
  return null;
}

function objectBounds(object) {
  if (!object) return null;
  object.updateMatrixWorld?.(true);
  const box = new THREE.Box3().setFromObject(object);
  return box.isEmpty() ? null : box;
}

function commandDeskFrontZSign(object) {
  const host = commandDeskHost(object);
  if (!host) return 0;
  const drawer = host.getObjectByName?.('war-room-command-desk-drawer');
  if (!drawer) return 0;

  const drawerWorld = new THREE.Vector3();
  const hostWorld = new THREE.Vector3();
  drawer.getWorldPosition?.(drawerWorld);
  host.getWorldPosition?.(hostWorld);
  const worldDelta = Number(drawerWorld.z) - Number(hostWorld.z);
  if (Number.isFinite(worldDelta) && Math.abs(worldDelta) >= 1e-4) return Math.sign(worldDelta);

  const localZ = Number(drawer.position?.z);
  return Number.isFinite(localZ) && Math.abs(localZ) >= 1e-4 ? Math.sign(localZ) : 0;
}

function applyArmorStandoff(object, world, offsetX) {
  const side = Math.sign(Number(world.x)) || 1;
  const requested = Number(world.x) - side * Math.abs(Number(offsetX) || 0);
  const box = objectBounds(object);
  if (!box) {
    world.x = requested;
    return;
  }

  const safeInnerX = side > 0
    ? box.min.x - HANS_SERVICE_FURNITURE_CLEARANCE
    : box.max.x + HANS_SERVICE_FURNITURE_CLEARANCE;
  world.x = side > 0 ? Math.min(requested, safeInnerX) : Math.max(requested, safeInnerX);
}

function applyDeskStandoff(object, world, offsetX, offsetZ) {
  const host = commandDeskHost(object);
  if (!host) return false;
  const box = objectBounds(host) || objectBounds(object);
  const frontSign = commandDeskFrontZSign(object);
  if (!box || !frontSign) return false;

  const centerX = (box.min.x + box.max.x) * 0.5;
  const halfWidth = Math.max(0, (box.max.x - box.min.x) * 0.5);
  const requestedX = Number(world.x) + (Number(offsetX) || 0);
  const xDirection = Math.sign(Number(offsetX) || 0);

  if (xDirection && Math.abs(Number(offsetX)) >= halfWidth) {
    world.x = xDirection < 0
      ? box.min.x - HANS_SERVICE_FURNITURE_CLEARANCE
      : box.max.x + HANS_SERVICE_FURNITURE_CLEARANCE;
  } else {
    world.x = requestedX;
  }

  const requestedZ = Number(world.z) + frontSign * Math.abs(Number(offsetZ) || 0);
  const laterallyClear = world.x <= box.min.x - HANS_SERVICE_FURNITURE_CLEARANCE
    || world.x >= box.max.x + HANS_SERVICE_FURNITURE_CLEARANCE;
  if (laterallyClear) {
    world.z = requestedZ;
  } else {
    const safeFrontZ = frontSign > 0
      ? box.max.z + HANS_SERVICE_FURNITURE_CLEARANCE
      : box.min.z - HANS_SERVICE_FURNITURE_CLEARANCE;
    world.z = frontSign > 0 ? Math.max(requestedZ, safeFrontZ) : Math.min(requestedZ, safeFrontZ);
  }

  // Box3 can be slightly asymmetric because trim/handles extend one side. Keep
  // the requested lateral intent relative to the visual desk rather than a stale
  // hard-coded centre, but never let the target fall back inside its padded hull.
  if (!Number.isFinite(world.x)) world.x = centerX;
  return true;
}

export function installWarRoomHansServiceInfrastructure(root) {
  const door = root?.getObjectByName?.(DOOR_NAME);
  const refs = door?.userData?.refs || null;
  return installWarRoomHansServiceExitDoorGuard(root, refs);
}

export function warRoomHansServiceHome(root, parent) {
  const door = root?.getObjectByName?.(DOOR_NAME);
  const recess = door?.getObjectByName?.(DOOR_RECESS_NAME);
  if (!door || !parent) return null;
  const refs = door.userData?.refs || null;
  const world = new THREE.Vector3();
  (recess || door).getWorldPosition?.(world);
  const point = localPoint(parent, world);
  point.y = STANDING_Y;
  return { point, doorRefs: refs };
}

export function setWarRoomHansServiceDoor(root, amount) {
  const refs = root?.getObjectByName?.(DOOR_NAME)?.userData?.refs || null;
  return setWarRoomHansServiceDoorOpen(refs, amount);
}

export function warRoomHansTargetNearObject(object, parent, { offsetX = 0, offsetZ = 0 } = {}) {
  if (!object || !parent) return null;
  const world = new THREE.Vector3();
  object.getWorldPosition?.(world);

  if (isWallArmor(object) && Number(offsetX)) {
    applyArmorStandoff(object, world, offsetX);
    world.z += Number(offsetZ) || 0;
  } else if (!applyDeskStandoff(object, world, offsetX, offsetZ)) {
    world.x += Number(offsetX) || 0;
    world.z += Number(offsetZ) || 0;
  }

  const point = localPoint(parent, world);
  point.y = STANDING_Y;
  return point;
}
