import * as THREE from 'three';

// Authored in grid coordinates: future map collision must reserve these footprints.
export const SWORDHAVEN_BUILDINGS = Object.freeze([
  Object.freeze({ id: 'swordhaven-forge', label: 'Armería', x: 4, y: 5, roof: 0x8a4632, emblem: 'swords' }),
  Object.freeze({ id: 'swordhaven-armor', label: 'Armaduras', x: 14, y: 5, roof: 0x4a657e, emblem: 'shield' }),
  Object.freeze({ id: 'swordhaven-tavern', label: 'Taberna', x: 4, y: 13, roof: 0x995e37, emblem: 'mug' }),
  Object.freeze({ id: 'swordhaven-magic', label: 'Magia', x: 14, y: 13, roof: 0x554481, emblem: 'crystal' }),
  Object.freeze({ id: 'swordhaven-temple', label: 'Templo', x: 9, y: 3, roof: 0x65758a, emblem: 'sun' }),
]);

const CELL = 4;
const material = (color, extra = {}) => new THREE.MeshStandardMaterial({
  color, roughness: 0.86, metalness: 0.03, ...extra,
});

function mesh(group, geometry, mat, name, position, shadow = false) {
  const piece = new THREE.Mesh(geometry, mat);
  piece.name = name;
  piece.position.set(...position);
  piece.castShadow = shadow;
  piece.receiveShadow = true;
  group.add(piece);
  return piece;
}

function worldPoint(x, y, center) {
  return [(x - center.x) * CELL, (y - center.y) * CELL];
}

function emblem(group, kind, mats) {
  const gold = mats.gold;
  if (kind === 'swords') {
    for (const tilt of [-0.65, 0.65]) {
      const sword = mesh(group, new THREE.BoxGeometry(0.11, 0.9, 0.1), gold, 'crossed-sword', [0, 0, 0.1]);
      sword.rotation.z = tilt;
    }
  } else if (kind === 'shield') {
    const shape = new THREE.Shape();
    shape.moveTo(-0.4, 0.35); shape.lineTo(0.4, 0.35); shape.lineTo(0.32, -0.2);
    shape.lineTo(0, -0.52); shape.lineTo(-0.32, -0.2); shape.closePath();
    mesh(group, new THREE.ShapeGeometry(shape), gold, 'shield-emblem', [0, 0, 0.1]);
  } else if (kind === 'mug') {
    mesh(group, new THREE.BoxGeometry(0.57, 0.57, 0.12), gold, 'tankard', [-0.1, 0, 0.1]);
    mesh(group, new THREE.TorusGeometry(0.2, 0.06, 5, 12), gold, 'tankard-handle', [0.31, 0, 0.1]);
  } else if (kind === 'crystal') {
    mesh(group, new THREE.OctahedronGeometry(0.45, 0),
      material(0xa78aff, { emissive: 0x423377, emissiveIntensity: 0.6 }), 'arcane-crystal', [0, 0, 0.12]);
  } else if (kind === 'sun') {
    mesh(group, new THREE.SphereGeometry(0.27, 10, 8), gold, 'temple-sun', [0, 0, 0.13]);
    mesh(group, new THREE.TorusGeometry(0.42, 0.045, 5, 16), gold, 'temple-halo', [0, 0, 0.13]);
  }
}

function building(spec, mats, coarse, contentIds, center) {
  const root = new THREE.Group();
  root.name = 'swordhaven-building-' + spec.id;
  const [wx, wz] = worldPoint(spec.x, spec.y, center);
  root.position.set(wx, 0, wz);
  const roof = material(spec.roof);
  const width = spec.emblem === 'sun' ? 9.0 : 8.1;
  const depth = spec.emblem === 'mug' ? 8.2 : 7.1;
  const walls = mesh(root, new THREE.BoxGeometry(width, 5.3, depth), mats.plaster,
    'timber-and-stone-walls', [0, 2.65, 0], !coarse);
  walls.userData.chroniclesArchitecture = true;
  mesh(root, new THREE.BoxGeometry(width + 0.5, 0.72, depth + 0.5), mats.stone,
    'stone-foundations', [0, 0.36, 0]);
  for (const side of [-1, 1]) {
    const roofHalf = mesh(root, new THREE.BoxGeometry(width * 0.59, 0.24, depth + 0.8),
      roof, 'pitched-roof-' + side, [side * width * 0.245, 6.0, 0], !coarse);
    roofHalf.rotation.z = -side * 0.48;
  }
  // Timber-framed facade, porch door and warm window light.
  for (const x of [-width / 2 + 0.27, width / 2 - 0.27]) {
    mesh(root, new THREE.BoxGeometry(0.32, 5.2, 0.38), mats.timber,
      'facade-post', [x, 2.7, depth / 2 + 0.04], !coarse);
  }
  mesh(root, new THREE.BoxGeometry(width, 0.3, 0.38), mats.timber,
    'facade-beam', [0, 4.65, depth / 2 + 0.06]);
  mesh(root, new THREE.BoxGeometry(1.9, 3.1, 0.16), mats.timber,
    'shop-door', [0, 1.57, depth / 2 + 0.14]);
  for (const x of [-width * 0.32, width * 0.32]) {
    mesh(root, new THREE.BoxGeometry(1.25, 1.2, 0.13), mats.window,
      'warm-window', [x, 2.6, depth / 2 + 0.15]);
    mesh(root, new THREE.BoxGeometry(1.42, 0.14, 0.21), mats.timber,
      'window-sill', [x, 1.93, depth / 2 + 0.21]);
  }
  const chimney = mesh(root, new THREE.BoxGeometry(0.9, 2.8, 0.85), mats.stone,
    'chimney', [width * 0.29, 6.1, -depth * 0.23], !coarse);
  chimney.userData.chroniclesArchitecture = true;
  if (spec.emblem === 'sun') {
    const spire = mesh(root, new THREE.ConeGeometry(1.15, 3.5, coarse ? 6 : 8), roof,
      'temple-spire', [0, 8.2, -depth * 0.14], !coarse);
    spire.rotation.y = Math.PI / 4;
  }
  if (spec.emblem === 'crystal') {
    mesh(root, new THREE.ConeGeometry(1.2, 2.1, 8), roof, 'magic-turret', [-width / 2 + 1, 7.8, -1.2], !coarse);
  }
  const sign = new THREE.Group();
  sign.name = 'swordhaven-interaction-' + spec.id;
  sign.userData.chroniclesContentId = spec.id;
  sign.position.set(0, 4.0, depth / 2 + 0.5);
  mesh(sign, new THREE.BoxGeometry(1.7, 1.25, 0.18), mats.timber, 'hanging-sign', [0, 0, 0]);
  emblem(sign, spec.emblem, mats);
  root.add(sign);
  return { root, sign, interactive: contentIds.has(spec.id) };
}

function tree(root, x, z, mats, coarse, index) {
  const treeRoot = new THREE.Group();
  treeRoot.name = 'swordhaven-tree-' + index;
  treeRoot.position.set(x, 0, z);
  mesh(treeRoot, new THREE.CylinderGeometry(0.17, 0.27, 2.5, 7), mats.timber,
    'trunk', [0, 1.25, 0], !coarse);
  const canopy = material(index % 3 === 0 ? 0x689756 : index % 3 === 1 ? 0x427a4c : 0x7eac56);
  mesh(treeRoot, new THREE.IcosahedronGeometry(index % 2 ? 1.55 : 1.9, coarse ? 0 : 1),
    canopy, 'leaf-canopy', [0, 3.35, 0], !coarse);
  root.add(treeRoot);
}

export function buildSwordhavenScene(scene, { scenePlan = {}, coarsePointer = false } = {}) {
  const center = scenePlan.center || { x: 9, y: 9 };
  const width = Math.max(19, Number(scenePlan.width) || 19);
  const height = Math.max(19, Number(scenePlan.height) || 19);
  scene.background = new THREE.Color(0x88c8ef);
  scene.fog = new THREE.Fog(0xa6d8f1, 48, Math.max(width, height) * CELL * 0.98);
  const skylight = new THREE.HemisphereLight(0xd7ebff, 0x688258, 1.45);
  scene.add(skylight);
  const sun = new THREE.DirectionalLight(0xffedd1, coarsePointer ? 1.2 : 1.65);
  sun.name = 'swordhaven-sun';
  sun.position.set(-26, 42, -22);
  sun.castShadow = !coarsePointer;
  if (!coarsePointer) {
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
    sun.shadow.bias = -0.001;
  }
  scene.add(sun);

  const root = new THREE.Group();
  root.name = 'chronicles-swordhaven-town';
  scene.add(root);
  const mats = {
    grass: material(0x668850), cobble: material(0x9d9588),
    stone: material(0x989084), plaster: material(0xd7c2a3),
    timber: material(0x59412f), gold: material(0xd6ae67, { metalness: 0.48 }),
    window: material(0xf8b96e, { emissive: 0x925124, emissiveIntensity: 0.45 }),
  };
  mesh(root, new THREE.BoxGeometry(width * CELL, 0.3, height * CELL),
    mats.grass, 'grass-terrain', [0, -0.2, 0]);
  mesh(root, new THREE.BoxGeometry(7.1, 0.08, height * CELL * 0.8),
    mats.cobble, 'main-street', [0, -0.03, 0]);
  mesh(root, new THREE.BoxGeometry(width * CELL * 0.75, 0.08, 6.9),
    mats.cobble, 'market-cross-street', [0, -0.028, 0]);
  mesh(root, new THREE.CylinderGeometry(10.2, 10.2, 0.11, 24),
    mats.cobble, 'circular-town-square', [0, -0.015, 0]);
  const fountain = new THREE.Group();
  fountain.name = 'swordhaven-fountain';
  mesh(fountain, new THREE.CylinderGeometry(2.0, 2.25, 0.7, 16),
    mats.stone, 'fountain-basin', [0, 0.34, 0]);
  mesh(fountain, new THREE.CylinderGeometry(1.67, 1.67, 0.03, 16),
    material(0x64bfd0, { metalness: 0.12, roughness: 0.22 }), 'fountain-water', [0, 0.71, 0]);
  mesh(fountain, new THREE.CylinderGeometry(0.31, 0.44, 1.9, 10),
    mats.stone, 'fountain-pedestal', [0, 1.25, 0]);
  root.add(fountain);

  const authoredContent = new Set((scenePlan.content || []).filter(e => e.visible !== false).map(e => e.id));
  const contentProps = [];
  SWORDHAVEN_BUILDINGS.forEach(spec => {
    const result = building(spec, mats, coarsePointer, authoredContent, center);
    root.add(result.root);
    if (result.interactive) contentProps.push({
      id: spec.id, kind: 'lore', root: result.sign, phase: 0,
    });
  });
  const locations = [[1,1],[17,1],[1,17],[17,17],[3,9],[15,9],[7,16],[12,16]];
  locations.forEach(([x, y], i) => {
    const [wx, wz] = worldPoint(x, y, center);
    tree(root, wx, wz, mats, coarsePointer, i);
  });
  // An authored gate exit participates in the same raycast and content rules as dungeon exits.
  (scenePlan.content || []).filter(entry => entry.kind === 'exit' && entry.position).forEach(entry => {
    const [x, z] = worldPoint(entry.position.x, entry.position.y, center);
    const gate = new THREE.Group();
    gate.name = 'swordhaven-exit-' + entry.id;
    gate.userData.chroniclesContentId = entry.id;
    gate.position.set(x, 0, z);
    mesh(gate, new THREE.BoxGeometry(0.5, 5.1, 0.8), mats.stone, 'gate-left-post', [-1.8, 2.55, 0]);
    mesh(gate, new THREE.BoxGeometry(0.5, 5.1, 0.8), mats.stone, 'gate-right-post', [1.8, 2.55, 0]);
    mesh(gate, new THREE.BoxGeometry(4.2, 0.65, 1), mats.timber, 'gate-lintel', [0, 5.15, 0]);
    root.add(gate);
    contentProps.push({ id: entry.id, kind: 'exit', root: gate, phase: 0 });
  });

  return {
    enemies: {}, enemyDefinitions: [],
    spectralChapel: new THREE.Group(),
    sigilMaterial: material(0x8c785a, { emissive: 0x241300 }),
    gateMaterial: material(0x766350, { emissive: 0x120700 }),
    gateRunes: [], torches: [], contentProps, sceneCenter: center, materialArt: null,
  };
}
