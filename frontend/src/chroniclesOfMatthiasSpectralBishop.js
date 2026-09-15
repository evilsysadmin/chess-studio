import * as THREE from 'three';

function material(color, options = {}) {
  const result = new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.04,
    roughness: options.roughness ?? 0.48,
    clearcoat: options.clearcoat ?? 0.08,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.45,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    depthWrite: options.depthWrite ?? true,
  });
  result.userData.chroniclesOwnedMaterial = true;
  return result;
}

function add(group, geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0], scale = null, name = '') {
  const node = new THREE.Mesh(geometry, mat);
  node.position.set(...position);
  node.rotation.set(...rotation);
  if (scale) node.scale.set(...scale);
  if (name) node.name = name;
  node.castShadow = false;
  node.receiveShadow = true;
  group.add(node);
  return node;
}

export function buildSpectralBishop({ coarsePointer = false } = {}) {
  const segments = coarsePointer ? 16 : 28;
  const root = new THREE.Group();
  root.name = 'chronicles-spectral-bishop';

  const ghost = material(0x728b86, { roughness: 0.34, transparent: true, opacity: 0.82, depthWrite: false });
  const grave = material(0x313936, { roughness: 0.82, metalness: 0.12 });
  const silver = material(0x8e9c98, { metalness: 0.62, roughness: 0.3 });
  const glow = material(0xa8e7d3, {
    roughness: 0.22,
    emissive: 0x35d6a5,
    emissiveIntensity: 2.35,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const faintGlow = material(0x6fcdb5, {
    roughness: 0.35,
    emissive: 0x1f9878,
    emissiveIntensity: coarsePointer ? 0.7 : 1.05,
    transparent: true,
    opacity: coarsePointer ? 0.34 : 0.42,
    depthWrite: false,
  });
  const voidMat = material(0x07100f, { roughness: 0.9 });

  add(root, new THREE.CylinderGeometry(0.64, 0.78, 0.16, segments), grave, [0, 0.08, 0], [0, 0, 0], null, 'spectral-bishop-plinth');
  add(root, new THREE.TorusGeometry(0.56, 0.035, 7, segments), silver, [0, 0.18, 0], [Math.PI / 2, 0, 0], null, 'spectral-bishop-plinth-ring');
  add(root, new THREE.ConeGeometry(0.46, 1.28, segments, 1, true), ghost, [0, 0.82, 0], [0, 0, 0], null, 'spectral-bishop-robe');
  add(root, new THREE.TorusGeometry(0.33, 0.04, 7, segments), silver, [0, 1.18, 0], [Math.PI / 2, 0, 0], null, 'spectral-bishop-collar');

  add(root, new THREE.SphereGeometry(0.24, segments, Math.max(10, Math.floor(segments / 2))), ghost, [0, 1.43, 0], [0, 0, 0], [0.92, 1.02, 0.88], 'spectral-bishop-head');
  add(root, new THREE.TorusGeometry(0.34, 0.025, 8, segments), faintGlow, [0, 1.46, -0.055], [0, 0, 0], null, 'spectral-bishop-head-halo');
  add(root, new THREE.SphereGeometry(0.037, 10, 7), glow, [-0.075, 1.46, 0.205], [0, 0, 0], [1.2, 0.55, 0.35], 'spectral-bishop-eye-left');
  add(root, new THREE.SphereGeometry(0.037, 10, 7), glow, [0.075, 1.46, 0.205], [0, 0, 0], [1.2, 0.55, 0.35], 'spectral-bishop-eye-right');
  add(root, new THREE.OctahedronGeometry(0.12, 0), glow, [0, 1.06, 0.3], [0, 0, Math.PI / 4], null, 'spectral-bishop-chest-core');

  add(root, new THREE.ConeGeometry(0.31, 0.66, segments), grave, [0, 1.92, 0], [0, 0, 0], null, 'spectral-bishop-mitre');
  add(root, new THREE.BoxGeometry(0.045, 0.5, 0.05), glow, [0, 1.93, 0.25], [0, 0, 0.5], null, 'spectral-bishop-diagonal-rift');
  add(root, new THREE.BoxGeometry(0.055, 0.38, 0.045), voidMat, [0.012, 1.95, 0.268], [0, 0, 0.5], null, 'spectral-bishop-mitre-split');

  add(root, new THREE.CylinderGeometry(0.035, 0.045, 1.12, 8), silver, [-0.46, 0.93, 0.04], [0.05, 0, -0.18], null, 'spectral-bishop-staff');
  add(root, new THREE.TorusGeometry(0.2, 0.035, 8, segments), silver, [-0.55, 1.48, 0.06], [Math.PI / 2, 0, 0], null, 'spectral-bishop-crozier');
  add(root, new THREE.OctahedronGeometry(0.13, 0), glow, [-0.55, 1.48, 0.07], [0, 0, Math.PI / 4], null, 'spectral-bishop-lantern-core');

  [-1, 1].forEach((side) => {
    add(root, new THREE.ConeGeometry(0.09, 0.46, 8), faintGlow, [side * 0.33, 1.2, -0.02], [0, 0, side * -0.28], null, side < 0 ? 'spectral-bishop-wisp-left' : 'spectral-bishop-wisp-right');
  });

  const diagonalCount = coarsePointer ? 2 : 4;
  for (let i = 0; i < diagonalCount; i += 1) {
    add(root, new THREE.BoxGeometry(0.48 - i * 0.05, 0.025, 0.025), glow, [0.17, 0.62 + i * 0.19, 0.37], [0, 0, -0.72], null, `spectral-bishop-robe-rift-${i}`);
  }

  root.userData.chroniclesGlowMaterials = [glow];
  root.userData.chroniclesBaseGlow = 2.35;
  root.userData.chroniclesSilhouette = 'spectral-bishop-diagonal-seer';
  root.userData.chroniclesArtTier = 'premium-threat-v2';
  root.userData.chroniclesEnemyId = 'spectral-bishop';
  return root;
}

export function buildSpectralChapel({ coarsePointer = false } = {}) {
  const segments = coarsePointer ? 12 : 22;
  const root = new THREE.Group();
  root.name = 'chronicles-spectral-chapel';

  const stone = material(0x252d2b, { roughness: 0.88, metalness: 0.08 });
  const silver = material(0x6e7e79, { metalness: 0.58, roughness: 0.36 });
  const glow = material(0x79c9b3, {
    roughness: 0.25,
    emissive: 0x2a9f7f,
    emissiveIntensity: 0.18,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });

  add(root, new THREE.BoxGeometry(0.62, 0.7, 1.5), stone, [1.42, 0.35, 0], [0, 0, 0], null, 'spectral-chapel-altar');
  add(root, new THREE.BoxGeometry(0.78, 0.12, 1.7), silver, [1.36, 0.74, 0], [0, 0, 0], null, 'spectral-chapel-altar-slab');
  add(root, new THREE.TorusGeometry(0.45, 0.045, 7, segments), silver, [1.66, 1.54, 0], [0, Math.PI / 2, 0], null, 'spectral-chapel-wall-halo');
  add(root, new THREE.OctahedronGeometry(0.17, 0), glow, [1.58, 1.54, 0], [0, 0, Math.PI / 4], null, 'spectral-chapel-reliquary');

  [-0.5, 0.5].forEach((z, index) => {
    add(root, new THREE.CylinderGeometry(0.055, 0.08, 0.58, 8), silver, [1.04, 1.02, z], [0, 0, 0], null, `spectral-chapel-candle-${index}`);
    add(root, new THREE.SphereGeometry(0.075, 8, 6), glow, [1.04, 1.34, z], [0, 0, 0], [0.8, 1.5, 0.8], `spectral-chapel-flame-${index}`);
  });

  const inlayCount = coarsePointer ? 2 : 4;
  for (let i = 0; i < inlayCount; i += 1) {
    add(root, new THREE.BoxGeometry(1.25, 0.018, 0.035), glow, [-0.34 + i * 0.2, 0.018, -0.58 + i * 0.38], [0, -0.68, 0], null, `spectral-chapel-diagonal-inlay-${i}`);
  }

  const light = new THREE.PointLight(0x55d9b4, 0.08, coarsePointer ? 5 : 7, 2);
  light.position.set(0.7, 1.5, 0);
  root.add(light);

  root.userData.chroniclesGlowMaterials = [glow];
  root.userData.chroniclesLights = [light];
  root.userData.chroniclesSilhouette = 'side-chapel-diagonal-reliquary';
  return root;
}
