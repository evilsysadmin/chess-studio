import * as THREE from 'three';
import { squarePosition } from './Board3DBoardMath.js';
import { clearObjectGroup } from './Board3DObjectLifecycle.js';

// Terrain hint geometry belongs to its own scene domain, not the WebGL/React
// orchestration core. Refreshing a hint disposes the previous obstacles.
export function updateBoard3DTerrainObstacles(group, terrainSquares) {
  clearObjectGroup(group);
  for (const square of terrainSquares) {
    const { x, z } = squarePosition(square);
    const obstacle = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.24, 0.62),
      new THREE.MeshPhysicalMaterial({
        color: 0x4f5558,
        metalness: 0.1,
        roughness: 0.86,
        clearcoat: 0.06,
        clearcoatRoughness: 0.7,
      }),
    );
    obstacle.position.set(x, 0.19, z);
    obstacle.rotation.y = Math.PI / 4;
    obstacle.castShadow = true;
    obstacle.receiveShadow = true;
    obstacle.userData.terrainBlocked = square;
    group.add(obstacle);
  }
}
