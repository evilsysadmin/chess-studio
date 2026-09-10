import * as THREE from 'three';
import { moveWarRoomHansToward } from './WarRoomHansAnimator.js';
import { installWarRoomHansServiceExitDoorGuard } from './WarRoomHansServiceExitDoorGuard.js';
import { setWarRoomHansServiceDoorOpen } from './WarRoomHansServiceDoor.js';

export { moveWarRoomHansToward };

export const WAR_ROOM_HANS_SERVICE_ROUTE_VERSION = 'hans-service-route-v6-visible-exit-door-explicit-infrastructure-animator-motion';
export const HANS_SERVICE_WALK_SPEED = 0.78;

const DOOR_NAME = 'war-room-hans-service-door';
const DOOR_RECESS_NAME = 'war-room-hans-service-door-recess';
const STANDING_Y = -0.34;

function localPoint(parent, world) {
  parent.updateMatrixWorld?.(true);
  return parent.worldToLocal(world.clone());
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
  world.x += Number(offsetX) || 0;
  world.z += Number(offsetZ) || 0;
  const point = localPoint(parent, world);
  point.y = STANDING_Y;
  return point;
}
