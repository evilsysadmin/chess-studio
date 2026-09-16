import * as THREE from 'three';
import { createChroniclesStoneSurfaceTexture } from './chroniclesStoneSurfaceTexture.js';

export const CHRONICLES_TACTICS_WET_STONE_STYLE = Object.freeze({
  motif: 'wet-stone',
  desktopPatchCount: 8,
  coarsePatchCount: 4,
  opacity: 0.2,
  coarseOpacity: 0.14,
});

export const CHRONICLES_TACTICS_WET_PATCHES = Object.freeze([
  Object.freeze({ x: -4.8, z: 3.1, sx: 1.2, sz: 0.46, yaw: 0.12 }),
  Object.freeze({ x: -2.45, z: 2.25, sx: 0.9, sz: 0.38, yaw: -0.24 }),
  Object.freeze({ x: 0.2, z: 3.45, sx: 1.1, sz: 0.42, yaw: 0.2 }),
  Object.freeze({ x: 3.65, z: 2.3, sx: 0.82, sz: 0.34, yaw: -0.18 }),
  Object.freeze({ x: -3.55, z: -0.55, sx: 1.0, sz: 0.36, yaw: 0.34 }),
  Object.freeze({ x: -0.65, z: -1.4, sx: 1.28, sz: 0.45, yaw: -0.08 }),
  Object.freeze({ x: 2.9, z: -2.3, sx: 1.0, sz: 0.38, yaw: 0.23 }),
  Object.freeze({ x: 0.75, z: -4.15, sx: 0.86, sz: 0.32, yaw: -0.31 }),
]);

function ownedMaterial(params) {
  const material = new THREE.MeshStandardMaterial(params);
  material.userData.chroniclesIsoOwned = true;
  return material;
}

function patchGeometry(coarsePointer) {
  return new THREE.CircleGeometry(1, coarsePointer ? 12 : 20);
}

export function installChroniclesTacticsWetStone(scene, { coarsePointer = false } = {}) {
  if (!scene?.add) return null;
  const existing = scene.getObjectByName?.('chronicles-wet-stone');
  if (existing) return existing;

  const root = new THREE.Group();
  root.name = 'chronicles-wet-stone';
  const surfaceTexture = createChroniclesStoneSurfaceTexture({ coarsePointer, seed: 19, wet: true });
  root.userData.chroniclesArtCancel = () => surfaceTexture.dispose();

  const sheen = ownedMaterial({
    color: 0x586671,
    map: surfaceTexture,
    roughness: coarsePointer ? 0.3 : 0.18,
    metalness: coarsePointer ? 0.08 : 0.16,
    transparent: true,
    opacity: coarsePointer
      ? CHRONICLES_TACTICS_WET_STONE_STYLE.coarseOpacity
      : CHRONICLES_TACTICS_WET_STONE_STYLE.opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  sheen.polygonOffset = true;
  sheen.polygonOffsetFactor = -1;
  sheen.polygonOffsetUnits = -1;

  const geometry = patchGeometry(coarsePointer);
  const patches = coarsePointer
    ? CHRONICLES_TACTICS_WET_PATCHES.filter((_, index) => index % 2 === 0)
    : CHRONICLES_TACTICS_WET_PATCHES;

  patches.forEach((patch, index) => {
    const puddle = new THREE.Mesh(geometry, sheen);
    puddle.name = `chronicles-wet-stone-patch-${index}`;
    puddle.position.set(patch.x, 0.012 + index * 0.00015, patch.z);
    puddle.rotation.x = -Math.PI / 2;
    puddle.rotation.z = patch.yaw;
    puddle.scale.set(patch.sx, patch.sz, 1);
    puddle.castShadow = false;
    puddle.receiveShadow = true;
    puddle.renderOrder = 2;
    root.add(puddle);
  });

  scene.add(root);
  return root;
}
