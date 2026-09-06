function resolveSquareFromIntersections(intersections) {
  for (const hit of intersections) {
    let object = hit?.object || null;
    while (object && !object.userData?.square) object = object.parent;
    if (object?.userData?.square) return object.userData.square;
  }
  return null;
}

/**
 * Creates a stable picking path for the 3D board.
 *
 * The previous pointer hot path rebuilt one array containing every live piece
 * plus all 64 square meshes, then asked Raycaster to recurse through it on every
 * pointermove. This picker keeps the square roots and result buffer stable. It
 * tests live pieces first (so tall piece silhouettes and coarse hit targets keep
 * their existing click behaviour), and only raycasts the 64 flat squares when
 * no piece produced a usable square.
 */
export function createBoard3DRaycastPicker({
  raycaster,
  pieceGroup,
  squareMeshes,
} = {}) {
  const squareTargets = squareMeshes instanceof Map
    ? Array.from(squareMeshes.values())
    : Array.from(squareMeshes || []);
  const intersections = [];

  return function pickBoard3DSquare() {
    if (!raycaster?.intersectObjects) return null;

    intersections.length = 0;
    raycaster.intersectObjects(pieceGroup?.children || [], true, intersections);
    const pieceSquare = resolveSquareFromIntersections(intersections);
    if (pieceSquare) return pieceSquare;

    intersections.length = 0;
    raycaster.intersectObjects(squareTargets, false, intersections);
    return resolveSquareFromIntersections(intersections);
  };
}
