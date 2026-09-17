import * as THREE from 'three';

export const CHRONICLES_DEFAULT_LOADOUT_VERSION = 'premium-default-loadout-v1';
export const CHRONICLES_DEFAULT_LOADOUT_SLOTS = Object.freeze([
  'torso',
  'shoulders',
  'mainWeapon',
  'offhand',
  'classDetail',
]);

function ownedMaterial(color, options = {}) {
  const material = new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.08,
    roughness: options.roughness ?? 0.58,
    clearcoat: options.clearcoat ?? 0.1,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.42,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    envMapIntensity: options.envMapIntensity ?? 0.42,
  });
  material.userData.chroniclesOwnedMaterial = true;
  return material;
}

function addMesh(group, geometry, material, position, name, rotation = [0, 0, 0], scale = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function slot(root, slotName) {
  const group = new THREE.Group();
  group.name = `chronicles-loadout-slot-${slotName}`;
  group.userData.chroniclesLoadoutSlot = slotName;
  root.add(group);
  return group;
}

function disposeLoadout(root) {
  const geometries = new Set();
  const materials = new Set();
  root?.traverse?.((node) => {
    if (node.geometry) geometries.add(node.geometry);
    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
    nodeMaterials.filter(Boolean).forEach((material) => {
      if (material.userData?.chroniclesOwnedMaterial) materials.add(material);
    });
  });
  geometries.forEach((geometry) => geometry.dispose?.());
  materials.forEach((material) => material.dispose?.());
}

function buildMatthiasLoadout({ coarsePointer }) {
  const root = new THREE.Group();
  const segments = coarsePointer ? 10 : 18;
  const blackenedSteel = ownedMaterial(0x30353a, { metalness: 0.68, roughness: 0.34, clearcoat: 0.16 });
  const brass = ownedMaterial(0xa27a35, { metalness: 0.78, roughness: 0.28, clearcoat: 0.18 });
  const wine = ownedMaterial(0x632e31, { roughness: 0.7 });
  const leather = ownedMaterial(0x4a2d1d, { roughness: 0.84 });

  const torso = slot(root, 'torso');
  addMesh(torso, new THREE.SphereGeometry(0.29, segments, Math.max(8, Math.floor(segments / 2))), blackenedSteel,
    [0, 0.98, 0.08], 'matthias-loadout-breastplate', [0, 0, 0], [1.02, 0.72, 0.42]);
  addMesh(torso, new THREE.BoxGeometry(0.38, 0.055, 0.035), brass,
    [0, 0.97, 0.31], 'matthias-loadout-breastplate-bar');
  addMesh(torso, new THREE.BoxGeometry(0.11, 0.32, 0.03), wine,
    [0.12, 0.85, 0.33], 'matthias-loadout-command-sash', [0, 0, 0.44]);

  const shoulders = slot(root, 'shoulders');
  [-1, 1].forEach((side) => {
    addMesh(shoulders, new THREE.SphereGeometry(0.15, segments, 8), blackenedSteel,
      [side * 0.31, 1.08, 0.01], `matthias-loadout-pauldron-${side < 0 ? 'left' : 'right'}`,
      [0, 0, side * -0.08], [1.22, 0.48, 1.0]);
    addMesh(shoulders, new THREE.BoxGeometry(0.18, 0.035, 0.08), brass,
      [side * 0.31, 1.1, 0.09], `matthias-loadout-pauldron-trim-${side < 0 ? 'left' : 'right'}`);
  });

  const mainWeapon = slot(root, 'mainWeapon');
  addMesh(mainWeapon, new THREE.BoxGeometry(0.045, 0.7, 0.025), blackenedSteel,
    [-0.39, 0.76, 0.03], 'matthias-loadout-sabre-blade', [0, 0, -0.1]);
  addMesh(mainWeapon, new THREE.TorusGeometry(0.095, 0.018, 6, segments), brass,
    [-0.355, 1.1, 0.03], 'matthias-loadout-sabre-guard', [Math.PI / 2, 0, 0]);
  addMesh(mainWeapon, new THREE.CylinderGeometry(0.026, 0.026, 0.18, 8), leather,
    [-0.34, 1.18, 0.03], 'matthias-loadout-sabre-grip', [0, 0, -0.1]);

  const offhand = slot(root, 'offhand');
  addMesh(offhand, new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), leather,
    [0.37, 0.71, -0.02], 'matthias-loadout-map-case', [0.1, 0, 0.12]);
  addMesh(offhand, new THREE.TorusGeometry(0.055, 0.012, 6, segments), brass,
    [0.39, 0.95, -0.01], 'matthias-loadout-map-case-cap', [Math.PI / 2, 0, 0]);

  const classDetail = slot(root, 'classDetail');
  addMesh(classDetail, new THREE.BoxGeometry(0.11, 0.11, 0.03), brass,
    [0, 1.16, 0.3], 'matthias-loadout-command-badge', [0, 0, Math.PI / 4]);

  return root;
}

function buildHildegardLoadout({ coarsePointer }) {
  const root = new THREE.Group();
  const segments = coarsePointer ? 10 : 20;
  const steel = ownedMaterial(0xa6afb4, { metalness: 0.78, roughness: 0.25, clearcoat: 0.2 });
  const darkSteel = ownedMaterial(0x30373c, { metalness: 0.7, roughness: 0.34 });
  const brass = ownedMaterial(0x9d7430, { metalness: 0.76, roughness: 0.3 });
  const ember = ownedMaterial(0x7a351d, { metalness: 0.34, roughness: 0.42 });

  const torso = slot(root, 'torso');
  addMesh(torso, new THREE.SphereGeometry(0.38, segments, Math.max(8, Math.floor(segments / 2))), steel,
    [0, 0.91, 0.07], 'hildegard-loadout-breastplate', [0, 0, 0], [1.04, 0.72, 0.46]);
  [0.73, 0.82, 0.91].forEach((y, index) => {
    addMesh(torso, new THREE.BoxGeometry(0.58 - index * 0.06, 0.055, 0.08), darkSteel,
      [0, y, 0.27], `hildegard-loadout-lame-${index}`);
  });
  addMesh(torso, new THREE.BoxGeometry(0.22, 0.22, 0.035), ember,
    [0, 0.97, 0.325], 'hildegard-loadout-chest-mark', [0, 0, Math.PI / 4]);

  const shoulders = slot(root, 'shoulders');
  [-1, 1].forEach((side) => {
    addMesh(shoulders, new THREE.BoxGeometry(0.28, 0.12, 0.24), steel,
      [side * 0.36, 1.09, 0.02], `hildegard-loadout-shoulder-plate-${side < 0 ? 'left' : 'right'}`,
      [0, side * 0.08, side * -0.12]);
    addMesh(shoulders, new THREE.BoxGeometry(0.23, 0.035, 0.06), brass,
      [side * 0.36, 1.13, 0.17], `hildegard-loadout-shoulder-trim-${side < 0 ? 'left' : 'right'}`);
  });

  const mainWeapon = slot(root, 'mainWeapon');
  addMesh(mainWeapon, new THREE.CylinderGeometry(0.05, 0.05, 0.78, 10), darkSteel,
    [-0.45, 0.79, 0.02], 'hildegard-loadout-warhammer-haft', [0, 0, -0.18]);
  addMesh(mainWeapon, new THREE.CylinderGeometry(0.13, 0.13, 0.28, 10), steel,
    [-0.52, 1.17, 0.02], 'hildegard-loadout-warhammer-head', [0, 0, Math.PI / 2]);
  [-1, 1].forEach((side) => {
    addMesh(mainWeapon, new THREE.ConeGeometry(0.085, 0.18, 7), steel,
      [-0.52 + side * 0.2, 1.17, 0.02], `hildegard-loadout-warhammer-pick-${side < 0 ? 'left' : 'right'}`,
      [0, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2]);
  });

  const offhand = slot(root, 'offhand');
  addMesh(offhand, new THREE.SphereGeometry(0.16, segments, 10), steel,
    [0.43, 0.79, 0.19], 'hildegard-loadout-shield-boss', [0, 0, 0], [1.0, 0.82, 0.42]);
  addMesh(offhand, new THREE.TorusGeometry(0.3, 0.025, 8, segments), brass,
    [0.43, 0.79, 0.18], 'hildegard-loadout-shield-ring', [Math.PI / 2, 0, 0]);

  const classDetail = slot(root, 'classDetail');
  addMesh(classDetail, new THREE.BoxGeometry(0.08, 0.32, 0.035), ember,
    [-0.18, 0.91, 0.34], 'hildegard-loadout-veteran-stripe', [0, 0, -0.25]);

  return root;
}

function buildAzizLoadout({ coarsePointer }) {
  const root = new THREE.Group();
  const segments = coarsePointer ? 10 : 20;
  const brass = ownedMaterial(0xb28a3f, { metalness: 0.76, roughness: 0.28, clearcoat: 0.16 });
  const darkBrass = ownedMaterial(0x6a4a22, { metalness: 0.62, roughness: 0.38 });
  const robe = ownedMaterial(0x29453e, { roughness: 0.74 });
  const glow = ownedMaterial(0xe0b76a, {
    metalness: 0.12,
    roughness: 0.3,
    emissive: 0xff7b1f,
    emissiveIntensity: coarsePointer ? 0.9 : 1.45,
  });

  const torso = slot(root, 'torso');
  addMesh(torso, new THREE.SphereGeometry(0.32, segments, Math.max(8, Math.floor(segments / 2))), robe,
    [0, 1.06, -0.01], 'aziz-loadout-layered-mantle', [0, 0, 0], [1.2, 0.42, 0.78]);
  addMesh(torso, new THREE.TorusGeometry(0.3, 0.025, 8, segments), brass,
    [0, 1.08, 0.02], 'aziz-loadout-mantle-collar', [Math.PI / 2, 0, 0]);

  const shoulders = slot(root, 'shoulders');
  [-1, 1].forEach((side) => {
    addMesh(shoulders, new THREE.SphereGeometry(0.09, segments, 8), brass,
      [side * 0.27, 1.1, 0.1], `aziz-loadout-clasp-${side < 0 ? 'left' : 'right'}`,
      [0, 0, 0], [1.1, 0.55, 0.55]);
  });

  const mainWeapon = slot(root, 'mainWeapon');
  addMesh(mainWeapon, new THREE.CylinderGeometry(0.032, 0.032, 0.9, 9), darkBrass,
    [-0.45, 0.83, 0.02], 'aziz-loadout-ritual-staff', [0.04, 0, -0.12]);
  addMesh(mainWeapon, new THREE.TorusGeometry(0.22, 0.025, 8, segments), brass,
    [-0.49, 1.27, 0.04], 'aziz-loadout-lantern-halo', [Math.PI / 2, 0, 0]);
  addMesh(mainWeapon, new THREE.OctahedronGeometry(0.11, 0), glow,
    [-0.49, 1.27, 0.04], 'aziz-loadout-lantern-core');
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2;
    addMesh(mainWeapon, new THREE.BoxGeometry(0.025, 0.3, 0.025), brass,
      [-0.49 + Math.cos(angle) * 0.17, 1.27, 0.04 + Math.sin(angle) * 0.17],
      `aziz-loadout-lantern-rib-${index}`, [0, -angle, 0]);
  }

  const offhand = slot(root, 'offhand');
  [0, 1, 2].forEach((index) => {
    addMesh(offhand, new THREE.BoxGeometry(0.045, 0.18, 0.025), brass,
      [0.3 + index * 0.055, 0.7 - index * 0.02, 0.22], `aziz-loadout-talisman-${index}`,
      [0, 0, 0.18 + index * 0.1]);
  });

  const classDetail = slot(root, 'classDetail');
  addMesh(classDetail, new THREE.CircleGeometry(0.11, segments), glow,
    [0, 0.83, 0.3], 'aziz-loadout-chest-rune');
  addMesh(classDetail, new THREE.TorusGeometry(0.13, 0.014, 6, segments), brass,
    [0, 0.83, 0.305], 'aziz-loadout-chest-rune-ring');

  return root;
}

function buildFaustLoadout({ coarsePointer }) {
  const root = new THREE.Group();
  const segments = coarsePointer ? 10 : 18;
  const iron = ownedMaterial(0x596168, { metalness: 0.68, roughness: 0.34, clearcoat: 0.12 });
  const darkIron = ownedMaterial(0x2a3034, { metalness: 0.62, roughness: 0.4 });
  const leather = ownedMaterial(0x54331f, { roughness: 0.84 });
  const copper = ownedMaterial(0x9a5c31, { metalness: 0.58, roughness: 0.36 });

  const torso = slot(root, 'torso');
  addMesh(torso, new THREE.SphereGeometry(0.32, segments, Math.max(8, Math.floor(segments / 2))), iron,
    [0, 0.92, 0.08], 'faust-loadout-halfplate', [0, 0, 0], [1.0, 0.68, 0.4]);
  addMesh(torso, new THREE.BoxGeometry(0.46, 0.055, 0.06), darkIron,
    [0, 0.78, 0.27], 'faust-loadout-halfplate-lame');
  addMesh(torso, new THREE.BoxGeometry(0.06, 0.52, 0.03), leather,
    [-0.11, 0.89, 0.29], 'faust-loadout-cross-strap-left', [0, 0, -0.32]);
  addMesh(torso, new THREE.BoxGeometry(0.06, 0.52, 0.03), leather,
    [0.11, 0.89, 0.29], 'faust-loadout-cross-strap-right', [0, 0, 0.32]);

  const shoulders = slot(root, 'shoulders');
  [-1, 1].forEach((side) => {
    addMesh(shoulders, new THREE.BoxGeometry(0.24, 0.1, 0.2), iron,
      [side * 0.31, 1.06, 0.01], `faust-loadout-shoulder-${side < 0 ? 'left' : 'right'}`,
      [0, side * 0.08, side * -0.1]);
  });

  const mainWeapon = slot(root, 'mainWeapon');
  addMesh(mainWeapon, new THREE.CylinderGeometry(0.032, 0.032, 1.0, 9), darkIron,
    [-0.43, 0.93, 0.01], 'faust-loadout-short-lance', [0, 0, -0.12]);
  addMesh(mainWeapon, new THREE.ConeGeometry(0.075, 0.25, 8), iron,
    [-0.49, 1.47, 0.01], 'faust-loadout-lance-head', [0, 0, -0.12]);
  addMesh(mainWeapon, new THREE.TorusGeometry(0.06, 0.014, 6, segments), copper,
    [-0.4, 0.52, 0.01], 'faust-loadout-lance-butt', [Math.PI / 2, 0, 0]);

  const offhand = slot(root, 'offhand');
  addMesh(offhand, new THREE.BoxGeometry(0.25, 0.3, 0.09), leather,
    [0.37, 0.74, 0.08], 'faust-loadout-field-kit', [0, -0.1, 0]);
  addMesh(offhand, new THREE.CylinderGeometry(0.045, 0.045, 0.32, 8), copper,
    [0.45, 0.87, 0.1], 'faust-loadout-field-tool', [0, 0, 0.1]);

  const classDetail = slot(root, 'classDetail');
  addMesh(classDetail, new THREE.BoxGeometry(0.18, 0.055, 0.04), copper,
    [0, 1.14, 0.25], 'faust-loadout-logistics-mark');

  return root;
}

const BUILDERS = Object.freeze({
  matthias: buildMatthiasLoadout,
  rook: buildHildegardLoadout,
  bishop: buildAzizLoadout,
  knight: buildFaustLoadout,
});

export const CHRONICLES_DEFAULT_LOADOUT_SIGNATURES = Object.freeze({
  matthias: Object.freeze([
    'matthias-loadout-breastplate',
    'matthias-loadout-sabre-blade',
    'matthias-loadout-command-badge',
  ]),
  rook: Object.freeze([
    'hildegard-loadout-breastplate',
    'hildegard-loadout-warhammer-head',
    'hildegard-loadout-shield-boss',
  ]),
  bishop: Object.freeze([
    'aziz-loadout-layered-mantle',
    'aziz-loadout-lantern-halo',
    'aziz-loadout-chest-rune',
  ]),
  knight: Object.freeze([
    'faust-loadout-halfplate',
    'faust-loadout-short-lance',
    'faust-loadout-field-kit',
  ]),
});

export function installChroniclesDefaultLoadoutArt(
  memberRoot,
  memberId,
  { coarsePointer = false } = {},
) {
  const build = BUILDERS[memberId];
  if (!memberRoot || !build) return () => {};
  const existing = memberRoot.getObjectByName?.(`chronicles-default-loadout-${memberId}`);
  if (existing) return () => {};

  const loadout = build({ coarsePointer });
  loadout.name = `chronicles-default-loadout-${memberId}`;
  loadout.userData.chroniclesLoadoutVersion = CHRONICLES_DEFAULT_LOADOUT_VERSION;
  loadout.userData.chroniclesLoadoutMemberId = memberId;
  memberRoot.add(loadout);
  memberRoot.userData.chroniclesLoadoutVersion = CHRONICLES_DEFAULT_LOADOUT_VERSION;

  return () => {
    disposeLoadout(loadout);
    loadout.removeFromParent();
    if (memberRoot.userData.chroniclesLoadoutVersion === CHRONICLES_DEFAULT_LOADOUT_VERSION) {
      memberRoot.userData.chroniclesLoadoutVersion = null;
    }
  };
}
