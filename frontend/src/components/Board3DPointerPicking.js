import * as THREE from 'three';
import { squarePosition } from './Board3DBoardMath.js';
import { squareFromBoard3DIntersection } from './Board3DTileInstances.js';
import { resolveCoarsePieceIntent } from './WarRoom3DTouch.js';

export function resolveBoard3DPointerSquare({
  event,
  element,
  camera,
  raycaster,
  pointer,
  pickTargets,
  coarsePointer = false,
  pieceSquares = [],
  selectedSquare = null,
}) {
  const rect = element.getBoundingClientRect();
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const directSquare = raycaster.intersectObjects(pickTargets, true)
    .map(squareFromBoard3DIntersection)
    .find(Boolean) || null;
  if (!coarsePointer) return directSquare;

  const projection = new THREE.Vector3();
  const projectedPieces = [...pieceSquares].map((square) => {
    const { x, z } = squarePosition(square);
    projection.set(x, 0.58, z).project(camera);
    return {
      square,
      x:rect.left + ((projection.x + 1) * rect.width / 2),
      y:rect.top + ((1 - projection.y) * rect.height / 2),
    };
  });
  return resolveCoarsePieceIntent({
    directSquare,
    selectedSquare,
    pointer:{ x:event.clientX, y:event.clientY },
    projectedPieces,
  });
}
