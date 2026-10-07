import * as THREE from 'three';

function mat(color, options = {}) {
  const material = new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.08,
    roughness: options.roughness ?? 0.58,
    clearcoat: options.clearcoat ?? 0.08,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.44,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
  material.userData.chroniclesOwnedMaterial = true;
  return material;
}

function add(group, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = null, name = '') {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  if (scale) mesh.scale.set(...scale);
  if (name) mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function capsule(group, radius, length, material, position, rotation = [0, 0, 0], scale = null, name = '', segments = 16) {
  return add(
    group,
    new THREE.CapsuleGeometry(radius, length, Math.max(4, Math.round(segments * 0.35)), Math.max(8, segments)),
    material,
    position,
    rotation,
    scale,
    name,
  );
}

export function buildScavengerKnight({ coarsePointer = false } = {}) {
  const segments = coarsePointer ? 14 : 24;
  const root = new THREE.Group();
  root.name = 'chronicles-scavenger-knight';

  const blackIron = mat(0x202428, { metalness: 0.7, roughness: 0.34 });
  const wornSteel = mat(0x596065, { metalness: 0.7, roughness: 0.32 });
  const rust = mat(0x693a2a, { metalness: 0.28, roughness: 0.66 });
  const leather = mat(0x3b2920, { roughness: 0.88 });
  const cloth = mat(0x4a2326, { roughness: 0.9 });
  const brass = mat(0x9f762f, { metalness: 0.72, roughness: 0.32 });
  const glow = mat(0xc64823, { emissive: 0xff451c, emissiveIntensity: 2.25, roughness: 0.24 });

  // Low, forward-leaning humanoid stance: recognisable as the agile chess knight without literal horse anatomy.
  capsule(root, 0.105, 0.34, blackIron, [-0.2, 0.29, 0.04], [0.18, 0, -0.14], [1, 1, 0.94], 'scavenger-knight-leg-left', segments);
  capsule(root, 0.105, 0.34, blackIron, [0.2, 0.27, -0.02], [-0.14, 0, 0.12], [1, 1, 0.94], 'scavenger-knight-leg-right', segments);
  add(root, new THREE.BoxGeometry(0.25, 0.13, 0.36), wornSteel, [-0.22, 0.08, 0.14], [0.08, 0, -0.05], null, 'scavenger-knight-boot-left');
  add(root, new THREE.BoxGeometry(0.25, 0.13, 0.36), wornSteel, [0.22, 0.07, 0.11], [0.06, 0, 0.06], null, 'scavenger-knight-boot-right');

  const torso = new THREE.Group();
  torso.position.set(0, 0.83, 0.02);
  torso.rotation.x = 0.12;
  root.add(torso);
  capsule(torso, 0.28, 0.42, leather, [0, 0, 0], [0, 0, 0], [1.08, 1, 0.78], 'scavenger-knight-mail-core', segments);
  add(torso, new THREE.SphereGeometry(0.33, segments, Math.max(10, Math.floor(segments / 2))), blackIron, [0, 0.16, 0.05], [0, 0, 0], [1.1, 1, 0.7], 'scavenger-knight-scrap-chest');
  add(torso, new THREE.BoxGeometry(0.28, 0.56, 0.035), cloth, [0.04, -0.08, 0.285], [0, 0, -0.08], null, 'scavenger-knight-tattered-tabard');
  add(torso, new THREE.TorusGeometry(0.28, 0.032, 7, segments), rust, [0, -0.2, 0], [Math.PI / 2, 0, 0], null, 'scavenger-knight-belt');

  add(root, new THREE.DodecahedronGeometry(0.18, 1), rust, [-0.34, 1.06, 0.02], [0.04, 0, -0.35], [1.25, 0.55, 0.95], 'scavenger-knight-pauldron-left');
  add(root, new THREE.DodecahedronGeometry(0.15, 1), wornSteel, [0.34, 1.03, 0], [-0.04, 0, 0.4], [1.2, 0.52, 0.9], 'scavenger-knight-pauldron-right');
  capsule(root, 0.085, 0.34, blackIron, [-0.38, 0.82, 0.06], [0.06, 0, -0.42], [1, 1, 0.92], 'scavenger-knight-arm-left', segments);
  capsule(root, 0.085, 0.34, blackIron, [0.39, 0.78, 0.07], [-0.04, 0, 0.5], [1, 1, 0.92], 'scavenger-knight-arm-right', segments);

  const neck = new THREE.Group();
  neck.name = 'scavenger-knight-neck-rig';
  neck.position.set(0, 1.28, 0.03);
  neck.rotation.x = -0.12;
  root.add(neck);
  add(neck, new THREE.SphereGeometry(0.235, segments, Math.max(10, Math.floor(segments / 2))), blackIron, [0, 0, 0], [0, 0, 0], [0.92, 1.05, 0.84], 'scavenger-knight-helmet');
  add(neck, new THREE.BoxGeometry(0.39, 0.12, 0.1), wornSteel, [0, -0.015, 0.205], [0.02, 0, 0], null, 'scavenger-knight-brow-plate');
  add(neck, new THREE.BoxGeometry(0.24, 0.034, 0.022), glow, [0, 0.005, 0.26], [0, 0, 0], null, 'scavenger-knight-eye-slit');
  // Horse motif lives in the helm crest, keeping the body humanoid and coherent.
  add(neck, new THREE.BoxGeometry(0.13, 0.38, 0.12), wornSteel, [0, 0.25, -0.02], [-0.1, 0, 0], null, 'scavenger-knight-horse-crest');
  add(neck, new THREE.ConeGeometry(0.055, 0.24, 8), wornSteel, [-0.07, 0.45, -0.02], [0.1, 0, 0.08], null, 'scavenger-knight-crest-ear-left');
  add(neck, new THREE.ConeGeometry(0.055, 0.24, 8), wornSteel, [0.07, 0.45, -0.02], [0.1, 0, -0.08], null, 'scavenger-knight-crest-ear-right');

  // Long scavenged blade + off-hand dagger establish a predatory diagonal silhouette.
  add(root, new THREE.CylinderGeometry(0.038, 0.045, 0.5, 8), leather, [0.48, 0.62, 0.07], [0, 0, 0.55], null, 'scavenger-knight-sword-grip');
  add(root, new THREE.BoxGeometry(0.085, 0.92, 0.026), wornSteel, [0.68, 0.88, 0.08], [0, 0, 0.55], [0.68, 1, 1], 'scavenger-knight-sword-blade');
  add(root, new THREE.BoxGeometry(0.3, 0.04, 0.04), rust, [0.51, 0.75, 0.07], [0, 0, 0.55], null, 'scavenger-knight-sword-guard');
  add(root, new THREE.BoxGeometry(0.06, 0.48, 0.025), wornSteel, [-0.48, 0.66, 0.11], [0, 0, -0.62], null, 'scavenger-knight-dagger');

  // Equipment hugs the torso instead of floating from it.
  add(root, new THREE.BoxGeometry(0.3, 0.34, 0.16), leather, [-0.31, 0.64, -0.17], [0, 0.1, 0.08], null, 'scavenger-knight-loot-satchel');
  add(root, new THREE.BoxGeometry(0.22, 0.28, 0.14), leather, [0.32, 0.6, -0.17], [0, -0.12, -0.08], null, 'scavenger-knight-scrap-pouch');
  const trophyCount = coarsePointer ? 1 : 3;
  for (let i = 0; i < trophyCount; i += 1) {
    const x = -0.29 + i * 0.1;
    add(root, new THREE.TorusGeometry(0.065, 0.018, 6, coarsePointer ? 9 : 12), brass,
      [x, 0.69 - i * 0.04, 0.31], [Math.PI / 2, 0, i * 0.35], null, 'scavenger-knight-key-ring-' + i);
  }
  add(root, new THREE.ConeGeometry(0.22, 0.48, 3), cloth, [-0.05, 0.98, -0.29], [0.05, 0, -0.08], null, 'scavenger-knight-torn-cloak');

  root.userData.chroniclesGlowMaterials = [glow];
  root.userData.chroniclesBaseGlow = 2.25;
  root.userData.chroniclesSilhouette = 'scavenger-knight-armoured-hunter';
  root.userData.chroniclesArtTier = 'premium-threat-v3';
  root.userData.chroniclesEnemyId = 'scavenger-knight';
  return root;
}
