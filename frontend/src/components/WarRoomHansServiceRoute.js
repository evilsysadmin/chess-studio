import * as THREE from 'three';
import { moveWarRoomHansToward } from './WarRoomHansAnimator.js';
import { installWarRoomHansServiceExitDoorGuard } from './WarRoomHansServiceExitDoorGuard.js';
import { setWarRoomHansServiceDoorOpen } from './WarRoomHansServiceDoor.js';

export { moveWarRoomHansToward };

export const WAR_ROOM_HANS_SERVICE_ROUTE_VERSION = 'hans-service-route-v8-visible-exit-door-command-desk-front-standoff';
export const HANS_SERVICE_WALK_SPEED = 0.78;

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
    if (name === 'command-cabinet' || name === 'war-room-teutonic-command-desk-v28') return current;
    current = current.parent || null;
  }
  return null;
}

function commandDeskFrontZSign(object) {
  const host = commandDeskHost(object);
  if (!host) return 0;
  const drawer = host.getObjectByName?.('war-room-command-desk-drawer');
  const localZ = Number(drawer?.position?.z);
  if (!Number.isFinite(localZ) || Math.abs(localZ) < 1e-4) return 0;
  return Math.sign(localZ);
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

  // Armour is mirrored on both side walls. Treat its X offset as a standoff
  // magnitude toward the room instead of a raw signed displacement; otherwise
  // the left fallback would send Hans farther into the wall while the right
  // target leaves him overlapping the armour/zweihander volume.
  if (isWallArmor(object) && Number(offsetX)) {
    const side = Math.sign(world.x) || 1;
    world.x -= side * Math.abs(Number(offsetX));
  } else {
    world.x += Number(offsetX) || 0;
  }

  // The command desk can be mirrored with the room. Its drawer faces the board,
  // so use that local Z sign as the source of truth for which side is actually
  // the front. Desk chore offsets are standoff magnitudes; applying raw +Z sent
  // Hans behind/inside the desk whenever the room orientation was reversed.
  const zOffset = Number(offsetZ) || 0;
  const deskFrontSign = commandDeskFrontZSign(object);
  world.z += deskFrontSign && zOffset ? deskFrontSign * Math.abs(zOffset) : zOffset;

  const point = localPoint(parent, world);
  point.y = STANDING_Y;
  return point;
}
