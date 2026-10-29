import * as THREE from 'three';
import {
  warRoomHansBoardKeepOutBounds,
  warRoomHansBuildSafeRoute,
} from './WarRoomHansNavigation.js';

// The command desk's applied bronze/luxury trim can exceed its plain top.
// At the minimum clearance its root may be blocked by the planner's padded
// *actual mesh bounds*. Move only outward along the SAME flank, not through
// the board, and validate every complete route against the existing obstacles.
export const WAR_ROOM_HANS_DESK_FLANK_RETRY_METERS = Object.freeze([0, 0.12, 0.24, 0.36, 0.48]);
export const WAR_ROOM_HANS_BOARD_EDGE_CLEARANCE = 0.16;
// Relocation beyond this distance stops looking like cleaning that desk.
export const WAR_ROOM_HANS_BOARD_EDGE_MAX_RELOCATION = 1.4;

function outsideBoardApproaches(point, bounds) {
  if (!bounds || point.x <= bounds.minX || point.x >= bounds.maxX
    || point.z <= bounds.minZ || point.z >= bounds.maxZ) return [];

  // Real browser proof found that dust-board's *target itself* is inside
  // the board keep-out. Moving it 48 cm sideways cannot repair a crossing.
  // Approach one of the four nearest board edges, only if still close enough
  // to the original service target, then use normal full-route validation.
  const candidates = [
    { axis: 'x', value: bounds.minX - WAR_ROOM_HANS_BOARD_EDGE_CLEARANCE },
    { axis: 'x', value: bounds.maxX + WAR_ROOM_HANS_BOARD_EDGE_CLEARANCE },
    { axis: 'z', value: bounds.minZ - WAR_ROOM_HANS_BOARD_EDGE_CLEARANCE },
    { axis: 'z', value: bounds.maxZ + WAR_ROOM_HANS_BOARD_EDGE_CLEARANCE },
  ].map(({ axis, value }) => {
    const moved = point.clone();
    moved[axis] = value;
    return { target: moved, displacement: moved.distanceTo(point) };
  });
  return candidates
    .filter((candidate) => candidate.displacement <= WAR_ROOM_HANS_BOARD_EDGE_MAX_RELOCATION)
    .sort((left, right) => left.displacement - right.displacement);
}

const DESK_TARGET_NAMES = new Set([
  'war-room-command-desk-top',
  'war-room-command-desk-brass-rim',
]);

export function findWarRoomHansChoreApproach({
  floor, parent, home, target, targetObject,
} = {}) {
  const fail = { target, routeIn: [], routeOut: [], extraStandoff: 0 };
  if (!floor || !parent || !home || !target) return fail;

  // Only desk chores may seek more clearance: service doors, armours and
  // other objects must retain their canonical, physically checked targets.
  const deskTarget = DESK_TARGET_NAMES.has(String(targetObject?.name || ''));
  let flankSign = 0;
  if (deskTarget && targetObject?.getWorldPosition) {
    parent.updateMatrixWorld?.(true);
    const center = targetObject.getWorldPosition(new THREE.Vector3());
    parent.worldToLocal(center);
    flankSign = Math.sign(Number(target.x) - center.x);
  }

  const retries = deskTarget && flankSign ? WAR_ROOM_HANS_DESK_FLANK_RETRY_METERS : [0];
  for (const extraStandoff of retries) {
    const candidate = target.clone();
    candidate.x += flankSign * extraStandoff;
    const routeIn = warRoomHansBuildSafeRoute(floor, parent, home, candidate);
    if (!routeIn.length) continue;
    const routeOut = warRoomHansBuildSafeRoute(floor, parent, candidate, home);
    if (!routeOut.length) continue;
    return { target: candidate, routeIn, routeOut, extraStandoff };
  }

  if (deskTarget) {
    const boardBounds = warRoomHansBoardKeepOutBounds(floor, parent);
    for (const candidate of outsideBoardApproaches(target, boardBounds)) {
      const routeIn = warRoomHansBuildSafeRoute(floor, parent, home, candidate.target);
      if (!routeIn.length) continue;
      const routeOut = warRoomHansBuildSafeRoute(floor, parent, candidate.target, home);
      if (!routeOut.length) continue;
      return {
        target: candidate.target, routeIn, routeOut,
        extraStandoff: 0, boardEdgeDisplacement: candidate.displacement,
      };
    }
  }
  return fail;
}
