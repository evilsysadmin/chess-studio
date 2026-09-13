import * as THREE from 'three';

function mat(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.08,
    roughness: options.roughness ?? 0.58,
    clearcoat: options.clearcoat ?? 0.08,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.44,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
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

export function buildScavengerKnight({ coarsePointer = false } = {}) {
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

  add(root, new THREE.BoxGeometry(0.42, 0.5, 0.24), leather, [-0.44, 0.62, -0.02], [0, -0.12, 0.04], null, 'scavenger-knight-loot-satchel');
  add(root, new THREE.BoxGeometry(0.28, 0.38, 0.18), leather, [0.43, 0.56, -0.06], [0, 0.18, -0.03], null, 'scavenger-knight-scrap-pouch');
  add(root, new THREE.BoxGeometry(0.07, 0.64, 0.05), rust, [0.33, 0.72, 0.2], [0, 0, -0.45], null, 'scavenger-knight-broken-lance');

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
  root.userData.chroniclesEnemyId = 'scavenger-knight';
  return root;
}
