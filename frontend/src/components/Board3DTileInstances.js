import * as THREE from 'three';
import { FILES } from './Board3DConfig.js';
import { isLightSquare, squarePosition } from './Board3DBoardMath.js';

const TILE_COUNT_PER_COLOR = 32;

export function buildBoard3DTileInstances({ lightTileMaterial, darkTileMaterial }) {
  const geometry = new THREE.BoxGeometry(0.984, 0.105, 0.984);
  const lightTiles = new THREE.InstancedMesh(geometry, lightTileMaterial, TILE_COUNT_PER_COLOR);
  const darkTiles = new THREE.InstancedMesh(geometry, darkTileMaterial, TILE_COUNT_PER_COLOR);
  lightTiles.name = 'board3d-light-tile-instances';
  darkTiles.name = 'board3d-dark-tile-instances';
  lightTiles.receiveShadow = true;
  darkTiles.receiveShadow = true;
  lightTiles.userData.board3DSquares = [];
  darkTiles.userData.board3DSquares = [];

  const matrix = new THREE.Matrix4();
  let lightIndex = 0;
  let darkIndex = 0;

  for (let rank = 1; rank <= 8; rank += 1) {
    for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
      const square = `${FILES[fileIndex]}${rank}`;
      const { x, z } = squarePosition(square);
      const light = isLightSquare(square);
      const tiles = light ? lightTiles : darkTiles;
      const instanceId = light ? lightIndex++ : darkIndex++;
      const settling = ((fileIndex * 13 + rank * 7) % 5 - 2) * 0.0008;
      matrix.makeTranslation(x, 0.0525 + settling, z);
      tiles.setMatrixAt(instanceId, matrix);
      tiles.userData.board3DSquares[instanceId] = square;
    }
  }

  for (const tiles of [lightTiles, darkTiles]) {
    tiles.instanceMatrix.needsUpdate = true;
    tiles.computeBoundingSphere();
  }

  return [lightTiles, darkTiles];
}

function squareFromBoard3DTileIntersection(hit) {
  if (!hit?.object || !Number.isInteger(hit.instanceId)) return null;
  return hit.object.userData?.board3DSquares?.[hit.instanceId] || null;
}

export function squareFromBoard3DIntersection(hit) {
  if (!hit?.object) return null;

  const tileSquare = squareFromBoard3DTileIntersection(hit);
  if (tileSquare) return tileSquare;

  let object = hit.object;
  while (object && !object.userData?.square) object = object.parent;
  return object?.userData?.square || null;
}

export function resolveBoard3DPointerSquare(
  intersections = [],
  { selectedSquare = null, legalTargets = [], preferLegalTargets = false } = {},
) {
  if (preferLegalTargets && selectedSquare) {
    const legalSquares = new Set(
      (legalTargets || [])
        .map((target) => typeof target === 'string' ? target : target?.to || target?.square)
        .filter(Boolean),
    );
    if (legalSquares.size) {
      // The v4 play pitch intentionally keeps a real perspective. On compact
      // touch viewports a tall source piece can visually cover the centre of a
      // legal square one rank behind it. The ray still reaches that tile after
      // crossing the piece: honour the selected piece's legal destination
      // instead of letting foreground geometry steal the tap.
      for (const hit of intersections) {
        const square = squareFromBoard3DTileIntersection(hit);
        if (square && legalSquares.has(square)) return square;
      }
    }
  }

  for (const hit of intersections) {
    const square = squareFromBoard3DIntersection(hit);
    if (square) return square;
  }
  return null;
}
