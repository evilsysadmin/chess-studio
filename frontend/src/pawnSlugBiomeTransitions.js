import * as THREE from 'three';

function material(color, roughness = 0.9, metalness = 0.04) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function mesh(geometry, mat, { x = 0, y = 0, z = 0, rz = 0 } = {}) {
  const node = new THREE.Mesh(geometry, mat);
  node.position.set(x, y, z);
  node.rotation.z = rz;
  node.castShadow = true;
  node.receiveShadow = true;
  return node;
}

function forestToRuins(coarse) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-transition-forest-ruins';
  root.position.set(27.2, 0, -2.35);
  const bark = material(0x31271e, 0.99);
  const stone = material(0x514d45, 0.97);
  root.add(
    mesh(new THREE.CylinderGeometry(0.14, 0.23, 2.15, coarse ? 6 : 9), bark, { x: -1.55, y: 0.18, z: 0.7, rz: 1.38 }),
    mesh(new THREE.BoxGeometry(1.45, 0.3, 0.8), stone, { x: -0.3, y: 0.18, z: 0.52, rz: -0.08 }),
    mesh(new THREE.BoxGeometry(0.85, 0.52, 0.75), stone, { x: 0.95, y: 0.27, z: 0.42, rz: 0.11 }),
  );
  if (!coarse) {
    root.add(
      mesh(new THREE.CylinderGeometry(0.11, 0.18, 1.65, 8), bark, { x: 1.8, y: 0.14, z: 0.55, rz: 1.47 }),
      mesh(new THREE.BoxGeometry(0.42, 1.35, 0.5), stone, { x: 2.45, y: 0.68, z: 0.15, rz: -0.13 }),
    );
  }
  return root;
}

function ruinsToDungeon(coarse) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-transition-ruins-dungeon';
  root.position.set(41.7, 0, -2.4);
  const stone = material(0x3d3d3b, 0.96);
  const iron = material(0x252a2e, 0.58, 0.52);
  root.add(
    mesh(new THREE.BoxGeometry(0.52, 2.9, 0.8), stone, { x: -1.55, y: 1.45, z: 0.22, rz: 0.05 }),
    mesh(new THREE.BoxGeometry(1.6, 0.28, 0.74), stone, { x: -0.75, y: 0.18, z: 0.55, rz: -0.05 }),
    mesh(new THREE.BoxGeometry(0.09, 2.45, 0.14), iron, { x: 0.72, y: 1.22, z: 0.82, rz: -0.04 }),
  );
  if (!coarse) {
    root.add(
      mesh(new THREE.BoxGeometry(0.09, 2.2, 0.14), iron, { x: 1.15, y: 1.1, z: 0.82, rz: 0.035 }),
      mesh(new THREE.BoxGeometry(1.15, 0.12, 0.16), iron, { x: 0.93, y: 2.18, z: 0.82, rz: -0.03 }),
      mesh(new THREE.BoxGeometry(0.7, 0.46, 0.7), stone, { x: 1.95, y: 0.24, z: 0.5, rz: 0.16 }),
    );
  }
  return root;
}

export const PAWN_SLUG_BIOME_TRANSITION_META = Object.freeze([
  Object.freeze({ id: 'forest-ruins', x: 27.2 }),
  Object.freeze({ id: 'ruins-dungeon', x: 41.7 }),
]);

export function createPawnSlugBiomeTransitions({ coarse = false } = {}) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-biome-transitions';
  root.userData.visualOnly = true;
  root.userData.transitionCount = PAWN_SLUG_BIOME_TRANSITION_META.length;
  root.add(forestToRuins(coarse), ruinsToDungeon(coarse));
  return root;
}
