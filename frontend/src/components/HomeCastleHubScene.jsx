import { useEffect, useRef } from 'react';

const DESKTOP_DPR_CAP = 1.1;
const MOBILE_DPR_CAP = 1;

export const HOME_CASTLE_ROOM_TARGETS = Object.freeze({
  play: ['.home-continue-card', '.home-mode-quick'],
  tournament: ['.home-mode-featured'],
  combat: ['.home-mode-campaign'],
  daily: ['.home-today-actions button'],
});

function firstMatchingTarget(selectors, root = document) {
  for (const selector of selectors || []) {
    const element = root.querySelector(selector);
    if (element) return element;
  }
  return null;
}

export function activateHomeCastleRoom(roomId, root = document) {
  if (roomId === 'train') {
    const learning = root.querySelector('.home-primary-group:not(.home-modes-section)');
    learning?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    return Boolean(learning);
  }
  const target = firstMatchingTarget(HOME_CASTLE_ROOM_TARGETS[roomId], root);
  target?.click?.();
  return Boolean(target);
}

function makeMaterial(THREE, options) {
  return new THREE.MeshStandardMaterial(options);
}

function addBox(THREE, parent, size, position, material, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function addCylinder(THREE, parent, radiusTop, radiusBottom, height, position, material, segments = 10, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function addSphere(THREE, parent, radius, position, material, widthSegments = 10, heightSegments = 8, scale = null) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, widthSegments, heightSegments), material);
  mesh.position.set(...position);
  if (scale) mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

function addTorch(THREE, parent, x, y, z, side, materials, addLight) {
  const { iron, ember, flame } = materials;
  const group = new THREE.Group();
  group.position.set(x, y, z);
  parent.add(group);

  const bracket = addBox(THREE, group, [0.10, 0.58, 0.10], [0, -0.10, 0], iron, [0, 0, side * 0.24]);
  bracket.position.x = side * 0.05;
  addCylinder(THREE, group, 0.18, 0.10, 0.18, [side * 0.12, 0.22, 0.02], iron, 10);
  addSphere(THREE, group, 0.12, [side * 0.12, 0.42, 0.02], ember, 9, 7, [0.82, 1.25, 0.82]);
  addSphere(THREE, group, 0.085, [side * 0.12, 0.54, 0.02], flame, 9, 7, [0.64, 1.48, 0.64]);

  if (addLight) {
    const light = new THREE.PointLight(0xff9a43, 3.15, 5.8, 1.45);
    light.position.set(side * 0.12, 0.42, 0.72);
    group.add(light);
  }
  return group;
}

function addArchPortal(THREE, parent, x, width, materials) {
  const { stone, stoneEdge, dark } = materials;
  const group = new THREE.Group();
  group.position.set(x, 0, 0);
  parent.add(group);

  const half = width / 2;
  addBox(THREE, group, [0.42, 4.65, 0.62], [-half, 1.45, -3.74], stoneEdge);
  addBox(THREE, group, [0.42, 4.65, 0.62], [half, 1.45, -3.74], stoneEdge);
  addBox(THREE, group, [width + 0.55, 0.28, 0.70], [0, -0.80, -3.74], stoneEdge);

  const arch = new THREE.Mesh(new THREE.TorusGeometry(half, 0.22, 8, 28, Math.PI), stoneEdge);
  arch.position.set(0, 3.78, -3.74);
  arch.rotation.z = Math.PI;
  group.add(arch);

  addBox(THREE, group, [width - 0.34, 3.78, 0.10], [0, 1.00, -3.98], dark);
  const innerArch = new THREE.Mesh(new THREE.TorusGeometry(half - 0.18, 0.08, 7, 24, Math.PI), stone);
  innerArch.position.set(0, 3.71, -3.64);
  innerArch.rotation.z = Math.PI;
  group.add(innerArch);
  return group;
}

function addArmour(THREE, parent, x, y, z, materials, scale = 1, yaw = 0) {
  const { armour, armourEdge, brass } = materials;
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  group.rotation.y = yaw;
  parent.add(group);

  addBox(THREE, group, [0.92, 0.18, 0.66], [0, -0.04, 0], armourEdge);
  addCylinder(THREE, group, 0.28, 0.34, 1.24, [0, 0.78, 0], armour, 9);
  addSphere(THREE, group, 0.30, [0, 1.64, 0], armourEdge, 10, 8, [0.92, 1.02, 0.92]);
  addBox(THREE, group, [0.64, 0.08, 0.38], [0, 1.60, 0.25], armour);
  addBox(THREE, group, [0.15, 1.18, 0.15], [-0.52, 0.80, 0], armour, [0, 0, -0.13]);
  addBox(THREE, group, [0.15, 1.18, 0.15], [0.52, 0.80, 0], armour, [0, 0, 0.13]);
  addBox(THREE, group, [0.18, 1.15, 0.18], [-0.24, -0.70, 0], armour);
  addBox(THREE, group, [0.18, 1.15, 0.18], [0.24, -0.70, 0], armour);
  addBox(THREE, group, [0.82, 0.08, 0.12], [0, 1.87, 0.05], brass);
  return group;
}

function addSofa(THREE, parent, materials) {
  const { leather, oak, brass } = materials;
  const group = new THREE.Group();
  group.position.set(-5.65, -0.52, 1.55);
  group.rotation.y = 0.12;
  parent.add(group);

  addBox(THREE, group, [3.05, 0.55, 1.42], [0, 0.44, 0], leather);
  addBox(THREE, group, [3.08, 1.38, 0.48], [0, 1.13, -0.44], leather, [-0.11, 0, 0]);
  addBox(THREE, group, [0.48, 0.92, 1.48], [-1.42, 0.70, 0], leather);
  addBox(THREE, group, [0.48, 0.92, 1.48], [1.42, 0.70, 0], leather);
  for (const x of [-1.18, 1.18]) addBox(THREE, group, [0.20, 0.60, 0.20], [x, -0.10, 0.38], oak);
  addBox(THREE, group, [0.06, 0.04, 2.55], [0, 1.86, -0.52], brass, [0, Math.PI / 2, 0]);
  return group;
}

function addLion(THREE, parent, materials) {
  const { lionStone, lionDark } = materials;
  const group = new THREE.Group();
  group.position.set(6.65, -0.63, 0.55);
  group.rotation.y = -0.35;
  parent.add(group);

  addBox(THREE, group, [2.05, 0.48, 1.50], [0, 0.10, 0], lionDark);
  addSphere(THREE, group, 0.78, [0, 1.27, 0], lionStone, 12, 9, [1.0, 1.12, 0.92]);
  addSphere(THREE, group, 0.54, [0, 1.42, 0.31], lionDark, 12, 9, [1.18, 1.14, 0.82]);
  addSphere(THREE, group, 0.38, [0, 1.40, 0.67], lionStone, 11, 8, [1.05, 0.80, 0.82]);
  addSphere(THREE, group, 0.12, [-0.18, 1.52, 0.82], lionDark, 7, 6);
  addSphere(THREE, group, 0.12, [0.18, 1.52, 0.82], lionDark, 7, 6);
  addSphere(THREE, group, 0.11, [0, 1.32, 0.98], lionDark, 7, 6);
  addSphere(THREE, group, 0.20, [-0.46, 1.94, 0.12], lionStone, 8, 6, [0.86, 1.08, 0.72]);
  addSphere(THREE, group, 0.20, [0.46, 1.94, 0.12], lionStone, 8, 6, [0.86, 1.08, 0.72]);
  addCylinder(THREE, group, 0.48, 0.60, 1.38, [0, 0.74, -0.24], lionStone, 10, [Math.PI / 2, 0, 0]);
  addCylinder(THREE, group, 0.20, 0.25, 1.00, [-0.49, 0.50, 0.46], lionStone, 9, [Math.PI / 2, 0, 0]);
  addCylinder(THREE, group, 0.20, 0.25, 1.00, [0.49, 0.50, 0.46], lionStone, 9, [Math.PI / 2, 0, 0]);
  return group;
}

function addChessBoard(THREE, parent, x, y, z, scale, materials, includePieces = true) {
  const { oak, oakEdge, brass, boardLight, boardDark, pieceLight, pieceDark } = materials;
  const table = new THREE.Group();
  table.position.set(x, y, z);
  table.scale.setScalar(scale);
  parent.add(table);

  addBox(THREE, table, [4.75, 0.30, 4.10], [0, 0.55, 0], oakEdge);
  addBox(THREE, table, [4.42, 0.10, 3.80], [0, 0.76, 0], oak);
  for (const px of [-1.86, 1.86]) {
    for (const pz of [-1.52, 1.52]) addBox(THREE, table, [0.30, 1.55, 0.30], [px, -0.26, pz], oak);
  }
  addBox(THREE, table, [3.25, 0.08, 3.25], [0, 0.85, 0], brass);
  const square = 0.38;
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      addBox(
        THREE,
        table,
        [square, 0.035, square],
        [(file - 3.5) * square, 0.91, (rank - 3.5) * square],
        (rank + file) % 2 === 0 ? boardLight : boardDark,
      );
    }
  }
  if (includePieces) {
    const back = [0.19, 0.24, 0.22, 0.30, 0.32, 0.22, 0.24, 0.19];
    for (const side of [-1, 1]) {
      const mat = side < 0 ? pieceLight : pieceDark;
      const pawnRank = side < 0 ? 2.5 : -2.5;
      const backRank = side < 0 ? 3.5 : -3.5;
      for (let file = 0; file < 8; file += 1) {
        addCylinder(THREE, table, 0.09, 0.14, 0.24, [(file - 3.5) * square, 1.08, pawnRank * square], mat, 8);
        addSphere(THREE, table, 0.08, [(file - 3.5) * square, 1.24, pawnRank * square], mat, 8, 6);
        addCylinder(THREE, table, back[file], back[file] + 0.05, 0.38, [(file - 3.5) * square, 1.14, backRank * square], mat, 8);
      }
    }
  }
  return table;
}

function addBookshelf(THREE, parent, x, y, z, materials, scale = 1) {
  const { oak, oakEdge, bookRed, bookTan, brass } = materials;
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  parent.add(group);

  addBox(THREE, group, [1.55, 3.25, 0.42], [0, 1.12, 0], oakEdge);
  addBox(THREE, group, [1.36, 3.02, 0.30], [0, 1.12, 0.12], oak);
  for (const shelfY of [0.10, 0.78, 1.46, 2.14]) {
    addBox(THREE, group, [1.32, 0.08, 0.45], [0, shelfY, 0.12], brass);
    for (let i = 0; i < 7; i += 1) {
      const h = 0.34 + (i % 3) * 0.06;
      addBox(THREE, group, [0.12, h, 0.22], [-0.52 + i * 0.17, shelfY + 0.18, 0.30], i % 2 ? bookRed : bookTan);
    }
  }
  return group;
}

function addRoomProps(THREE, room, materials, coarse) {
  addChessBoard(THREE, room, -5.65, -0.68, -3.06, 0.48, materials, !coarse);
  addChessBoard(THREE, room, -2.85, -0.70, -3.08, 0.43, materials, false);
  addBookshelf(THREE, room, -0.56, -0.45, -3.28, materials, 0.68);
  addBookshelf(THREE, room, 0.58, -0.45, -3.28, materials, 0.68);
  addChessBoard(THREE, room, 0, -0.74, -3.04, 0.33, materials, false);
  addArmour(THREE, room, 2.30, 0.02, -3.10, materials, 0.72, 0.12);
  addArmour(THREE, room, 2.95, 0.02, -3.16, materials, 0.72, 0.02);
  addArmour(THREE, room, 3.60, 0.02, -3.10, materials, 0.72, -0.12);
  addBox(THREE, room, [1.42, 1.42, 0.82], [5.65, 0.08, -3.05], materials.lionDark);
  addSphere(THREE, room, 0.32, [5.65, 0.98, -2.95], materials.parchment, 10, 8);
}

function addBalcony(THREE, room, materials) {
  const { stoneEdge, brass } = materials;
  addBox(THREE, room, [15.6, 0.34, 1.12], [0, 4.60, -3.88], stoneEdge);
  addBox(THREE, room, [15.1, 0.18, 0.18], [0, 5.12, -3.40], brass);
  for (let x = -7.20; x <= 7.20; x += 0.48) {
    addCylinder(THREE, room, 0.05, 0.07, 0.78, [x, 4.74, -3.42], stoneEdge, 8);
  }
}

function addChandelier(THREE, room, materials, x, y, z, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  room.add(group);
  const { iron, flame } = materials;
  addCylinder(THREE, group, 0.035, 0.035, 1.35, [0, 0.62, 0], iron, 8);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.06, 8, 22), iron);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const px = Math.cos(a) * 0.72;
    const pz = Math.sin(a) * 0.72;
    addCylinder(THREE, group, 0.025, 0.035, 0.26, [px, 0.17, pz], materials.parchment, 7);
    addSphere(THREE, group, 0.045, [px, 0.34, pz], flame, 7, 5, [0.72, 1.35, 0.72]);
  }
}

function createDust(THREE, count) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 16;
    positions[i * 3 + 1] = Math.random() * 6.6 - 0.7;
    positions[i * 3 + 2] = Math.random() * 8 - 2.2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0xd9b66e,
    size: 0.018,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  }));
}

function buildCastleHubScene(THREE, { host, ambience }) {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.tabIndex = -1;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !coarse,
      powerPreference: 'high-performance',
    });
  } catch {
    host.dataset.homeCastleHubFallback = 'webgl-unavailable';
    return () => {};
  }

  renderer.setClearColor(0x050607, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = coarse ? 1.10 : 1.18;
  renderer.shadowMap.enabled = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? MOBILE_DPR_CAP : DESKTOP_DPR_CAP));
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0908, coarse ? 0.033 : 0.023);
  const camera = new THREE.PerspectiveCamera(coarse ? 49 : 37, 1, 0.1, 60);
  camera.position.set(0, coarse ? 4.20 : 3.82, coarse ? 13.9 : 12.05);
  camera.lookAt(0, 1.55, -0.55);

  const materials = {
    stone: makeMaterial(THREE, { color: 0x4b4237, roughness: 0.94, metalness: 0.02 }),
    stoneEdge: makeMaterial(THREE, { color: 0x74634e, roughness: 0.88, metalness: 0.03 }),
    lionStone: makeMaterial(THREE, { color: 0x938a7b, roughness: 0.90, metalness: 0.02 }),
    lionDark: makeMaterial(THREE, { color: 0x5f574b, roughness: 0.92, metalness: 0.02 }),
    oak: makeMaterial(THREE, { color: 0x331d10, roughness: 0.72, metalness: 0.03 }),
    oakEdge: makeMaterial(THREE, { color: 0x6a3a1e, roughness: 0.61, metalness: 0.05 }),
    brass: makeMaterial(THREE, { color: 0xc18a35, roughness: 0.34, metalness: 0.76 }),
    iron: makeMaterial(THREE, { color: 0x302f2b, roughness: 0.36, metalness: 0.74 }),
    armour: makeMaterial(THREE, { color: 0x555a5c, roughness: 0.34, metalness: 0.78 }),
    armourEdge: makeMaterial(THREE, { color: 0x888c8d, roughness: 0.30, metalness: 0.82 }),
    leather: makeMaterial(THREE, { color: 0x5d241b, roughness: 0.78, metalness: 0.02 }),
    velvet: makeMaterial(THREE, { color: 0x701929, roughness: 0.97, metalness: 0 }),
    runner: makeMaterial(THREE, { color: 0x7a1f30, roughness: 0.92, metalness: 0 }),
    dark: makeMaterial(THREE, { color: 0x0c0b0c, roughness: 0.99, metalness: 0 }),
    parchment: makeMaterial(THREE, { color: 0xe7d2a9, roughness: 0.88, metalness: 0 }),
    bookRed: makeMaterial(THREE, { color: 0x7a2329, roughness: 0.90, metalness: 0 }),
    bookTan: makeMaterial(THREE, { color: 0xa07143, roughness: 0.86, metalness: 0 }),
    boardLight: makeMaterial(THREE, { color: 0xd2b77c, roughness: 0.76, metalness: 0 }),
    boardDark: makeMaterial(THREE, { color: 0x59402d, roughness: 0.76, metalness: 0 }),
    pieceLight: makeMaterial(THREE, { color: 0xead7ad, roughness: 0.54, metalness: 0.03 }),
    pieceDark: makeMaterial(THREE, { color: 0x202024, roughness: 0.46, metalness: 0.16 }),
    ember: makeMaterial(THREE, { color: 0xff8a31, emissive: 0xff5314, emissiveIntensity: 3.2, roughness: 0.40 }),
    flame: makeMaterial(THREE, { color: 0xffdc8c, emissive: 0xff841f, emissiveIntensity: 5.2, roughness: 0.23 }),
  };

  const room = new THREE.Group();
  scene.add(room);

  addBox(THREE, room, [17.6, 9.6, 0.64], [0, 2.75, -4.38], materials.stone);
  addBox(THREE, room, [0.72, 9.5, 12.7], [-8.46, 2.45, 0.85], materials.stoneEdge);
  addBox(THREE, room, [0.72, 9.5, 12.7], [8.46, 2.45, 0.85], materials.stoneEdge);
  addBox(THREE, room, [17.7, 0.34, 12.8], [0, -1.13, 0.95], materials.stoneEdge);

  for (const z of [-3.0, -1.4, 0.2, 1.8, 3.4, 5.0]) {
    addBox(THREE, room, [17.0, 0.026, 0.05], [0, -0.95, z], materials.stone, [-Math.PI / 2, 0, 0]);
  }
  for (const x of [-6.6, -4.4, -2.2, 0, 2.2, 4.4, 6.6]) {
    addBox(THREE, room, [0.035, 0.03, 12.0], [x, -0.94, 0.8], materials.stone, [-Math.PI / 2, 0, 0]);
  }
  addBox(THREE, room, [4.2, 0.035, 11.4], [0, -0.90, 1.2], materials.runner);
  addBox(THREE, room, [0.055, 0.045, 11.5], [-2.18, -0.87, 1.2], materials.brass);
  addBox(THREE, room, [0.055, 0.045, 11.5], [2.18, -0.87, 1.2], materials.brass);

  const archXs = [-5.70, -2.86, 0, 2.86, 5.70];
  archXs.forEach((x) => addArchPortal(THREE, room, x, 2.22, materials));
  for (const x of [-7.25, -4.28, -1.43, 1.43, 4.28, 7.25]) {
    addBox(THREE, room, [0.58, 6.25, 0.76], [x, 2.08, -3.67], materials.stoneEdge);
    addBox(THREE, room, [0.86, 0.24, 0.88], [x, -0.82, -3.62], materials.stoneEdge);
  }

  addBalcony(THREE, room, materials);
  addChandelier(THREE, room, materials, -2.7, 5.02, -1.35, 0.82);
  addChandelier(THREE, room, materials, 2.7, 5.02, -1.35, 0.82);
  addRoomProps(THREE, room, materials, coarse);

  addSofa(THREE, room, materials);
  addArmour(THREE, room, -6.70, -0.05, -0.28, materials, 0.98, 0.18);
  addLion(THREE, room, materials);
  addChessBoard(THREE, room, 2.30, -0.82, 2.74, 0.90, materials, !coarse);

  const bannerPositions = [-7.35, -1.50, 1.50, 7.35];
  for (const x of bannerPositions) {
    addBox(THREE, room, [0.92, 2.58, 0.08], [x, 3.28, -3.12], materials.velvet);
    addBox(THREE, room, [1.04, 0.07, 0.12], [x, 4.64, -3.05], materials.brass);
  }

  const torchSpots = [
    [-7.58, 1.60, -3.10, 1], [-4.26, 1.52, -3.08, -1], [-1.42, 1.52, -3.08, 1],
    [1.42, 1.52, -3.08, -1], [4.26, 1.52, -3.08, 1], [7.58, 1.60, -3.10, -1],
  ];
  torchSpots.forEach((args, index) => addTorch(THREE, room, ...args, materials, !coarse || index % 2 === 0));

  scene.add(new THREE.HemisphereLight(0x6684a0, 0x2a160c, coarse ? 0.98 : 1.20));
  const warmKey = new THREE.DirectionalLight(0xe0aa6b, ambience === 'honour' ? 1.78 : 1.55);
  warmKey.position.set(-5.8, 8.0, 6.5);
  scene.add(warmKey);
  const moonRim = new THREE.DirectionalLight(0x79a3c4, coarse ? 0.52 : 0.68);
  moonRim.position.set(6.5, 6.6, -1.2);
  scene.add(moonRim);

  const foreground = new THREE.PointLight(0xffa154, coarse ? 1.12 : 1.55, 10.0, 1.55);
  foreground.position.set(1.6, 2.6, 4.8);
  scene.add(foreground);
  const sofaFill = new THREE.PointLight(0xffa45a, coarse ? 0.76 : 1.16, 8.8, 1.62);
  sofaFill.position.set(-4.8, 2.15, 3.2);
  scene.add(sofaFill);
  const lionFill = new THREE.PointLight(0xffa45a, coarse ? 0.70 : 1.08, 8.4, 1.62);
  lionFill.position.set(5.6, 2.0, 2.8);
  scene.add(lionFill);

  if (!coarse) {
    const leftChandelierGlow = new THREE.PointLight(0xffb45f, 1.75, 7.2, 1.55);
    leftChandelierGlow.position.set(-2.7, 4.55, -0.65);
    scene.add(leftChandelierGlow);
    const rightChandelierGlow = new THREE.PointLight(0xffb45f, 1.75, 7.2, 1.55);
    rightChandelierGlow.position.set(2.7, 4.55, -0.65);
    scene.add(rightChandelierGlow);
    scene.add(createDust(THREE, 64));
  }

  let renderRaf = 0;
  let lastWidth = 0;
  let lastHeight = 0;
  const renderScene = () => {
    renderRaf = 0;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    if (width !== lastWidth || height !== lastHeight) {
      lastWidth = width;
      lastHeight = height;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    renderer.render(scene, camera);
  };
  const scheduleRender = () => {
    if (renderRaf || document.hidden) return;
    renderRaf = window.requestAnimationFrame(renderScene);
  };

  const resizeObserver = new ResizeObserver(scheduleRender);
  resizeObserver.observe(host);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    if (entry?.isIntersecting) scheduleRender();
  }, { rootMargin: '160px' });
  intersectionObserver.observe(host);
  const onVisibility = () => { if (!document.hidden) scheduleRender(); };
  document.addEventListener('visibilitychange', onVisibility);

  renderScene();
  host.dataset.homeCastleHubReady = 'true';
  host.dataset.homeCastleHubRenderMode = 'on-demand';

  return () => {
    if (renderRaf) window.cancelAnimationFrame(renderRaf);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    scene.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((entry) => entry?.dispose?.());
      else object.material?.dispose?.();
    });
    renderer.dispose();
    renderer.forceContextLoss?.();
    canvas.remove();
  };
}

const ROOM_DEFS = Object.freeze([
  { id: 'play', glyph: '⚔', title: 'JUGAR', detail: 'Partida rápida o privada' },
  { id: 'tournament', glyph: '♛', title: 'TORNEOS', detail: 'Compite y escala' },
  { id: 'train', glyph: '▤', title: 'ENTRENAR', detail: 'Mejora tu juego' },
  { id: 'combat', glyph: '♞', title: 'COMBAT CHESS', detail: 'Recluta tu ejército' },
  { id: 'daily', glyph: '✦', title: 'DESAFÍO DIARIO', detail: 'Un nuevo reto cada día' },
]);

export default function HomeCastleHubScene({ ambience = 'quiet', hasSavedGame = false }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let cancelled = false;
    let dispose = () => {};
    void import('three').then((THREE) => {
      if (cancelled || !host.isConnected) return;
      dispose = buildCastleHubScene(THREE, { host, ambience });
    }).catch(() => {
      if (host.isConnected) host.dataset.homeCastleHubFallback = 'three-load-failed';
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, [ambience]);

  return (
    <div className="home-castle-hub" data-home-castle-hub="canonical-v1">
      <div
        ref={hostRef}
        className="home-great-hall-scene home-castle-hub__scene"
        data-home-scene="castle-hub-canonical-v1"
        data-home-scene-ambience={ambience || 'quiet'}
        aria-hidden="true"
      />
      <nav className="home-castle-hub__rooms" aria-label="Salas principales del castillo">
        {ROOM_DEFS.map((room) => {
          const title = room.id === 'play' && hasSavedGame ? 'CONTINUAR' : room.title;
          const detail = room.id === 'play' && hasSavedGame ? 'Vuelve a tu partida' : room.detail;
          return (
            <button
              type="button"
              key={room.id}
              className={`home-castle-hub__room home-castle-hub__room--${room.id}`}
              data-home-room={room.id}
              onClick={() => activateHomeCastleRoom(room.id)}
            >
              <span className="home-castle-hub__room-glyph" aria-hidden="true">{room.glyph}</span>
              <strong>{title}</strong>
              <small>{detail}</small>
              <i aria-hidden="true">→</i>
            </button>
          );
        })}
      </nav>
    </div>
  );
}