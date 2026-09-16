import * as THREE from 'three';
import { moveWarRoomHansToward } from './WarRoomHansAnimator.js';
import { installWarRoomHansServiceExitDoorGuard } from './WarRoomHansServiceExitDoorGuard.js';
import { setWarRoomHansServiceDoorOpen } from './WarRoomHansServiceDoor.js';

export { moveWarRoomHansToward };

export const WAR_ROOM_HANS_SERVICE_ROUTE_VERSION = 'hans-service-route-v13-visible-exit-door-fireplace-front-carpet-edge-standoff';
export const HANS_SERVICE_WALK_SPEED = 0.32;
export const HANS_SERVICE_FURNITURE_CLEARANCE = 0.58;

const DOOR_NAME = 'war-room-hans-service-door';
const DOOR_RECESS_NAME = 'war-room-hans-service-door-recess';
const STANDING_Y = -0.34;
const COMMAND_CHAIR_NAME = 'war-room-teutonic-command-chair';
const COMMAND_CARPET_KEY_NAME = 'war-room-command-carpet-brass-key';
const FIREPLACE_NAME = 'war-room-fireplace';
const FIREPLACE_HEARTH_NAME = 'war-room-fireplace-refractory-hearth';
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

function isCommandCarpetKey(object) {
  return String(object?.name || '') === COMMAND_CARPET_KEY_NAME;
}

function isFireplace(object) {
  return String(object?.name || '') === FIREPLACE_NAME;
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

function fireplaceFrontZSign(object) {
  if (!isFireplace(object)) return 0;
  const hearth = object.getObjectByName?.(FIREPLACE_HEARTH_NAME);
  const hearthWorld = new THREE.Vector3();
  const fireplaceWorld = new THREE.Vector3();
  object.getWorldPosition?.(fireplaceWorld);

  if (hearth?.getWorldPosition) {
    hearth.getWorldPosition(hearthWorld);
    const delta = Number(hearthWorld.z) - Number(fireplaceWorld.z);
    if (Number.isFinite(delta) && Math.abs(delta) >= 1e-4) return Math.sign(delta);
  }

  // The fireplace lives on the far wall. If the refractory insert has not been
  // installed yet, the room-facing side is always back toward board centre.
  const z = Number(fireplaceWorld.z);
  return Number.isFinite(z) && Math.abs(z) >= 1e-4 ? -Math.sign(z) : 0;
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

function applyFireplaceStandoff(object, world, offsetX, offsetZ) {
  if (!isFireplace(object)) return false;
  const frontSign = fireplaceFrontZSign(object);
  if (!frontSign) return false;

  world.x += Number(offsetX) || 0;
  const hearth = object.getObjectByName?.(FIREPLACE_HEARTH_NAME);
  const hearthBox = objectBounds(hearth);
  if (hearthBox) {
    const frontPlaneZ = frontSign > 0 ? hearthBox.max.z : hearthBox.min.z;
    world.z = frontPlaneZ + frontSign * HANS_SERVICE_FURNITURE_CLEARANCE;
    return true;
  }

  const requested = Math.max(
    HANS_SERVICE_FURNITURE_CLEARANCE,
    Math.abs(Number(offsetZ) || 0),
  );
  world.z += frontSign * requested;
  return true;
}

function applyCommandCarpetKeyStandoff(object, world, offsetX, offsetZ) {
  if (!isCommandCarpetKey(object)) return false;
  const box = objectBounds(object);
  if (!box) return false;

  const spanX = box.max.x - box.min.x;
  const spanZ = box.max.z - box.min.z;
  const centerX = (box.min.x + box.max.x) * 0.5;
  const centerZ = (box.min.z + box.max.z) * 0.5;

  // The four brass strips sit on the carpet perimeter. Hans must work from the
  // room-facing side of that strip, never add the old centre-based offset toward
  // the wall. Infer whether this is a horizontal or vertical strip from geometry
  // so all four perimeter pieces remain safe if target ordering ever changes.
  if (spanX >= spanZ) {
    const side = Math.sign(centerZ) || Math.sign(Number(world.z)) || 1;
    world.x = centerX + (Number(offsetX) || 0);
    world.z = side > 0
      ? box.min.z - HANS_SERVICE_FURNITURE_CLEARANCE
      : box.max.z + HANS_SERVICE_FURNITURE_CLEARANCE;
  } else {
    const side = Math.sign(centerX) || Math.sign(Number(world.x)) || 1;
    world.x = side > 0
      ? box.min.x - HANS_SERVICE_FURNITURE_CLEARANCE
      : box.max.x + HANS_SERVICE_FURNITURE_CLEARANCE;
    world.z = centerZ + (Number(offsetZ) || 0);
  }
  return true;
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
  } else if (applyFireplaceStandoff(object, world, offsetX, offsetZ)) {
    // Fireplace targets are mirrored from rendered hearth geometry, never a
    // hard-coded world +Z that flips into the wall for the opposite room side.
  } else if (applyCommandCarpetKeyStandoff(object, world, offsetX, offsetZ)) {
    // Carpet fallback works from the room-facing edge of the visible brass key.
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
