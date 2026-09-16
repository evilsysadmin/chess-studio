import * as THREE from 'three';
import { moveWarRoomHansToward } from './WarRoomHansServiceRoute.js';

export const WAR_ROOM_HANS_NAVIGATION_VERSION = 'hans-navigation-v10-side-sofa-keepout';
export const WAR_ROOM_HANS_NAVIGATION_CLEAR_LANE_HALF_EXTENT = 5.55;
export const WAR_ROOM_HANS_NAVIGATION_EDGE_MARGIN = 0.12;
export const WAR_ROOM_HANS_NAVIGATION_FURNITURE_CLEARANCE = 0.58;
export const WAR_ROOM_HANS_NAVIGATION_BOARD_SAFE_HALF_EXTENT = 5.10;

const COMMAND_DESK_NAMES = Object.freeze([
  'war-room-teutonic-command-desk-v28',
  'command-cabinet',
  'war-room-command-desk-top',
]);
const COMMAND_CHAIR_NAME = 'war-room-teutonic-command-chair';
const SOFA_NAMES = Object.freeze([
  'war-room-sofa-left',
  'war-room-sofa-right',
]);
const GEOMETRY_EPSILON = 1e-4;

function localPoint(parent, world) {
  parent.updateMatrixWorld?.(true);
  return parent.worldToLocal(world.clone());
}

function sceneRoot(object) {
  let current = object || null;
  while (current?.parent) current = current.parent;
  return current;
}

function firstNamed(root, names) {
  for (const name of names) {
    const object = root?.getObjectByName?.(name);
    if (object) return object;
  }
  return null;
}

function distanceSquared(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const dx = Number(a.x || 0) - Number(b.x || 0);
  const dz = Number(a.z || 0) - Number(b.z || 0);
  return dx * dx + dz * dz;
}

function planarDistance(a, b) {
  return Math.sqrt(distanceSquared(a, b));
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

function indicesForSide(loop, side, bounds) {
  const axis = side === 'rear' || side === 'front' ? 'z' : 'x';
  const expected = side === 'rear'
    ? bounds.rear
    : side === 'front'
      ? bounds.front
      : side === 'left'
        ? bounds.left
        : bounds.right;
  const indices = [];
  loop.forEach((point, index) => {
    if (Math.abs(Number(point[axis]) - expected) <= 1e-6) indices.push(index);
  });
  return indices;
}

function loopIndicesBetween(start, end, length, direction) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || length <= 0) return [];
  const indices = [start];
  let current = start;
  let guard = 0;
  while (current !== end && guard <= length) {
    current = (current + direction + length) % length;
    indices.push(current);
    guard += 1;
  }
  return current === end ? indices : [];
}

function obstacleRectForObject(object, parent, padding = WAR_ROOM_HANS_NAVIGATION_FURNITURE_CLEARANCE) {
  if (!object || !parent) return null;
  object.updateMatrixWorld?.(true);
  parent.updateMatrixWorld?.(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return null;
  const y = (box.min.y + box.max.y) * 0.5;
  const corners = [
    new THREE.Vector3(box.min.x, y, box.min.z),
    new THREE.Vector3(box.min.x, y, box.max.z),
    new THREE.Vector3(box.max.x, y, box.min.z),
    new THREE.Vector3(box.max.x, y, box.max.z),
  ].map((point) => parent.worldToLocal(point));
  const xs = corners.map((point) => Number(point.x));
  const zs = corners.map((point) => Number(point.z));
  return {
    minX: Math.min(...xs) - padding,
    maxX: Math.max(...xs) + padding,
    minZ: Math.min(...zs) - padding,
    maxZ: Math.max(...zs) + padding,
  };
}

function boardKeepOutRect(floor, parent) {
  if (!floor || !parent) return null;
  floor.updateMatrixWorld?.(true);
  parent.updateMatrixWorld?.(true);
  const floorBox = new THREE.Box3().setFromObject(floor);
  if (floorBox.isEmpty()) return null;
  const center = floorBox.getCenter(new THREE.Vector3());
  const half = WAR_ROOM_HANS_NAVIGATION_BOARD_SAFE_HALF_EXTENT;
  const corners = [
    new THREE.Vector3(center.x - half, center.y, center.z - half),
    new THREE.Vector3(center.x - half, center.y, center.z + half),
    new THREE.Vector3(center.x + half, center.y, center.z - half),
    new THREE.Vector3(center.x + half, center.y, center.z + half),
  ].map((point) => parent.worldToLocal(point));
  const xs = corners.map((point) => Number(point.x));
  const zs = corners.map((point) => Number(point.z));
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function navigationObstacles(floor, parent) {
  const root = sceneRoot(floor) || sceneRoot(parent);
  const desk = firstNamed(root, COMMAND_DESK_NAMES);
  const chair = root?.getObjectByName?.(COMMAND_CHAIR_NAME) || null;
  const sofas = SOFA_NAMES
    .map((name) => root?.getObjectByName?.(name) || null)
    .filter(Boolean);
  return [
    boardKeepOutRect(floor, parent),
    ...[desk, chair, ...sofas]
      .filter(Boolean)
      .map((object) => obstacleRectForObject(object, parent)),
  ].filter(Boolean);
}

function pointInsideRect(point, rect) {
  if (!point || !rect) return false;
  return Number(point.x) > rect.minX + GEOMETRY_EPSILON
    && Number(point.x) < rect.maxX - GEOMETRY_EPSILON
    && Number(point.z) > rect.minZ + GEOMETRY_EPSILON
    && Number(point.z) < rect.maxZ - GEOMETRY_EPSILON;
}

function segmentIntersectsRectInterior(from, to, rect) {
  if (!from || !to || !rect) return false;
  const minX = rect.minX + GEOMETRY_EPSILON;
  const maxX = rect.maxX - GEOMETRY_EPSILON;
  const minZ = rect.minZ + GEOMETRY_EPSILON;
  const maxZ = rect.maxZ - GEOMETRY_EPSILON;
  if (minX >= maxX || minZ >= maxZ) return false;

  let tMin = 0;
  let tMax = 1;
  for (const [origin, delta, min, max] of [
    [Number(from.x), Number(to.x) - Number(from.x), minX, maxX],
    [Number(from.z), Number(to.z) - Number(from.z), minZ, maxZ],
  ]) {
    if (Math.abs(delta) <= GEOMETRY_EPSILON) {
      if (origin <= min || origin >= max) return false;
      continue;
    }
    let enter = (min - origin) / delta;
    let exit = (max - origin) / delta;
    if (enter > exit) [enter, exit] = [exit, enter];
    tMin = Math.max(tMin, enter);
    tMax = Math.min(tMax, exit);
    if (tMin > tMax) return false;
  }
  return tMax >= 0 && tMin <= 1 && tMax >= tMin;
}

function routeIsClear(from, route, obstacles) {
  if (!route.length) return false;
  let previous = from;
  for (const point of route) {
    for (const obstacle of obstacles) {
      if (segmentIntersectsRectInterior(previous, point, obstacle)) return false;
    }
    previous = point;
  }
  return true;
}

function routeLength(from, route) {
  let total = 0;
  let previous = from;
  for (const point of route) {
    total += planarDistance(previous, point);
    previous = point;
  }
  return total;
}

function buildCandidate(loop, departure, arrival, startIndex = null, endIndex = null, direction = 1) {
  const route = [];
  pushUnique(route, departure.threshold);
  pushUnique(route, departure.portal);
  if (Number.isInteger(startIndex) && Number.isInteger(endIndex)) {
    for (const index of loopIndicesBetween(startIndex, endIndex, loop.length, direction)) {
      pushUnique(route, loop[index]);
    }
  } else {
    pushUnique(route, arrival.portal);
  }
  pushUnique(route, arrival.portal);
  pushUnique(route, arrival.threshold);
  return route;
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

  // Keep a little more than root-point clearance around the command table. Hans'
  // canonical scaled shoulders/arms extend farther than the old synthetic 0.32u
  // footprint used by regression tests, which is why the root could be legal
  // while his rendered body still skimmed the wooden/brass rim.
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
  const loop = worldPoints.map(([x, z]) => localPoint(parent, new THREE.Vector3(x, -0.34, z)));
  const obstacles = navigationObstacles(floor, parent);

  // Central furniture, side sofas or the board keep-out can swallow a canonical
  // circulation waypoint. Remove it rather than allowing a nominally valid root
  // coordinate to put Hans' rendered body through solid scenery or onto the board.
  return obstacles.length
    ? loop.filter((point) => obstacles.every((obstacle) => !pointInsideRect(point, obstacle)))
    : loop;
}

export function warRoomHansBuildSafeRoute(floor, parent, from, to) {
  if (!floor || !parent || !from || !to) return [];
  const loop = warRoomHansSafeRoomLoop(floor, parent);
  // Safety is fail-closed. If room geometry cannot provide a circulation loop,
  // cancelling an ambient task is preferable to the historical direct-line
  // fallback that could send Hans straight through the board or furniture.
  if (!loop.length) return [];

  const bounds = laneBounds(loop);
  const departure = laneApproach(from, bounds);
  const arrival = laneApproach(to, bounds);
  const obstacles = navigationObstacles(floor, parent);
  const candidates = [];

  if (departure.side === arrival.side) {
    candidates.push(buildCandidate(loop, departure, arrival));
  }

  const departureIndices = indicesForSide(loop, departure.side, bounds);
  const arrivalIndices = indicesForSide(loop, arrival.side, bounds);
  for (const start of departureIndices) {
    for (const end of arrivalIndices) {
      candidates.push(buildCandidate(loop, departure, arrival, start, end, 1));
      candidates.push(buildCandidate(loop, departure, arrival, start, end, -1));
    }
  }

  const completed = candidates.map((route) => {
    const next = [...route];
    pushUnique(next, to);
    return next;
  });
  const clear = completed
    .filter((route) => routeIsClear(from, route, obstacles))
    .sort((a, b) => routeLength(from, a) - routeLength(from, b));

  return clear[0] || [];
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
