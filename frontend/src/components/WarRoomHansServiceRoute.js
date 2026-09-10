import * as THREE from 'three';
import { installWarRoomHansServiceExitDoorGuard } from './WarRoomHansServiceExitDoorGuard.js';
import { setWarRoomHansServiceDoorOpen } from './WarRoomHansServiceDoor.js';

export const WAR_ROOM_HANS_SERVICE_ROUTE_VERSION = 'hans-service-route-v5-visible-exit-door-explicit-infrastructure-grounding-owned-y';
export const HANS_SERVICE_WALK_SPEED = 0.78;

const DOOR_NAME = 'war-room-hans-service-door';
const DOOR_RECESS_NAME = 'war-room-hans-service-door-recess';
const STANDING_Y = -0.34;
const TARGET_EPSILON = 0.09;

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

export function moveWarRoomHansToward(hans, target, maxStep) {
  if (!hans || !target) return { arrived: false, travelled: 0, blocked: true };
  const dx = target.x - hans.position.x;
  const dz = target.z - hans.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= TARGET_EPSILON) return { arrived: true, travelled: 0, blocked: false };
  const step = Math.min(distance, Math.max(0, Number(maxStep) || 0));
  hans.position.x += dx / distance * step;
  hans.position.z += dz / distance * step;
  // Service navigation owns only the horizontal route. The rendered grounding
  // stage owns Y from the real shoe bottom and visible room surface; rewriting
  // Y here made floor-driven routines lift Hans again before he was rendered.
  hans.rotation.y = Math.atan2(dx, dz);
  return { arrived: distance - step <= TARGET_EPSILON, travelled: step, blocked: false };
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
