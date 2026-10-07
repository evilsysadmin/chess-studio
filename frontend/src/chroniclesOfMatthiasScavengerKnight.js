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
} = {}) {
  const segments = coarsePointer ? 16 : 28;
  const root = new THREE.Group();
  root.name = 'chronicles-scavenger-knight';

  const bone = mat(0x8d806b, { roughness: 0.8, metalness: 0.03 });
  const iron = mat(0x363d40, { metalness: 0.62, roughness: 0.4 });
  const rust = mat(0x74432b, { metalness: 0.34, roughness: 0.6 });
  const leather = mat(0x4b3223, { roughness: 0.84 });
  const brass = mat(0xa97931, { metalness: 0.7, roughness: 0.32 });
  const glow = mat(0xe59b45, { emissive: 0xff6d16, emissiveIntensity: 2.15, roughness: 0.24 });

  add(root, new THREE.CylinderGeometry(0.68, 0.82, 0.18, segments), iron, [0, 0.09, 0], [0, 0, 0], null, 'scavenger-knight-plinth');
  add(root, new THREE.TorusGeometry(0.58, 0.035, 8, segments), rust, [0, 0.2, 0], [Math.PI / 2, 0, 0], null, 'scavenger-knight-rust-ring');

  const neck = new THREE.Group();
  neck.name = 'scavenger-knight-neck-rig';
  neck.position.set(0, 0.28, 0);
  neck.rotation.x = -0.12;
  root.add(neck);
  add(neck, new THREE.CylinderGeometry(0.24, 0.34, 0.82, segments), bone, [0, 0.5, -0.02], [0.34, 0, 0], null, 'scavenger-knight-neck');
  add(neck, new THREE.SphereGeometry(0.34, segments, Math.max(10, Math.floor(segments / 2))), bone, [0, 0.98, 0.22], [0, 0, 0], [0.9, 0.78, 1.32], 'scavenger-knight-horse-head');
  add(neck, new THREE.BoxGeometry(0.5, 0.18, 0.2), iron, [0, 1.02, 0.39], [0.08, 0, 0], null, 'scavenger-knight-brow-plate');
  add(neck, new THREE.BoxGeometry(0.42, 0.18, 0.26), rust, [0, 0.84, 0.49], [0.08, 0, 0], null, 'scavenger-knight-muzzle-guard');
  add(neck, new THREE.ConeGeometry(0.075, 0.34, 8), bone, [-0.17, 1.29, 0.13], [0.2, 0, 0.08], null, 'scavenger-knight-ear-left');
  add(neck, new THREE.ConeGeometry(0.075, 0.34, 8), bone, [0.17, 1.29, 0.13], [0.2, 0, -0.08], null, 'scavenger-knight-ear-right');
  add(neck, new THREE.SphereGeometry(0.052, 10, 8), glow, [0.135, 1.03, 0.505], [0, 0, 0], [1.15, 0.58, 0.42], 'scavenger-knight-amber-eye');
  add(neck, new THREE.SphereGeometry(0.052, 10, 8), glow, [-0.135, 1.03, 0.505], [0, 0, 0], [1.15, 0.58, 0.42], 'scavenger-knight-amber-eye-left');
  add(neck, new THREE.ConeGeometry(0.07, 0.34, 8), iron, [0, 0.79, 0.67], [Math.PI / 2, 0, 0], null, 'scavenger-knight-muzzle-spike');

  add(root, new THREE.BoxGeometry(0.42, 0.5, 0.24), leather, [-0.44, 0.62, -0.02], [0, -0.12, 0.04], null, 'scavenger-knight-loot-satchel');
  add(root, new THREE.BoxGeometry(0.28, 0.38, 0.18), leather, [0.43, 0.56, -0.06], [0, 0.18, -0.03], null, 'scavenger-knight-scrap-pouch');
  add(root, new THREE.BoxGeometry(0.07, 0.64, 0.05), rust, [0.33, 0.72, 0.2], [0, 0, -0.45], null, 'scavenger-knight-broken-lance');
  add(root, new THREE.BoxGeometry(0.48, 0.42, 0.08), iron, [0, 0.64, 0.3], [0.04, 0, 0], null, 'scavenger-knight-scrap-chest');
  add(root, new THREE.BoxGeometry(0.34, 0.12, 0.18), rust, [-0.34, 0.79, 0.14], [0.03, 0.18, -0.22], null, 'scavenger-knight-pauldron-left');
  add(root, new THREE.BoxGeometry(0.34, 0.12, 0.18), rust, [0.34, 0.79, 0.14], [0.03, -0.18, 0.22], null, 'scavenger-knight-pauldron-right');
  add(root, new THREE.BoxGeometry(0.055, 0.62, 0.035), leather, [-0.14, 0.67, 0.35], [0, 0, -0.52], null, 'scavenger-knight-chest-strap-left');
  add(root, new THREE.BoxGeometry(0.055, 0.62, 0.035), leather, [0.14, 0.67, 0.35], [0, 0, 0.52], null, 'scavenger-knight-chest-strap-right');

  const trophyCount = coarsePointer ? 1 : 3;
  for (let i = 0; i < trophyCount; i += 1) {
    const x = -0.49 + i * 0.13;
    add(root, new THREE.TorusGeometry(0.09 - i * 0.008, 0.022, 6, coarsePointer ? 10 : 14), brass, [x, 0.82 - i * 0.08, 0.16], [Math.PI / 2, 0, i * 0.5], null, `scavenger-knight-key-ring-${i}`);
    add(root, new THREE.BoxGeometry(0.04, 0.23, 0.025), brass, [x, 0.67 - i * 0.08, 0.16], [0, 0, 0.08 * i], null, `scavenger-knight-key-${i}`);
  }

  add(root, new THREE.BoxGeometry(0.1, 0.42, 0.025), rust, [0.05, 0.73, -0.34], [0.22, 0, 0.12], null, 'scavenger-knight-torn-pennant-pole');
  add(root, new THREE.ConeGeometry(0.2, 0.42, 3), leather, [0.08, 0.96, -0.35], [0, 0, -0.15], null, 'scavenger-knight-torn-pennant');

  root.userData.chroniclesGlowMaterials = [glow];
  root.userData.chroniclesBaseGlow = 2.15;
  root.userData.chroniclesSilhouette = 'scavenger-knight-loot-horse';
  root.userData.chroniclesArtTier = 'premium-threat-v2';
  root.userData.chroniclesEnemyId = 'scavenger-knight';
  return root;
}
