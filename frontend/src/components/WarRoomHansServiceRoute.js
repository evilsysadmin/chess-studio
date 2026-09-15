import * as THREE from 'three';
import { moveWarRoomHansToward } from './WarRoomHansAnimator.js';
import { installWarRoomHansServiceExitDoorGuard } from './WarRoomHansServiceExitDoorGuard.js';
import { setWarRoomHansServiceDoorOpen } from './WarRoomHansServiceDoor.js';

export { moveWarRoomHansToward };

export const WAR_ROOM_HANS_SERVICE_ROUTE_VERSION = 'hans-service-route-v11-body-clear-desk-chair-standoff';
export const HANS_SERVICE_WALK_SPEED = 0.32;
export const HANS_SERVICE_FURNITURE_CLEARANCE = 0.58;

const DOOR_NAME = 'war-room-hans-service-door';
const DOOR_RECESS_NAME = 'war-room-hans-service-door-recess';
const STANDING_Y = -0.34;
const COMMAND_CHAIR_NAME = 'war-room-teutonic-command-chair';
const COMMAND_DESK_NAMES = Object.freeze([
  'war-room-teutonic-command-desk-v28',
  'command-cabinet',
]);

function localPoint(parent, world) {
  parent.updateMatrixWorld?.(true);
  return parent.worldToLocal(world.clone());
}

function sceneRoot(object) {
  let current = object || null;
  while (current?.parent) current = current.parent;
  return current;
}

function firstNamed(root, names = []) {
  for (const name of names) {
    const object = root?.getObjectByName?.(name);
    if (object) return object;
  }
  return null;
}

function isWallArmor(object) {
  const name = String(object?.name || '');
  return name.startsWith('war-room-teutonic-armor-') || name.startsWith('war-room-armor-guard-');
}

function isCommandChair(object) {
  return String(object?.name || '') === COMMAND_CHAIR_NAME;
}

function commandDeskHost(object) {
  let current = object || null;
  while (current) {
    const name = String(current.name || '');
    if (COMMAND_DESK_NAMES.includes(name)) return current;
    current = current.parent || null;
  }
  return null;
}

function commandDeskInScene(object) {
  return firstNamed(sceneRoot(object), COMMAND_DESK_NAMES);
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
    // Once Hans is safely beside the desk, do not let the old front offset send
    // his body back into the narrow board↔desk slot. The visible front plane is
    // the furthest he needs to reach from the flank; hands/props can do the rest.
    const frontPlaneZ = frontSign > 0 ? box.max.z : box.min.z;
    world.z = frontSign > 0
      ? Math.min(requestedZ, frontPlaneZ)
      : Math.max(requestedZ, frontPlaneZ);
  } else {
    const safeFrontZ = frontSign > 0
      ? box.max.z + HANS_SERVICE_FURNITURE_CLEARANCE
      : box.min.z - HANS_SERVICE_FURNITURE_CLEARANCE;
    world.z = frontSign > 0 ? Math.max(requestedZ, safeFrontZ) : Math.min(requestedZ, safeFrontZ);
  }

  if (!Number.isFinite(world.x)) world.x = centerX;
  return true;
}

function applyCommandChairStandoff(object, world, offsetX) {
  if (!isCommandChair(object)) return false;
  const chairBox = objectBounds(object);
  if (!chairBox) return false;

  // The command chair lives behind the command desk. A naive chair-centre offset
  // points straight through the desk. Stand beside the combined furniture hull
  // instead, on the side requested by the chore contract, and work inward.
  const deskBox = objectBounds(commandDeskInScene(object));
  const side = Math.sign(Number(offsetX) || 0) || 1;
  const minX = Math.min(chairBox.min.x, deskBox?.min.x ?? chairBox.min.x);
  const maxX = Math.max(chairBox.max.x, deskBox?.max.x ?? chairBox.max.x);
  world.x = side < 0
    ? minX - HANS_SERVICE_FURNITURE_CLEARANCE
    : maxX + HANS_SERVICE_FURNITURE_CLEARANCE;
  world.z = (chairBox.min.z + chairBox.max.z) * 0.5;
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
  } else if (applyCommandChairStandoff(object, world, offsetX)) {
    // Chair geometry is deliberately handled against the neighbouring desk hull.
  } else if (!applyDeskStandoff(object, world, offsetX, offsetZ)) {
    world.x += Number(offsetX) || 0;
    world.z += Number(offsetZ) || 0;
  }

  const point = localPoint(parent, world);
  point.y = STANDING_Y;
  return point;
}
