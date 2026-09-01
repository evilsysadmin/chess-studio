import * as THREE from 'three';

export const MATTHIAS_KING_ANCHOR_EVENT = 'chess-war-room-matthias-anchor';

const worldPoint = new THREE.Vector3();

export function projectMatthiasKingAnchor(mesh, camera, viewport = {}) {
  if (!mesh || !camera) return null;
  const width = Math.max(1, Number(viewport.width) || 1);
  const height = Math.max(1, Number(viewport.height) || 1);
  mesh.getWorldPosition(worldPoint);
  worldPoint.y += 1.18;
  worldPoint.project(camera);
  if (!Number.isFinite(worldPoint.x) || !Number.isFinite(worldPoint.y) || worldPoint.z < -1 || worldPoint.z > 1) return null;
  return {
    x: (worldPoint.x * 0.5 + 0.5) * width,
    y: (-worldPoint.y * 0.5 + 0.5) * height,
    width,
    height,
  };
}

export function materiallyDifferentAnchor(previous, next, threshold = 2.5) {
  if (!previous || !next) return previous !== next;
  return Math.abs(previous.x - next.x) >= threshold
    || Math.abs(previous.y - next.y) >= threshold
    || previous.width !== next.width
    || previous.height !== next.height;
}

export function bubblePlacement(anchor, preferredWidth = 286) {
  if (!anchor) return null;
  const margin = 10;
  const width = Math.min(preferredWidth, Math.max(220, anchor.width * 0.52));
  const placeLeft = anchor.x > anchor.width * 0.58;
  const left = placeLeft
    ? Math.max(margin, anchor.x - width - 22)
    : Math.min(Math.max(margin, anchor.width - width - margin), anchor.x + 22);
  const top = Math.max(margin, Math.min(anchor.height - 132, anchor.y - 118));
  return { left, top, width, tail: placeLeft ? 'right' : 'left' };
}
