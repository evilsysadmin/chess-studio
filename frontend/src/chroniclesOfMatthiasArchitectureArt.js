import * as THREE from 'three';
import { chroniclesIsometricScenePlan } from './chronicles/chroniclesIsometricScenePlan.js';

const ROOT_NAME = 'chronicles-tactics-architecture-depth';
const CELL = 2.45;
const WALL_NAME = /^chronicles-iso-wall-(\d+)-(\d+)$/;

export const CHRONICLES_TACTICS_ARCHES = Object.freeze([
  Object.freeze({ x: 1, y: 3, yaw: 0 }),
  Object.freeze({ x: 5, y: 3, yaw: 0 }),
]);

const SIDES = Object.freeze([
  Object.freeze({ key: 'east', dx: 1, dy: 0, nx: 1, nz: 0, yaw: Math.PI / 2 }),
  Object.freeze({ key: 'south', dx: 0, dy: 1, nx: 0, nz: 1, yaw: 0 }),
  Object.freeze({ key: 'west', dx: -1, dy: 0, nx: -1, nz: 0, yaw: Math.PI / 2 }),
  Object.freeze({ key: 'north', dx: 0, dy: -1, nx: 0, nz: -1, yaw: 0 }),
]);

export function chroniclesTacticsExposedWallSide(
  x,
  y,
  scenePlan = chroniclesIsometricScenePlan(),
) {
  return SIDES.find((side) => (scenePlan?.wallFaces || []).some((face) => (
    face.x === x && face.y === y && face.side === side.key
  ))) || null;
}

export function chroniclesTacticsArchitectureWallCells(
  scene,
  scenePlan = chroniclesIsometricScenePlan(),
) {
  const cells = [];
  scene?.traverse?.((object) => {
    const match = WALL_NAME.exec(String(object.name || ''));
    if (!match || object.userData?.chroniclesTacticsCutaway || object.visible === false) return;
    const height = Number(object.geometry?.parameters?.height || 0);
    if (height && height < 1.8) return;
    const x = Number(match[1]);
    const y = Number(match[2]);
    const side = chroniclesTacticsExposedWallSide(x, y, scenePlan);
    if (side) cells.push({ x, y, side, wall: object });
  });
  return cells;
}

function worldForCell(x, y, center = { x: 3, y: 3 }) {
  return { x: (x - center.x) * CELL, z: (y - center.y) * CELL };
}

function setBox(mesh, index, dummy, { x, y, z, sx, sy, sz, yaw = 0 }) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, yaw, 0);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function buildMasonryInstances(root, wallCells, material, { coarsePointer }) {
  const instanceCount = wallCells.length * 3 + CHRONICLES_TACTICS_ARCHES.length * 2;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, instanceCount);
  mesh.name = 'chronicles-tactics-masonry-instances';
  mesh.castShadow = false;
  mesh.receiveShadow = !coarsePointer;
  mesh.frustumCulled = false;

  const dummy = new THREE.Object3D();
  let index = 0;
  wallCells.forEach(({ wall, side }) => {
    const faceX = wall.position.x + side.nx * (CELL * 0.5 + 0.06);
    const faceZ = wall.position.z + side.nz * (CELL * 0.5 + 0.06);
    setBox(mesh, index++, dummy, {
      x: faceX, y: 1.1, z: faceZ,
      sx: 0.36, sy: 2.18, sz: 0.28, yaw: side.yaw,
    });
    setBox(mesh, index++, dummy, {
      x: faceX, y: 0.1, z: faceZ,
      sx: 1.28, sy: 0.2, sz: 0.43, yaw: side.yaw,
    });
    setBox(mesh, index++, dummy, {
      x: faceX, y: 2.36, z: faceZ,
      sx: 0.78, sy: 0.16, sz: 0.48, yaw: side.yaw,
    });
  });

  CHRONICLES_TACTICS_ARCHES.forEach((arch) => {
    const world = worldForCell(arch.x, arch.y, root.userData.chroniclesSceneCenter);
    const dx = Math.cos(arch.yaw) * 1.03;
    const dz = -Math.sin(arch.yaw) * 1.03;
    [-1, 1].forEach((sign) => {
      setBox(mesh, index++, dummy, {
        x: world.x + dx * sign,
        y: 0.52,
        z: world.z + dz * sign,
        sx: 0.24,
        sy: 1.04,
        sz: 0.28,
        yaw: arch.yaw,
      });
    });
  });

  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);
  return mesh;
}

function buildArchInstances(root, material) {
  const geometry = new THREE.TorusGeometry(1.03, 0.13, 8, 24, Math.PI);
  const mesh = new THREE.InstancedMesh(geometry, material, CHRONICLES_TACTICS_ARCHES.length);
  mesh.name = 'chronicles-tactics-arch-instances';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;

  const dummy = new THREE.Object3D();
  CHRONICLES_TACTICS_ARCHES.forEach((arch, index) => {
    const world = worldForCell(arch.x, arch.y, root.userData.chroniclesSceneCenter);
    dummy.position.set(world.x, 1.02, world.z);
    dummy.rotation.set(0, arch.yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);
  return mesh;
}

export function installChroniclesTacticsArchitectureArt(scene, {
  coarsePointer = false,
  scenePlan = chroniclesIsometricScenePlan(),
} = {}) {
  if (!scene?.add) return null;
  const existing = scene.getObjectByName(ROOT_NAME);
  if (existing) return existing;

  const root = new THREE.Group();
  root.name = ROOT_NAME;
  root.userData.chroniclesSceneCenter = scenePlan?.center || { x: 3, y: 3 };
  scene.add(root);

  const material = new THREE.MeshStandardMaterial({
    color: 0x332c25,
    roughness: 0.9,
    metalness: 0.025,
  });
  material.userData.chroniclesIsoOwned = true;

  const wallCells = chroniclesTacticsArchitectureWallCells(scene, scenePlan);
  const masonry = buildMasonryInstances(root, wallCells, material, { coarsePointer });
  const arches = buildArchInstances(root, material);
  root.userData.chroniclesArchitectureWallCount = wallCells.length;
  root.userData.chroniclesArchitectureDrawGroups = 2;
  root.userData.chroniclesArchitectureMasonry = masonry;
  root.userData.chroniclesArchitectureArches = arches;
  return root;
}
