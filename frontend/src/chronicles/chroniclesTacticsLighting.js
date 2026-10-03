const LEGACY_TORCH_CELLS = Object.freeze([
  Object.freeze({ x: 1, y: 5, ox: -0.98, oz: -0.78 }),
  Object.freeze({ x: 5, y: 5, ox: 0.94, oz: -0.7 }),
  Object.freeze({ x: 1, y: 3, ox: -0.88, oz: -0.82 }),
  Object.freeze({ x: 5, y: 3, ox: 0.92, oz: -0.72 }),
  Object.freeze({ x: 2, y: 1, ox: -0.72, oz: -0.92 }),
  Object.freeze({ x: 5, y: 1, ox: 0.72, oz: -0.92 }),
]);

export function chroniclesIsoUsesLegacyDressing(scenePlan) {
  return scenePlan?.sceneStyle?.dressing === 'crypt-legacy';
}

export function chroniclesIsoTorchPlacements(scenePlan, { coarsePointer = false } = {}) {
  if (chroniclesIsoUsesLegacyDressing(scenePlan)) return LEGACY_TORCH_CELLS;

  const wallFaces = Array.isArray(scenePlan?.wallFaces) ? scenePlan.wallFaces : [];
  const maxTorches = coarsePointer ? 5 : 8;
  const uniqueWallFaces = [];
  const occupiedWalls = new Set();
  wallFaces.forEach((face) => {
    const key = `${face?.x},${face?.y}`;
    if (occupiedWalls.has(key)) return;
    occupiedWalls.add(key);
    uniqueWallFaces.push(face);
  });
  if (!uniqueWallFaces.length) return Object.freeze([]);

  const stride = Math.max(1, Math.ceil(uniqueWallFaces.length / maxTorches));
  const faceOffset = {
    north: Object.freeze({ ox: 0, oz: -0.94 }),
    east: Object.freeze({ ox: 0.94, oz: 0 }),
    south: Object.freeze({ ox: 0, oz: 0.94 }),
    west: Object.freeze({ ox: -0.94, oz: 0 }),
  };

  return Object.freeze(
    uniqueWallFaces
      .filter((_, index) => index % stride === 0)
      .slice(0, maxTorches)
      .map((face) => Object.freeze({
        x: face.x,
        y: face.y,
        ...(faceOffset[face.side] || faceOffset.north),
      })),
  );
}
