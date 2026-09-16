import * as THREE from 'three';

function ownedMaterial(options) {
  const material = new THREE.MeshStandardMaterial(options);
  material.userData.chroniclesOwnedMaterial = true;
  return material;
}

function add(root, geometry, material, position, name, rotation = null, scale = null) {
  const node = new THREE.Mesh(geometry, material);
  node.position.set(...position);
  if (rotation) node.rotation.set(...rotation);
  if (scale) node.scale.set(...scale);
  node.name = name;
  node.castShadow = true;
  node.receiveShadow = true;
  root.add(node);
  return node;
}

function finish(root, id, silhouette) {
  root.name = `chronicles-fantasy-${id}`;
  root.userData.chroniclesEnemyVisualId = id;
  root.userData.chroniclesSilhouette = silhouette;
  root.userData.chroniclesArtTier = 'fantasy-procedural-v1';
  return root;
}

export function buildAshGoblin({ coarsePointer = false } = {}) {
  const root = new THREE.Group();
  const segments = coarsePointer ? 10 : 18;
  const skin = ownedMaterial({ color: 0x6f7651, roughness: 0.88, metalness: 0.01 });
  const leather = ownedMaterial({ color: 0x3a271e, roughness: 0.94, metalness: 0.02 });
  const cloth = ownedMaterial({ color: 0x542d25, roughness: 0.9, metalness: 0.01 });
  const iron = ownedMaterial({ color: 0x5b5c57, roughness: 0.46, metalness: 0.72 });
  const ember = ownedMaterial({ color: 0xe07332, emissive: 0x7f2608, emissiveIntensity: 0.55, roughness: 0.55 });

  add(root, new THREE.CylinderGeometry(0.34, 0.43, 0.72, segments), leather, [0, 0.54, 0], 'ash-goblin-body');
  add(root, new THREE.SphereGeometry(0.27, segments, Math.max(8, Math.round(segments * 0.7))), skin, [0, 1.08, 0.03], 'ash-goblin-head', null, [1, 0.92, 0.9]);
  add(root, new THREE.ConeGeometry(0.13, 0.42, 5), skin, [-0.27, 1.12, -0.01], 'ash-goblin-ear-left', [0, 0, -Math.PI / 2]);
  add(root, new THREE.ConeGeometry(0.13, 0.42, 5), skin, [0.27, 1.12, -0.01], 'ash-goblin-ear-right', [0, 0, Math.PI / 2]);
  add(root, new THREE.BoxGeometry(0.48, 0.18, 0.06), cloth, [0, 0.78, 0.29], 'ash-goblin-sash', [0, 0, -0.2]);
  add(root, new THREE.CylinderGeometry(0.045, 0.055, 0.58, 8), iron, [0.42, 0.66, 0.05], 'ash-goblin-dagger', [0.08, 0, -0.38]);
  add(root, new THREE.ConeGeometry(0.1, 0.26, 4), iron, [0.5, 0.93, 0.06], 'ash-goblin-dagger-tip', [0.08, 0, -0.38]);
  add(root, new THREE.SphereGeometry(0.035, 8, 6), ember, [-0.08, 1.1, 0.25], 'ash-goblin-eye-left');
  add(root, new THREE.SphereGeometry(0.035, 8, 6), ember, [0.08, 1.1, 0.25], 'ash-goblin-eye-right');
  return finish(root, 'ash-goblin', 'goblin-raider');
}

export function buildCryptSpider({ coarsePointer = false } = {}) {
  const root = new THREE.Group();
  const segments = coarsePointer ? 10 : 16;
  const chitin = ownedMaterial({ color: 0x2d2626, roughness: 0.78, metalness: 0.12 });
  const shell = ownedMaterial({ color: 0x4c3431, roughness: 0.68, metalness: 0.16 });
  const eye = ownedMaterial({ color: 0xc84c2f, emissive: 0x68180c, emissiveIntensity: 0.72, roughness: 0.35 });

  add(root, new THREE.SphereGeometry(0.39, segments, Math.max(8, Math.round(segments * 0.65))), shell, [0, 0.46, -0.08], 'crypt-spider-abdomen', null, [1.12, 0.72, 1.24]);
  add(root, new THREE.SphereGeometry(0.27, segments, Math.max(8, Math.round(segments * 0.65))), chitin, [0, 0.43, 0.42], 'crypt-spider-thorax', null, [1, 0.78, 1.05]);

  const legGeometry = new THREE.CylinderGeometry(0.045, 0.06, 0.92, 7);
  [-1, 1].forEach((side) => {
    [0, 1, 2, 3].forEach((index) => {
      const z = 0.35 - index * 0.23;
      const leg = add(
        root,
        legGeometry,
        chitin,
        [side * (0.42 + index * 0.035), 0.28, z],
        `crypt-spider-leg-${side < 0 ? 'left' : 'right'}-${index}`,
        [0.2 + index * 0.06, 0.12 * index, side * (0.88 + index * 0.08)],
      );
      leg.scale.y = 1 + index * 0.08;
    });
  });
  [[-0.11, 0.51], [0.11, 0.51], [-0.18, 0.45], [0.18, 0.45]].forEach(([x, y], index) => {
    add(root, new THREE.SphereGeometry(0.035, 8, 6), eye, [x, y, 0.66], `crypt-spider-eye-${index}`);
  });
  return finish(root, 'crypt-spider', 'low-eight-legged-hunter');
}

export function buildEmberWisp({ coarsePointer = false } = {}) {
  const root = new THREE.Group();
  const segments = coarsePointer ? 12 : 22;
  const core = ownedMaterial({ color: 0xffcf72, emissive: 0xff6a1a, emissiveIntensity: 2.15, roughness: 0.22, metalness: 0.02 });
  const ash = ownedMaterial({ color: 0x463d39, emissive: 0x4f1607, emissiveIntensity: 0.22, roughness: 0.74, metalness: 0.04 });

  add(root, new THREE.SphereGeometry(0.28, segments, Math.max(10, Math.round(segments * 0.7))), core, [0, 0.82, 0], 'ember-wisp-core', null, [0.88, 1.18, 0.88]);
  [0, 1, 2].forEach((index) => {
    const angle = (index / 3) * Math.PI * 2;
    add(
      root,
      new THREE.ConeGeometry(0.12, 0.58 + index * 0.08, 7),
      index === 1 ? core : ash,
      [Math.cos(angle) * 0.16, 0.4 - index * 0.04, Math.sin(angle) * 0.16],
      `ember-wisp-tail-${index}`,
      [0.06 * index, 0, angle * 0.14],
    );
  });
  const halo = add(root, new THREE.TorusGeometry(0.42, 0.035, 8, segments), core, [0, 0.84, 0], 'ember-wisp-halo', [Math.PI / 2, 0, 0]);
  halo.material.transparent = true;
  halo.material.opacity = 0.72;
  return finish(root, 'ember-wisp', 'floating-ember-spirit');
}

export function buildBoneHound({ coarsePointer = false } = {}) {
  const root = new THREE.Group();
  const segments = coarsePointer ? 10 : 16;
  const bone = ownedMaterial({ color: 0xc8b99d, roughness: 0.82, metalness: 0.01 });
  const darkBone = ownedMaterial({ color: 0x756b5d, roughness: 0.88, metalness: 0.01 });
  const eye = ownedMaterial({ color: 0xe44f31, emissive: 0x7f1309, emissiveIntensity: 0.9, roughness: 0.3 });

  add(root, new THREE.CylinderGeometry(0.26, 0.34, 0.92, segments), darkBone, [0, 0.58, -0.05], 'bone-hound-ribcage', [Math.PI / 2, 0, 0], [1, 1.05, 0.78]);
  add(root, new THREE.SphereGeometry(0.27, segments, Math.max(8, Math.round(segments * 0.65))), bone, [0, 0.68, 0.58], 'bone-hound-skull', null, [1, 0.78, 1.12]);
  add(root, new THREE.BoxGeometry(0.3, 0.17, 0.34), bone, [0, 0.58, 0.82], 'bone-hound-muzzle');
  [-1, 1].forEach((side) => {
    [-0.28, 0.28].forEach((z, index) => {
      add(root, new THREE.CylinderGeometry(0.055, 0.07, 0.58, 7), bone, [side * 0.24, 0.28, z], `bone-hound-leg-${side}-${index}`, [0.03 * side, 0, 0]);
    });
    add(root, new THREE.ConeGeometry(0.1, 0.3, 5), bone, [side * 0.2, 0.91, 0.5], `bone-hound-ear-${side}`, [0.18, 0, side * 0.2]);
    add(root, new THREE.SphereGeometry(0.035, 8, 6), eye, [side * 0.09, 0.71, 0.82], `bone-hound-eye-${side}`);
  });
  add(root, new THREE.CylinderGeometry(0.04, 0.065, 0.7, 7), bone, [0, 0.64, -0.68], 'bone-hound-tail', [0.55, 0, 0]);
  return finish(root, 'bone-hound', 'skeletal-hound');
}

export const CHRONICLES_FANTASY_ENEMY_BUILDERS = Object.freeze({
  'ash-goblin': buildAshGoblin,
  'crypt-spider': buildCryptSpider,
  'ember-wisp': buildEmberWisp,
  'bone-hound': buildBoneHound,
});
