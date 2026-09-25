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

export function squareFromBoard3DIntersection(hit) {
  if (!hit?.object) return null;

  if (Number.isInteger(hit.instanceId)) {
    const square = hit.object.userData?.board3DSquares?.[hit.instanceId];
    if (square) return square;
  }

  let object = hit.object;
  while (object && !object.userData?.square) object = object.parent;
  return object?.userData?.square || null;
}
