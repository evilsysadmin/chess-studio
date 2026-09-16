import * as THREE from 'three';
import { createChroniclesStoneSurfaceTexture } from './chroniclesStoneSurfaceTexture.js';

export const CHRONICLES_TACTICS_WEATHERING_STYLE = Object.freeze({
  motif: 'perimeter-weathering',
  desktopPieceCount: 12,
  coarsePieceCount: 6,
});

export const CHRONICLES_TACTICS_WEATHERING_PLAN = Object.freeze([
  Object.freeze({ kind: 'chip', x: -6.15, z: 3.75, sx: 0.34, sy: 0.12, sz: 0.22, yaw: 0.42 }),
  Object.freeze({ kind: 'slab', x: -5.82, z: 1.1, sx: 0.56, sy: 0.08, sz: 0.19, yaw: -0.18 }),
  Object.freeze({ kind: 'chip', x: -6.02, z: -1.75, sx: 0.28, sy: 0.1, sz: 0.25, yaw: 0.86 }),
  Object.freeze({ kind: 'slab', x: -5.65, z: -4.35, sx: 0.48, sy: 0.07, sz: 0.16, yaw: 0.23 }),
  Object.freeze({ kind: 'chip', x: 6.08, z: 3.35, sx: 0.31, sy: 0.11, sz: 0.23, yaw: -0.51 }),
  Object.freeze({ kind: 'slab', x: 5.76, z: 0.9, sx: 0.52, sy: 0.08, sz: 0.18, yaw: 0.14 }),
  Object.freeze({ kind: 'chip', x: 6.14, z: -2.05, sx: 0.3, sy: 0.12, sz: 0.2, yaw: -0.74 }),
  Object.freeze({ kind: 'slab', x: 5.7, z: -4.5, sx: 0.5, sy: 0.07, sz: 0.17, yaw: -0.21 }),
  Object.freeze({ kind: 'chip', x: -4.45, z: -6.05, sx: 0.26, sy: 0.1, sz: 0.22, yaw: 0.36 }),
  Object.freeze({ kind: 'slab', x: -1.85, z: -5.92, sx: 0.44, sy: 0.07, sz: 0.16, yaw: -0.15 }),
  Object.freeze({ kind: 'chip', x: 1.55, z: -6.08, sx: 0.28, sy: 0.1, sz: 0.2, yaw: 0.67 }),
  Object.freeze({ kind: 'slab', x: 4.15, z: -5.88, sx: 0.46, sy: 0.07, sz: 0.17, yaw: 0.19 }),
]);

function ownedMaterial(params) {
  const material = new THREE.MeshStandardMaterial(params);
  material.userData.chroniclesIsoOwned = true;
  return material;
}

function buildPiece(piece, index, material, coarsePointer) {
  const geometry = piece.kind === 'chip'
    ? new THREE.DodecahedronGeometry(1, 0)
    : new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `chronicles-weathering-${piece.kind}-${index}`;
  mesh.position.set(piece.x, piece.sy * 0.42 - 0.005, piece.z);
  mesh.rotation.set(piece.kind === 'chip' ? piece.yaw * 0.18 : 0, piece.yaw, piece.kind === 'chip' ? piece.yaw * 0.11 : 0);
  mesh.scale.set(piece.sx, piece.sy, piece.sz);
  mesh.castShadow = !coarsePointer;
  mesh.receiveShadow = true;
  return mesh;
}

export function installChroniclesTacticsStoneWeathering(scene, { coarsePointer = false } = {}) {
  if (!scene?.add) return null;
  const existing = scene.getObjectByName?.('chronicles-stone-weathering');
  if (existing) return existing;

  const root = new THREE.Group();
  root.name = 'chronicles-stone-weathering';
  const surfaceTexture = createChroniclesStoneSurfaceTexture({ coarsePointer, seed: 41, wet: false });
  root.userData.chroniclesArtCancel = () => surfaceTexture.dispose();

  const stone = ownedMaterial({
    color: 0x393632,
    map: surfaceTexture,
    roughness: 0.97,
    metalness: 0.01,
  });
  const pieces = coarsePointer
    ? CHRONICLES_TACTICS_WEATHERING_PLAN.filter((_, index) => index % 2 === 0)
    : CHRONICLES_TACTICS_WEATHERING_PLAN;

  pieces.forEach((piece, index) => {
    root.add(buildPiece(piece, index, stone, coarsePointer));
  });

  scene.add(root);
  return root;
}
