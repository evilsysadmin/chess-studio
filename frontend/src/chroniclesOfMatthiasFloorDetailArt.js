import * as THREE from 'three';
import { CHRONICLES_ISOMETRIC_CELL_SIZE } from './chronicles/chroniclesIsometricDungeonPlan.js';
import { chroniclesIsometricCellToWorld } from './chronicles/chroniclesIsometricScenePlan.js';

const ROOT_NAME = 'chronicles-tactics-floor-detail';
const CELL = CHRONICLES_ISOMETRIC_CELL_SIZE;

export const CHRONICLES_TACTICS_FLOOR_DETAIL_STYLE = Object.freeze({
  profile: 'slab-cracks-v1',
  crackSegmentsPerMarkedTile: 2,
  desktopModulo: 3,
  coarseModulo: 5,
});

function noise(x, y, salt = 0) {
  const value = Math.sin((x + 11.7 + salt) * 12.9898 + (y - 4.3 - salt) * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function chroniclesTacticsFloorDetailCells(scenePlan = {}, { coarsePointer = false } = {}) {
  const modulo = coarsePointer
    ? CHRONICLES_TACTICS_FLOOR_DETAIL_STYLE.coarseModulo
    : CHRONICLES_TACTICS_FLOOR_DETAIL_STYLE.desktopModulo;
  return Object.freeze((scenePlan?.floors || []).filter(({ x, y }) => (
    ((x * 7 + y * 11) % modulo) === 0
  )));
}

export function installChroniclesTacticsFloorDetail(scene, {
  coarsePointer = false,
  scenePlan = {},
} = {}) {
  if (!scene?.add) return null;
  const existing = scene.getObjectByName?.(ROOT_NAME);
  if (existing) return existing;

  const root = new THREE.Group();
  root.name = ROOT_NAME;
  const cells = chroniclesTacticsFloorDetailCells(scenePlan, { coarsePointer });
  const count = cells.length * CHRONICLES_TACTICS_FLOOR_DETAIL_STYLE.crackSegmentsPerMarkedTile;

  if (!count) {
    root.userData.chroniclesFloorDetailProfile = CHRONICLES_TACTICS_FLOOR_DETAIL_STYLE.profile;
    root.userData.chroniclesFloorDetailCount = 0;
    scene.add(root);
    return root;
  }

  const material = new THREE.MeshBasicMaterial({
    color: scenePlan?.mapId === 'menagerie-of-ash' ? 0x1e1512 : 0x242522,
    transparent: true,
    opacity: coarsePointer ? 0.34 : 0.46,
    depthWrite: false,
  });
  material.userData.chroniclesIsoOwned = true;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'chronicles-tactics-floor-crack-instances';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;

  const dummy = new THREE.Object3D();
  let index = 0;
  cells.forEach(({ x, y }) => {
    const world = chroniclesIsometricCellToWorld(scenePlan, x, y, CELL);
    for (let segment = 0; segment < 2; segment += 1) {
      const angle = (noise(x, y, 31 + segment) - 0.5) * 1.6 + segment * 0.72;
      const offsetX = (noise(x, y, 47 + segment) - 0.5) * 0.62;
      const offsetZ = (noise(x, y, 59 + segment) - 0.5) * 0.62;
      dummy.position.set(world.x + offsetX, 0.003 + segment * 0.0004, world.z + offsetZ);
      dummy.rotation.set(0, angle, 0);
      dummy.scale.set(0.42 + noise(x, y, 71 + segment) * 0.34, 0.006, 0.028);
      dummy.updateMatrix();
      mesh.setMatrixAt(index++, dummy.matrix);
    }
  });
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);
  root.userData.chroniclesFloorDetailProfile = CHRONICLES_TACTICS_FLOOR_DETAIL_STYLE.profile;
  root.userData.chroniclesFloorDetailCount = count;
  scene.add(root);
  return root;
}
