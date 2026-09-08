import * as THREE from 'three';
import { moveWarRoomHansToward } from './WarRoomHansServiceRoute.js';

export const WAR_ROOM_HANS_NAVIGATION_VERSION = 'hans-navigation-v1-safe-loop';

const SAFE_LOOP_FRACTIONS = Object.freeze([
  [0.18, 0.20],
  [0.50, 0.16],
  [0.82, 0.20],
  [0.86, 0.50],
  [0.82, 0.80],
  [0.50, 0.84],
  [0.18, 0.80],
  [0.14, 0.50],
]);

function localPoint(parent, world) {
  parent.updateMatrixWorld?.(true);
  return parent.worldToLocal(world.clone());
}

function distanceSquared(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const dx = Number(a.x || 0) - Number(b.x || 0);
  const dz = Number(a.z || 0) - Number(b.z || 0);
  return dx * dx + dz * dz;
}

function nearestIndex(points, point) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  points.forEach((candidate, index) => {
    const distance = distanceSquared(candidate, point);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export function warRoomHansSafeRoomLoop(floor, parent) {
  if (!floor || !parent) return [];
  floor.updateMatrixWorld?.(true);
  parent.updateMatrixWorld?.(true);
  const box = new THREE.Box3().setFromObject(floor);
  const size = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.x) || !Number.isFinite(size.z) || size.x <= 0 || size.z <= 0) return [];

  return SAFE_LOOP_FRACTIONS.map(([px, pz]) => {
    const world = new THREE.Vector3(
      box.min.x + size.x * px,
      -0.34,
      box.min.z + size.z * pz,
    );
    return localPoint(parent, world);
  });
}

export function warRoomHansBuildSafeRoute(floor, parent, from, to) {
  if (!floor || !parent || !from || !to) return [];
  const loop = warRoomHansSafeRoomLoop(floor, parent);
  if (!loop.length) return [to.clone?.() || to];

  const start = nearestIndex(loop, from);
  const end = nearestIndex(loop, to);
  const clockwise = (end - start + loop.length) % loop.length;
  const counterClockwise = (start - end + loop.length) % loop.length;
  const direction = clockwise <= counterClockwise ? 1 : -1;
  const steps = Math.min(clockwise, counterClockwise);
  const route = [];

  for (let offset = 0; offset <= steps; offset += 1) {
    const index = (start + direction * offset + loop.length) % loop.length;
    route.push(loop[index].clone());
  }
  route.push(to.clone?.() || to);
  return route;
}

export function moveWarRoomHansAlongRoute(hans, route, index, maxStep) {
  if (!hans || !Array.isArray(route) || route.length === 0) {
    return { arrived: false, travelled: 0, index: Math.max(0, Number(index) || 0), valid: false };
  }

  let routeIndex = Math.max(0, Math.min(route.length - 1, Number(index) || 0));
  let remainingStep = Math.max(0, Number(maxStep) || 0);
  let travelled = 0;

  while (remainingStep > 0 && routeIndex < route.length) {
    const motion = moveWarRoomHansToward(hans, route[routeIndex], remainingStep);
    if (motion.blocked) return { arrived: false, travelled, index: routeIndex, valid: false };
    travelled += motion.travelled;
    remainingStep = Math.max(0, remainingStep - motion.travelled);
    if (!motion.arrived) break;
    if (routeIndex === route.length - 1) {
      return { arrived: true, travelled, index: routeIndex, valid: true };
    }
    routeIndex += 1;
  }

  return { arrived: false, travelled, index: routeIndex, valid: true };
}
