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
  const segments = coarsePointer ? 14 : 26;
  const root = new THREE.Group();
  root.name = 'chronicles-spectral-bishop';

  const robe = material(0x27312f, { roughness: 0.7, transparent: true, opacity: 0.9, depthWrite: false });
  const spectral = material(0x84a9a2, { roughness: 0.28, transparent: true, opacity: 0.56, depthWrite: false });
  const darkMetal = material(0x323a3a, { roughness: 0.46, metalness: 0.58 });
  const silver = material(0x99aaa5, { metalness: 0.72, roughness: 0.26 });
  const glow = material(0xaef6dd, {
    roughness: 0.18,
    emissive: 0x3adbb0,
    emissiveIntensity: 2.55,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const faintGlow = material(0x70d8bc, {
    roughness: 0.3,
    emissive: 0x218f78,
    emissiveIntensity: coarsePointer ? 0.7 : 1.05,
    transparent: true,
    opacity: coarsePointer ? 0.25 : 0.34,
    depthWrite: false,
  });
  const voidMat = material(0x030807, { roughness: 0.96 });

  const robeGroup = new THREE.Group();
  robeGroup.name = 'spectral-bishop-robe';
  root.add(robeGroup);
  add(robeGroup, new THREE.ConeGeometry(0.53, 1.48, segments, 1, true), robe, [0, 0.78, 0], [0, 0, 0], null, 'spectral-bishop-outer-robe');
  add(robeGroup, new THREE.ConeGeometry(0.43, 1.34, segments, 1, true), spectral, [0, 0.79, -0.035], [0, 0, 0], null, 'spectral-bishop-inner-vapour');
  add(robeGroup, new THREE.TorusGeometry(0.34, 0.055, 8, segments), silver, [0, 1.2, 0], [Math.PI / 2, 0, 0], null, 'spectral-bishop-collar');
  add(robeGroup, new THREE.BoxGeometry(0.13, 0.86, 0.035), darkMetal, [0, 0.75, 0.43], [0, 0, 0], null, 'spectral-bishop-stole');
  add(robeGroup, new THREE.BoxGeometry(0.06, 0.62, 0.025), glow, [0, 0.78, 0.455], [0, 0, 0], null, 'spectral-bishop-stole-rune');

  // Shoulder mantle and sleeves connect the caster into one readable body.
  add(root, new THREE.SphereGeometry(0.37, segments, Math.max(10, Math.floor(segments * 0.5))), darkMetal, [0, 1.18, 0], [0, 0, 0], [1.18, 0.46, 0.86], 'spectral-bishop-mantle');
  add(root, new THREE.CapsuleGeometry(0.09, 0.38, 5, Math.max(8, segments)), robe, [-0.36, 1.04, 0.02], [0, 0, -0.38], [1, 1, 0.9], 'spectral-bishop-sleeve-left');
  add(root, new THREE.CapsuleGeometry(0.09, 0.38, 5, Math.max(8, segments)), robe, [0.36, 1.04, 0.02], [0, 0, 0.38], [1, 1, 0.9], 'spectral-bishop-sleeve-right');
  add(root, new THREE.SphereGeometry(0.075, 10, 7), spectral, [-0.46, 0.82, 0.08], [0, 0, 0], [0.8, 1.25, 0.7], 'spectral-bishop-hand-left');
  add(root, new THREE.SphereGeometry(0.075, 10, 7), spectral, [0.46, 0.82, 0.08], [0, 0, 0], [0.8, 1.25, 0.7], 'spectral-bishop-hand-right');

  const head = new THREE.Group();
  head.position.set(0, 1.48, 0);
  root.add(head);
  add(head, new THREE.SphereGeometry(0.215, segments, Math.max(10, Math.floor(segments / 2))), voidMat, [0, 0, 0], [0, 0, 0], [0.9, 1.05, 0.82], 'spectral-bishop-void-face');
  add(head, new THREE.BoxGeometry(0.22, 0.035, 0.022), glow, [0, 0.005, 0.19], [0, 0, 0], null, 'spectral-bishop-eye-slit');
  add(root, new THREE.TorusGeometry(0.32, 0.026, 8, segments), faintGlow, [0, 1.5, -0.06], [0, 0, 0], null, 'spectral-bishop-head-halo');

  // Tall split mitre with armoured shell rather than a single cone.
  add(root, new THREE.ConeGeometry(0.29, 0.72, segments), darkMetal, [0, 1.95, 0], [0, 0, 0], [0.86, 1, 0.76], 'spectral-bishop-mitre');
  add(root, new THREE.BoxGeometry(0.045, 0.56, 0.045), voidMat, [0, 1.96, 0.215], [0, 0, 0.45], null, 'spectral-bishop-mitre-split');
  add(root, new THREE.BoxGeometry(0.035, 0.5, 0.028), glow, [0.025, 1.96, 0.242], [0, 0, 0.45], null, 'spectral-bishop-diagonal-rift');

  // Crozier gets a larger circular head and cross-spine, closer to the approved concept.
  add(root, new THREE.CylinderGeometry(0.032, 0.042, 1.42, 8), silver, [-0.53, 0.93, 0.02], [0.04, 0, -0.08], null, 'spectral-bishop-staff');
  add(root, new THREE.TorusGeometry(0.23, 0.03, 8, segments), silver, [-0.59, 1.62, 0.045], [Math.PI / 2, 0, 0], null, 'spectral-bishop-crozier');
  add(root, new THREE.BoxGeometry(0.38, 0.035, 0.035), silver, [-0.59, 1.62, 0.045], [0, 0, Math.PI / 4], null, 'spectral-bishop-crozier-cross');
  add(root, new THREE.OctahedronGeometry(0.12, 0), glow, [-0.59, 1.62, 0.05], [0, 0, Math.PI / 4], null, 'spectral-bishop-lantern-core');

  // Wisps wrap around the silhouette instead of reading as detached cones.
  [-1, 1].forEach((side) => {
    const wisp = add(root, new THREE.TorusGeometry(0.28, 0.025, 6, segments), faintGlow,
      [side * 0.24, 0.82, -0.02], [Math.PI / 2.4, side * 0.45, side * 0.25], [0.78, 1.25, 1],
      side < 0 ? 'spectral-bishop-wisp-left' : 'spectral-bishop-wisp-right');
    wisp.material.opacity *= 0.9;
  });

  root.position.y = 0.11;
  root.userData.chroniclesGlowMaterials = [glow];
  root.userData.chroniclesBaseGlow = 2.55;
  root.userData.chroniclesSilhouette = 'spectral-bishop-armoured-wraith';
  root.userData.chroniclesArtTier = 'premium-threat-v3';
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
