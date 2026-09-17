import * as THREE from 'three';

function material(color, options = {}) {
  const value = new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.04,
    roughness: options.roughness ?? 0.7,
    clearcoat: options.clearcoat ?? 0.04,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.55,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
  });
  value.userData.chroniclesOwnedMaterial = true;
  return value;
}

function add(root, geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0], scale = null, name = '') {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  if (scale) mesh.scale.set(...scale);
  if (name) mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function finish(root, id, silhouette, glowMaterials = [], baseGlow = 0) {
  root.userData.chroniclesEnemyId = id;
  root.userData.chroniclesSilhouette = silhouette;
  root.userData.chroniclesArtTier = 'fantasy-bestiary-v1';
  if (glowMaterials.length) {
    root.userData.chroniclesGlowMaterials = glowMaterials;
    root.userData.chroniclesBaseGlow = baseGlow;
  }
  return root;
}

export function buildAshGoblin({ coarsePointer = false } = {}) {
  const segments = coarsePointer ? 10 : 18;
  const root = new THREE.Group();
  root.name = 'chronicles-ash-goblin';

  const skin = material(0x6f6d48, { roughness: 0.88 });
  const ash = material(0x343330, { roughness: 0.94 });
  const leather = material(0x4a3023, { roughness: 0.86 });
  const iron = material(0x44494a, { metalness: 0.5, roughness: 0.48 });
  const ember = material(0xe0924e, { emissive: 0xb84418, emissiveIntensity: 1.75, roughness: 0.3 });

  add(root, new THREE.CylinderGeometry(0.58, 0.7, 0.16, segments), ash, [0, 0.08, 0], [], null, 'ash-goblin-plinth');
  add(root, new THREE.SphereGeometry(0.44, segments, Math.max(8, segments / 2)), leather, [0, 0.67, 0], [], [0.92, 1.12, 0.78], 'ash-goblin-torso');
  const head = add(root, new THREE.SphereGeometry(0.36, segments, Math.max(8, segments / 2)), skin, [0, 1.24, 0.05], [], [1, 0.85, 0.9], 'ash-goblin-head');
  add(head, new THREE.ConeGeometry(0.13, 0.5, 7), skin, [-0.38, 0.06, 0], [0, 0, Math.PI / 2], null, 'ash-goblin-ear-left');
  add(head, new THREE.ConeGeometry(0.13, 0.5, 7), skin, [0.38, 0.06, 0], [0, 0, -Math.PI / 2], null, 'ash-goblin-ear-right');
  add(head, new THREE.SphereGeometry(0.055, 9, 7), ember, [-0.13, 0.05, 0.31], [], null, 'ash-goblin-eye-left');
  add(head, new THREE.SphereGeometry(0.055, 9, 7), ember, [0.13, 0.05, 0.31], [], null, 'ash-goblin-eye-right');
  add(root, new THREE.BoxGeometry(0.82, 0.18, 0.36), ash, [0, 0.88, 0.02], [0.08, 0, 0], null, 'ash-goblin-rag-armour');
  add(root, new THREE.BoxGeometry(0.12, 0.64, 0.12), leather, [0.48, 0.7, 0.02], [0, 0, -0.34], null, 'ash-goblin-cleaver-arm');
  add(root, new THREE.BoxGeometry(0.34, 0.46, 0.08), iron, [0.6, 0.98, 0.04], [0, 0, -0.28], null, 'ash-goblin-cleaver');

  return finish(root, 'ash-goblin', 'squat-eared-cleaver', [ember], 1.75);
}

export function buildCryptSpider({ coarsePointer = false } = {}) {
  const segments = coarsePointer ? 10 : 16;
  const root = new THREE.Group();
  root.name = 'chronicles-crypt-spider';

  const chitin = material(0x302b2a, { roughness: 0.76, clearcoat: 0.12 });
  const bone = material(0x756a59, { roughness: 0.84 });
  const eye = material(0xc85c36, { emissive: 0x922b18, emissiveIntensity: 2.1, roughness: 0.24 });

  add(root, new THREE.SphereGeometry(0.44, segments, Math.max(8, segments / 2)), chitin, [0, 0.48, -0.18], [], [1.15, 0.7, 1.35], 'crypt-spider-abdomen');
  const thorax = add(root, new THREE.SphereGeometry(0.34, segments, Math.max(8, segments / 2)), chitin, [0, 0.47, 0.34], [], [1, 0.72, 0.92], 'crypt-spider-thorax');
  add(thorax, new THREE.ConeGeometry(0.08, 0.3, 7), bone, [-0.16, -0.03, 0.34], [Math.PI / 2, 0, 0.14], null, 'crypt-spider-fang-left');
  add(thorax, new THREE.ConeGeometry(0.08, 0.3, 7), bone, [0.16, -0.03, 0.34], [Math.PI / 2, 0, -0.14], null, 'crypt-spider-fang-right');
  [-0.16, -0.055, 0.055, 0.16].forEach((x, index) => {
    add(thorax, new THREE.SphereGeometry(0.035, 8, 6), eye, [x, 0.08 + Math.abs(x) * 0.12, 0.31], [], null, `crypt-spider-eye-${index}`);
  });

  for (let side = -1; side <= 1; side += 2) {
    for (let index = 0; index < 4; index += 1) {
      const z = 0.32 - index * 0.23;
      const yaw = side * (0.25 + index * 0.08);
      add(root, new THREE.CylinderGeometry(0.035, 0.055, 0.72, 7), chitin,
        [side * 0.48, 0.35, z], [0.18, 0, side * (1.05 - index * 0.08)], null, `crypt-spider-leg-${side}-${index}-inner`);
      add(root, new THREE.CylinderGeometry(0.025, 0.04, 0.7, 7), bone,
        [side * 0.91, 0.17, z + yaw * 0.18], [0.08, 0, side * (1.28 - index * 0.06)], null, `crypt-spider-leg-${side}-${index}-outer`);
    }
  }

  return finish(root, 'crypt-spider', 'low-eight-legged-hunter', [eye], 2.1);
}

export function buildEmberWisp({ coarsePointer = false } = {}) {
  const segments = coarsePointer ? 12 : 22;
  const root = new THREE.Group();
  root.name = 'chronicles-ember-wisp';

  const ember = material(0xffb45f, { emissive: 0xf05a20, emissiveIntensity: 3.1, roughness: 0.18 });
  const coal = material(0x33201a, { emissive: 0x7a2514, emissiveIntensity: 0.7, roughness: 0.7 });
  const haze = material(0xe96b35, { emissive: 0xc83c18, emissiveIntensity: 1.5, roughness: 0.32, transparent: true, opacity: 0.42 });

  add(root, new THREE.IcosahedronGeometry(0.27, coarsePointer ? 0 : 1), ember, [0, 0.92, 0], [], null, 'ember-wisp-core');
  add(root, new THREE.TorusGeometry(0.42, 0.035, 7, segments), coal, [0, 0.9, 0], [Math.PI / 2, 0.2, 0], null, 'ember-wisp-ring');
  add(root, new THREE.ConeGeometry(0.28, 0.7, segments), haze, [0, 0.48, 0], [0, 0, Math.PI], null, 'ember-wisp-tail');
  add(root, new THREE.SphereGeometry(0.46, segments, Math.max(8, segments / 2)), haze, [0, 0.9, 0], [], [1, 1.18, 1], 'ember-wisp-aura');
  const light = new THREE.PointLight(0xff7438, coarsePointer ? 0.8 : 1.3, 4.2, 2);
  light.position.set(0, 0.9, 0);
  root.add(light);

  return finish(root, 'ember-wisp', 'floating-ember-flame', [ember, haze], 3.1);
}

export function buildBoneHound({ coarsePointer = false } = {}) {
  const segments = coarsePointer ? 10 : 18;
  const root = new THREE.Group();
  root.name = 'chronicles-bone-hound';

  const bone = material(0xb1a58d, { roughness: 0.82 });
  const darkBone = material(0x645b50, { roughness: 0.88 });
  const iron = material(0x3b3e3f, { metalness: 0.42, roughness: 0.5 });
  const eye = material(0x77c0c4, { emissive: 0x278b93, emissiveIntensity: 2.35, roughness: 0.22 });

  add(root, new THREE.CylinderGeometry(0.42, 0.48, 0.14, segments), iron, [0, 0.07, 0], [], null, 'bone-hound-plinth');
  add(root, new THREE.BoxGeometry(0.48, 0.48, 1.05), darkBone, [0, 0.58, -0.05], [0.02, 0, 0], null, 'bone-hound-rib-cage');
  for (let index = -2; index <= 2; index += 1) {
    add(root, new THREE.TorusGeometry(0.3, 0.035, 6, segments), bone, [0, 0.62, index * 0.18 - 0.05], [Math.PI / 2, 0, 0], null, `bone-hound-rib-${index}`);
  }
  const head = add(root, new THREE.BoxGeometry(0.48, 0.36, 0.52), bone, [0, 0.86, 0.62], [-0.1, 0, 0], null, 'bone-hound-skull');
  add(head, new THREE.BoxGeometry(0.34, 0.16, 0.38), darkBone, [0, -0.18, 0.28], [0.12, 0, 0], null, 'bone-hound-jaw');
  add(head, new THREE.ConeGeometry(0.09, 0.34, 7), bone, [-0.19, 0.28, -0.04], [0.08, 0, -0.2], null, 'bone-hound-ear-left');
  add(head, new THREE.ConeGeometry(0.09, 0.34, 7), bone, [0.19, 0.28, -0.04], [0.08, 0, 0.2], null, 'bone-hound-ear-right');
  add(head, new THREE.SphereGeometry(0.048, 8, 6), eye, [-0.13, 0.07, 0.27], [], null, 'bone-hound-eye-left');
  add(head, new THREE.SphereGeometry(0.048, 8, 6), eye, [0.13, 0.07, 0.27], [], null, 'bone-hound-eye-right');
  [-0.2, 0.2].forEach((x, sideIndex) => {
    [-0.34, 0.28].forEach((z, legIndex) => {
      add(root, new THREE.CylinderGeometry(0.055, 0.07, 0.58, 7), bone,
        [x, 0.3, z], [0.08 * (legIndex ? -1 : 1), 0, sideIndex ? -0.08 : 0.08], null, `bone-hound-leg-${sideIndex}-${legIndex}`);
    });
  });
  add(root, new THREE.CylinderGeometry(0.035, 0.055, 0.62, 7), darkBone, [0, 0.67, -0.75], [0.82, 0, 0], null, 'bone-hound-tail');

  return finish(root, 'bone-hound', 'skeletal-ribbed-hound', [eye], 2.35);
}
