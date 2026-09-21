import * as THREE from 'three';
import { CHRONICLES_ISOMETRIC_CELL_SIZE } from './chronicles/chroniclesIsometricDungeonPlan.js';
import { chroniclesIsometricScenePlan } from './chronicles/chroniclesIsometricScenePlan.js';
import { createChroniclesStoneSurfaceTexture } from './chroniclesStoneSurfaceTexture.js';

const ROOT_NAME = 'chronicles-tactics-architecture-depth';
const CELL = CHRONICLES_ISOMETRIC_CELL_SIZE;
const WALL_NAME = /^chronicles-iso-wall-(\d+)-(\d+)$/;
const MASONRY_COURSES = 4;
const MASONRY_BLOCKS_PER_COURSE = 3;
const MASONRY_TRIM_BLOCKS = 2;

export const CHRONICLES_TACTICS_MASONRY_BLOCKS_PER_WALL = (
  MASONRY_COURSES * MASONRY_BLOCKS_PER_COURSE
) + MASONRY_TRIM_BLOCKS;

export const CHRONICLES_TACTICS_ARCHES = Object.freeze([
  Object.freeze({ x: 1, y: 3, yaw: 0 }),
  Object.freeze({ x: 5, y: 3, yaw: 0 }),
]);

export const CHRONICLES_TACTICS_MASONRY_STYLE = Object.freeze({
  profile: 'coursed-block-face-v2',
  courseCount: MASONRY_COURSES,
  blocksPerCourse: MASONRY_BLOCKS_PER_COURSE,
  blockWidth: 0.72,
  blockHeight: 0.48,
  faceDepth: 0.17,
});

const SIDES = Object.freeze([
  Object.freeze({ key: 'east', dx: 1, dy: 0, nx: 1, nz: 0, tx: 0, tz: 1, yaw: Math.PI / 2 }),
  Object.freeze({ key: 'south', dx: 0, dy: 1, nx: 0, nz: 1, tx: 1, tz: 0, yaw: 0 }),
  Object.freeze({ key: 'west', dx: -1, dy: 0, nx: -1, nz: 0, tx: 0, tz: 1, yaw: Math.PI / 2 }),
  Object.freeze({ key: 'north', dx: 0, dy: -1, nx: 0, nz: -1, tx: 1, tz: 0, yaw: 0 }),
]);

function deterministicNoise(x, y, salt = 0) {
  const value = Math.sin((x + 17.31 + salt) * 12.9898 + (y - 9.17 - salt) * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function chroniclesTacticsExposedWallSides(
  x,
  y,
  scenePlan = chroniclesIsometricScenePlan(),
) {
  return Object.freeze(SIDES.filter((side) => (scenePlan?.wallFaces || []).some((face) => (
    face.x === x && face.y === y && face.side === side.key
  ))));
}

export function chroniclesTacticsExposedWallSide(
  x,
  y,
  scenePlan = chroniclesIsometricScenePlan(),
) {
  return chroniclesTacticsExposedWallSides(x, y, scenePlan)[0] || null;
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
    chroniclesTacticsExposedWallSides(x, y, scenePlan).forEach((side) => {
      cells.push({ x, y, side, wall: object });
    });
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

function colorForBlock(baseColor, x, y, course, block) {
  const noise = deterministicNoise(x * 11 + block, y * 7 + course, 43);
  const color = baseColor.clone();
  color.offsetHSL(
    (noise - 0.5) * 0.012,
    (noise - 0.5) * 0.055,
    (noise - 0.5) * 0.11,
  );
  return color;
}

function buildMasonryInstances(root, wallCells, material, { coarsePointer }) {
  const archSupportCount = CHRONICLES_TACTICS_ARCHES.length * 2;
  const instanceCount = wallCells.length * CHRONICLES_TACTICS_MASONRY_BLOCKS_PER_WALL + archSupportCount;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, instanceCount);
  mesh.name = 'chronicles-tactics-masonry-instances';
  mesh.castShadow = false;
  mesh.receiveShadow = !coarsePointer;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  const baseColor = new THREE.Color(material.color);
  const dummy = new THREE.Object3D();
  let index = 0;

  wallCells.forEach(({ x, y, wall, side }) => {
    const faceX = wall.position.x + side.nx * (CELL * 0.5 + 0.075);
    const faceZ = wall.position.z + side.nz * (CELL * 0.5 + 0.075);

    for (let course = 0; course < MASONRY_COURSES; course += 1) {
      const courseY = 0.38 + course * 0.52;
      const stagger = course % 2 ? 0.12 : 0;
      for (let block = 0; block < MASONRY_BLOCKS_PER_COURSE; block += 1) {
        const jitter = (deterministicNoise(x + block, y + course, 19) - 0.5) * 0.045;
        const tangentOffset = (block - 1) * 0.76 + stagger;
        setBox(mesh, index, dummy, {
          x: faceX + side.tx * tangentOffset + side.nx * jitter,
          y: courseY + (deterministicNoise(x, y, course + block) - 0.5) * 0.025,
          z: faceZ + side.tz * tangentOffset + side.nz * jitter,
          sx: CHRONICLES_TACTICS_MASONRY_STYLE.blockWidth
            + (deterministicNoise(x, y, block + 61) - 0.5) * 0.06,
          sy: CHRONICLES_TACTICS_MASONRY_STYLE.blockHeight,
          sz: CHRONICLES_TACTICS_MASONRY_STYLE.faceDepth,
          yaw: side.yaw,
        });
        mesh.setColorAt(index, colorForBlock(baseColor, x, y, course, block));
        index += 1;
      }
    }

    setBox(mesh, index, dummy, {
      x: faceX,
      y: 0.1,
      z: faceZ,
      sx: 1.2,
      sy: 0.2,
      sz: 0.26,
      yaw: side.yaw,
    });
    mesh.setColorAt(index, baseColor.clone().offsetHSL(0, -0.015, -0.075));
    index += 1;

    setBox(mesh, index, dummy, {
      x: faceX,
      y: 2.43,
      z: faceZ,
      sx: 1.16,
      sy: 0.16,
      sz: 0.24,
      yaw: side.yaw,
    });
    mesh.setColorAt(index, baseColor.clone().offsetHSL(0, -0.01, 0.035));
    index += 1;
  });

  CHRONICLES_TACTICS_ARCHES.forEach((arch) => {
    const world = worldForCell(arch.x, arch.y, root.userData.chroniclesSceneCenter);
    const dx = Math.cos(arch.yaw) * 1.03;
    const dz = -Math.sin(arch.yaw) * 1.03;
    [-1, 1].forEach((sign) => {
      setBox(mesh, index, dummy, {
        x: world.x + dx * sign,
        y: 0.52,
        z: world.z + dz * sign,
        sx: 0.24,
        sy: 1.04,
        sz: 0.28,
        yaw: arch.yaw,
      });
      mesh.setColorAt(index, baseColor.clone().offsetHSL(0, 0.01, -0.035));
      index += 1;
    });
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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

  const surfaceTexture = createChroniclesStoneSurfaceTexture({
    coarsePointer,
    seed: scenePlan?.mapId === 'menagerie-of-ash' ? 67 : scenePlan?.mapId === 'gallery-of-forks' ? 53 : 31,
    wet: false,
  });
  const wallColor = scenePlan?.sceneStyle?.palette?.wall?.[0] ?? 0x3b342e;
  const material = new THREE.MeshStandardMaterial({
    color: wallColor,
    map: surfaceTexture,
    roughness: 0.9,
    metalness: 0.025,
    vertexColors: true,
  });
  material.userData.chroniclesIsoOwned = true;

  const wallCells = chroniclesTacticsArchitectureWallCells(scene, scenePlan);
  const masonry = buildMasonryInstances(root, wallCells, material, { coarsePointer });
  const arches = buildArchInstances(root, material);

  root.userData.chroniclesArtCancel = () => surfaceTexture.dispose();
  root.userData.chroniclesArchitectureWallCount = wallCells.length;
  root.userData.chroniclesArchitectureDrawGroups = 2;
  root.userData.chroniclesArchitectureMasonry = masonry;
  root.userData.chroniclesArchitectureArches = arches;
  root.userData.chroniclesArchitectureMasonryProfile = CHRONICLES_TACTICS_MASONRY_STYLE.profile;
  root.userData.chroniclesArchitectureInstanceCount = masonry.count;
  return root;
}
