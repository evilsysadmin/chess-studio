import * as THREE from 'three';
import { moveWarRoomHansToward } from './WarRoomHansServiceRoute.js';

export const WAR_ROOM_HANS_NAVIGATION_VERSION = 'hans-navigation-v5-footprint-clearance';
export const WAR_ROOM_HANS_NAVIGATION_CLEAR_LANE_HALF_EXTENT = 5.5;
export const WAR_ROOM_HANS_NAVIGATION_EDGE_MARGIN = 0.12;

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

function nearestIndex(points, point, indices = null) {
  let bestIndex = indices?.[0] ?? 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  const candidates = indices || points.map((_, index) => index);
  candidates.forEach((index) => {
    const distance = distanceSquared(points[index], point);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function clearLaneHalfExtent(span) {
  const safeSpan = Math.max(0, Number(span) || 0);
  const roomHalfExtent = Math.max(0.12, safeSpan * 0.5 - WAR_ROOM_HANS_NAVIGATION_EDGE_MARGIN);
  return Math.min(WAR_ROOM_HANS_NAVIGATION_CLEAR_LANE_HALF_EXTENT, roomHalfExtent);
}

function samePlanarPoint(a, b) {
  return Boolean(a && b)
    && Math.abs(Number(a.x) - Number(b.x)) <= 1e-6
    && Math.abs(Number(a.z) - Number(b.z)) <= 1e-6;
}

function pushUnique(route, point) {
  if (!point) return;
  if (route.length && samePlanarPoint(route.at(-1), point)) return;
  route.push(point.clone?.() || new THREE.Vector3(point.x, point.y, point.z));
}

function laneBounds(loop) {
  return {
    left: Math.min(...loop.map((point) => Number(point.x))),
    right: Math.max(...loop.map((point) => Number(point.x))),
    rear: Math.min(...loop.map((point) => Number(point.z))),
    front: Math.max(...loop.map((point) => Number(point.z))),
  };
}

function nearestLaneSide(point, bounds) {
  const candidates = [
    ['rear', Math.abs(Number(point.z) - bounds.rear)],
    ['right', Math.abs(Number(point.x) - bounds.right)],
    ['front', Math.abs(Number(point.z) - bounds.front)],
    ['left', Math.abs(Number(point.x) - bounds.left)],
  ];
  candidates.sort((a, b) => a[1] - b[1]);
  return candidates[0][0];
}

function laneApproach(point, bounds) {
  const side = nearestLaneSide(point, bounds);
  const y = Number.isFinite(Number(point.y)) ? Number(point.y) : -0.34;

  if (side === 'rear' || side === 'front') {
    const z = side === 'rear' ? bounds.rear : bounds.front;
    return {
      side,
      threshold: new THREE.Vector3(Number(point.x), y, z),
      portal: new THREE.Vector3(THREE.MathUtils.clamp(Number(point.x), bounds.left, bounds.right), y, z),
    };
  }

  const x = side === 'left' ? bounds.left : bounds.right;
  return {
    side,
    threshold: new THREE.Vector3(x, y, Number(point.z)),
    portal: new THREE.Vector3(x, y, THREE.MathUtils.clamp(Number(point.z), bounds.rear, bounds.front)),
  };
}

function loopIndicesForSide(side) {
  if (side === 'rear') return [0, 1, 2];
  if (side === 'right') return [2, 3, 4];
  if (side === 'front') return [4, 5, 6];
  return [6, 7, 0];
}

function shortestLoopIndices(start, end, length) {
  const clockwise = (end - start + length) % length;
  const counterClockwise = (start - end + length) % length;
  const direction = clockwise <= counterClockwise ? 1 : -1;
  const steps = Math.min(clockwise, counterClockwise);
  const indices = [];
  for (let offset = 0; offset <= steps; offset += 1) {
    indices.push((start + direction * offset + length) % length);
  }
  return indices;
}

export function warRoomHansSafeRoomLoop(floor, parent) {
  if (!floor || !parent) return [];
  floor.updateMatrixWorld?.(true);
  parent.updateMatrixWorld?.(true);
  const box = new THREE.Box3().setFromObject(floor);
  const size = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.x) || !Number.isFinite(size.z) || size.x <= 0 || size.z <= 0) return [];

  const centerX = (box.min.x + box.max.x) * 0.5;
  const centerZ = (box.min.z + box.max.z) * 0.5;
  const laneHalfX = clearLaneHalfExtent(size.x);
  const laneHalfZ = clearLaneHalfExtent(size.z);
  const left = centerX - laneHalfX;
  const right = centerX + laneHalfX;
  const rear = centerZ - laneHalfZ;
  const front = centerZ + laneHalfZ;

  // Point clearance was not enough: Hans' feet and coat still visibly clipped
  // the board edge while his root stayed technically outside the old 5.25 lane.
  // Keep the circulation centreline far enough out for his footprint, while
  // still staying inside the fixed wall furniture and armour clearance.
  const worldPoints = [
    [left, rear],
    [centerX, rear],
    [right, rear],
    [right, centerZ],
    [right, front],
    [centerX, front],
    [left, front],
    [left, centerZ],
  ];

  return worldPoints.map(([x, z]) => localPoint(parent, new THREE.Vector3(x, -0.34, z)));
}

export function warRoomHansBuildSafeRoute(floor, parent, from, to) {
  if (!floor || !parent || !from || !to) return [];
  const loop = warRoomHansSafeRoomLoop(floor, parent);
  if (!loop.length) return [to.clone?.() || to];

  const bounds = laneBounds(loop);
  const departure = laneApproach(from, bounds);
  const arrival = laneApproach(to, bounds);
  const route = [];

  // Enter and leave the circulation lane with orthogonal legs. The old nearest-
  // node connector drew a diagonal from arbitrary task targets to the lane; that
  // diagonal was the remaining path that could visibly cut through furniture.
  pushUnique(route, departure.threshold);
  pushUnique(route, departure.portal);

  if (departure.side === arrival.side) {
    pushUnique(route, arrival.portal);
  } else {
    const start = nearestIndex(loop, departure.portal, loopIndicesForSide(departure.side));
    const end = nearestIndex(loop, arrival.portal, loopIndicesForSide(arrival.side));
    for (const index of shortestLoopIndices(start, end, loop.length)) {
      pushUnique(route, loop[index]);
    }
    pushUnique(route, arrival.portal);
  }

  pushUnique(route, arrival.threshold);
  pushUnique(route, to);
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
