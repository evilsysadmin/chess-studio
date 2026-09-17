import * as THREE from 'three';
import { chroniclesIsometricScenePlan } from './chronicles/chroniclesIsometricScenePlan.js';

const CELL = 4;
const PATCH_TEXTURE_SIZE = 48;
const START_ROUTE_FLOOR = Object.freeze([
  [2, 5], [4, 5], [3, 5], [1, 5], [5, 5], [3, 4], [3, 3],
]);
const START_ROUTE_WALLS = Object.freeze([
  [2, 6, 'north'], [3, 6, 'north'], [4, 6, 'north'], [1, 6, 'north'], [5, 6, 'north'],
  [2, 4, 'south'], [4, 4, 'south'], [6, 5, 'west'], [0, 5, 'east'],
]);

function noise(index, salt) {
  let value = Math.imul(index + salt * 131, 374761393) ^ Math.imul(index * 19 + salt, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

function createPatinaMask(seed, { broken = false } = {}) {
  const data = new Uint8Array(PATCH_TEXTURE_SIZE * PATCH_TEXTURE_SIZE * 4);
  const center = (PATCH_TEXTURE_SIZE - 1) / 2;
  for (let y = 0; y < PATCH_TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < PATCH_TEXTURE_SIZE; x += 1) {
      const nx = (x - center) / (PATCH_TEXTURE_SIZE * 0.5);
      const ny = (y - center) / (PATCH_TEXTURE_SIZE * 0.5);
      const radial = Math.max(0, 1 - Math.sqrt(nx * nx * 0.78 + ny * ny * 1.18));
      const grain = noise(x + y * PATCH_TEXTURE_SIZE, seed);
      const veins = 0.78 + Math.sin((x * 0.41 + y * 0.27 + seed) * 0.9) * 0.12;
      const chipped = broken && ((x * 7 + y * 11 + seed * 5) % 29 < 4) ? 0.28 : 1;
      const mask = Math.max(0, Math.min(1, radial * radial * (0.72 + grain * 0.38) * veins * chipped));
      const value = Math.round(mask * 255);
      const offset = (y * PATCH_TEXTURE_SIZE + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, PATCH_TEXTURE_SIZE, PATCH_TEXTURE_SIZE, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function patinaMaterial(color, mask, options) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness: options.roughness,
    clearcoat: options.clearcoat ?? 0,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.5,
    transparent: true,
    opacity: options.opacity,
    depthWrite: false,
    alphaMap: mask,
    side: THREE.DoubleSide,
  });
}

function prioritize(items, anchors, keyForItem, keyForAnchor) {
  const rank = new Map(anchors.map((anchor, index) => [keyForAnchor(anchor), index]));
  return items
    .map((item, index) => ({ item, index, rank: rank.get(keyForItem(item)) }))
    .sort((a, b) => (a.rank ?? 1000 + a.index) - (b.rank ?? 1000 + b.index))
    .map(({ item }) => item);
}

function prioritizedWallFaces(scenePlan) {
  return prioritize(
    scenePlan?.wallFaces || [],
    START_ROUTE_WALLS,
    ({ x, y, side }) => `${x},${y},${side}`,
    ([x, y, side]) => `${x},${y},${side}`,
  );
}

function prioritizedFloorCells(scenePlan) {
  return prioritize(
    scenePlan?.floors || [],
    START_ROUTE_FLOOR,
    ({ x, y }) => `${x},${y}`,
    ([x, y]) => `${x},${y}`,
  );
}

function wallTransform({ x, y, side }, index, center) {
  const wx = (x - center.x) * CELL;
  const wz = (y - center.y) * CELL;
  const offset = CELL / 2 + 0.165;
  const yOffset = 0.82 + noise(index, 7) * 1.5;
  if (side === 'north') return { position: [wx, yOffset, wz - offset], rotationY: 0 };
  if (side === 'south') return { position: [wx, yOffset, wz + offset], rotationY: Math.PI };
  if (side === 'east') return { position: [wx + offset, yOffset, wz], rotationY: Math.PI / 2 };
  return { position: [wx - offset, yOffset, wz], rotationY: -Math.PI / 2 };
}

function addWallPatches(root, faces, materials, coarsePointer, center) {
  const budget = coarsePointer ? 4 : 9;
  const selected = faces.slice(0, budget);
  selected.forEach((face, index) => {
    const transform = wallTransform(face, index, center);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.96 + noise(index, 11) * 1.12, 0.68 + noise(index, 13) * 0.98),
      materials[index % materials.length],
    );
    mesh.name = `chronicles-wall-patina-${index}`;
    mesh.position.set(...transform.position);
    mesh.rotation.y = transform.rotationY;
    mesh.rotation.z = (noise(index, 17) - 0.5) * 0.22;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 2;
    root.add(mesh);
  });
  return selected.length;
}

function addFloorPatches(root, cells, material, coarsePointer, center) {
  const budget = coarsePointer ? 3 : 7;
  const selected = cells.slice(0, budget);
  selected.forEach((cell, index) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.08 + noise(index, 23) * 1.18, 0.7 + noise(index, 29) * 0.86),
      material,
    );
    mesh.name = `chronicles-floor-patina-${index}`;
    mesh.position.set(
      (cell.x - center.x) * CELL + (noise(index, 31) - 0.5) * 0.82,
      0.047,
      (cell.y - center.y) * CELL + (noise(index, 37) - 0.5) * 0.82,
    );
    mesh.rotation.set(-Math.PI / 2, 0, (noise(index, 41) - 0.5) * 1.7);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 2;
    root.add(mesh);
  });
  return selected.length;
}

export function buildChroniclesSurfacePatina({
  coarsePointer = false,
  scenePlan = chroniclesIsometricScenePlan(),
} = {}) {
  const root = new THREE.Group();
  root.name = 'chronicles-surface-patina';

  const dampMask = createPatinaMask(19);
  const mineralMask = createPatinaMask(43, { broken: true });
  const floorMask = createPatinaMask(71, { broken: true });
  const damp = patinaMaterial(0x172124, dampMask, {
    roughness: 0.34,
    clearcoat: 0.58,
    clearcoatRoughness: 0.22,
    opacity: coarsePointer ? 0.24 : 0.36,
  });
  const mineral = patinaMaterial(0x9a8b72, mineralMask, {
    roughness: 0.96,
    opacity: coarsePointer ? 0.14 : 0.23,
  });
  const floor = patinaMaterial(0x211b17, floorMask, {
    roughness: 0.66,
    clearcoat: 0.16,
    clearcoatRoughness: 0.44,
    opacity: coarsePointer ? 0.19 : 0.3,
  });

  let texturesDisposed = false;
  [damp, mineral, floor].forEach((material) => {
    material.addEventListener('dispose', () => {
      if (texturesDisposed) return;
      texturesDisposed = true;
      dampMask.dispose();
      mineralMask.dispose();
      floorMask.dispose();
    });
  });

  const center = scenePlan?.center || { x: 0, y: 0 };
  const wallPatchCount = addWallPatches(
    root,
    prioritizedWallFaces(scenePlan),
    [damp, mineral],
    coarsePointer,
    center,
  );
  const floorPatchCount = addFloorPatches(
    root,
    prioritizedFloorCells(scenePlan),
    floor,
    coarsePointer,
    center,
  );
  root.userData.chroniclesSurfacePatinaStats = {
    wallPatchCount,
    floorPatchCount,
    materialCount: 3,
  };
  return root;
}
