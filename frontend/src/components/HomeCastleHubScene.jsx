import { useEffect, useRef } from 'react';

const DESKTOP_DPR_CAP = 1.1;
const MOBILE_DPR_CAP = 1;

export const HOME_CASTLE_ROOM_TARGETS = Object.freeze({
  play: ['.home-continue-card', '.home-mode-quick'],
  tournament: ['.home-mode-featured'],
  train: ['.home-school-card'],
  combat: ['.home-mode-campaign'],
  daily: ['.home-today-actions button'],
});

export function homeBoardSquareLayout(square = 0.38) {
  const light = [];
  const dark = [];
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const position = [(file - 3.5) * square, 0.91, (rank - 3.5) * square];
      ((rank + file) % 2 === 0 ? light : dark).push(position);
    }
  }
  return { light, dark };
}

export function homeCastleWarmKeyIntensity(ambience = 'quiet') {
  return ambience === 'honour' ? 1.78 : 1.55;
}

function firstMatchingTarget(selectors, root = document) {
  for (const selector of selectors || []) {
    const element = root.querySelector(selector);
    if (element) return element;
  }
  return null;
}

export function activateHomeCastleRoom(roomId, root = document) {
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

function addBeamBetween(THREE, parent, from, to, thickness, depth, material, z) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  const mesh = addBox(
    THREE,
    parent,
    [length, thickness, depth],
    [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, z],
    material,
  );
  mesh.rotation.z = Math.atan2(dy, dx);
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

function addArchPortal(THREE, parent, x, width, materials, coarse = false) {
  const { stone, stoneEdge, dark, oak, oakEdge, iron, brass } = materials;
  const group = new THREE.Group();
  group.position.set(x, 0, 0);
  parent.add(group);

  const half = width / 2;
  const outerHalf = half + 0.10;
  const innerHalf = half - 0.20;
  const sillY = -0.76;
  const springY = 2.80;
  const apexY = 4.28;
  const innerApexY = 4.02;

  // A real recessed opening, so props in front naturally occlude the door.
  const recessShape = new THREE.Shape();
  recessShape.moveTo(-innerHalf - 0.08, sillY + 0.04);
  recessShape.lineTo(innerHalf + 0.08, sillY + 0.04);
  recessShape.lineTo(innerHalf + 0.08, springY - 0.10);
  recessShape.lineTo(0, innerApexY + 0.04);
  recessShape.lineTo(-innerHalf - 0.08, springY - 0.10);
  recessShape.closePath();
  const recessGeometry = new THREE.ExtrudeGeometry(recessShape, {
    depth: 0.10,
    bevelEnabled: false,
    curveSegments: 1,
  });
  const recess = new THREE.Mesh(recessGeometry, dark);
  recess.position.z = -4.06;
  group.add(recess);

  // Pointed oak door lives inside the stone reveal instead of on top of the UI.
  const doorShape = new THREE.Shape();
  doorShape.moveTo(-innerHalf, sillY + 0.10);
  doorShape.lineTo(innerHalf, sillY + 0.10);
  doorShape.lineTo(innerHalf, springY - 0.18);
  doorShape.lineTo(0, innerApexY - 0.08);
  doorShape.lineTo(-innerHalf, springY - 0.18);
  doorShape.closePath();
  const doorGeometry = new THREE.ExtrudeGeometry(doorShape, {
    depth: 0.15,
    bevelEnabled: false,
    curveSegments: 1,
  });
  const door = new THREE.Mesh(doorGeometry, oak);
  door.position.z = -3.98;
  group.add(door);

  // Massive jambs and threshold tie each opening into the existing masonry.
  const jambHeight = springY - sillY + 0.10;
  const jambY = sillY + jambHeight / 2;
  addBox(THREE, group, [0.34, jambHeight, 0.72], [-outerHalf, jambY, -3.72], stoneEdge);
  addBox(THREE, group, [0.34, jambHeight, 0.72], [outerHalf, jambY, -3.72], stoneEdge);
  addBox(THREE, group, [width + 0.54, 0.24, 0.82], [0, sillY - 0.02, -3.70], stoneEdge);

  // Gothic crown: two structural stone courses instead of the old semicircle.
  addBeamBetween(THREE, group, [-outerHalf, springY], [0, apexY], 0.30, 0.72, stoneEdge, -3.72);
  addBeamBetween(THREE, group, [0, apexY], [outerHalf, springY], 0.30, 0.72, stoneEdge, -3.72);
  addBeamBetween(THREE, group, [-innerHalf - 0.04, springY - 0.12], [0, innerApexY], 0.12, 0.80, stone, -3.60);
  addBeamBetween(THREE, group, [0, innerApexY], [innerHalf + 0.04, springY - 0.12], 0.12, 0.80, stone, -3.60);

  for (const side of [-1, 1]) {
    addBox(THREE, group, [0.58, 0.16, 0.84], [side * outerHalf, springY - 0.03, -3.62], stoneEdge);
    addBox(THREE, group, [0.58, 0.20, 0.84], [side * outerHalf, sillY - 0.02, -3.62], stoneEdge);
  }

  // Teutonic carved apex/keystone, restrained enough to repeat five times.
  const crown = addBox(THREE, group, [0.28, 0.28, 0.18], [0, apexY - 0.08, -3.34], stoneEdge, [0, 0, Math.PI / 4]);
  crown.scale.y = 1.18;
  if (!coarse) addSphere(THREE, group, 0.055, [0, apexY - 0.08, -3.22], brass, 8, 6, [1, 1, 0.36]);

  // Forged hardware belongs to the 3D door and therefore receives hall light.
  addBox(THREE, group, [0.060, 3.20, 0.075], [0, 0.96, -3.76], iron);
  for (const y of [0.22, 1.18, 2.10]) {
    addBox(THREE, group, [width - 0.54, 0.075, 0.075], [0, y, -3.76], iron);
  }
  addSphere(THREE, group, 0.10, [0, 1.18, -3.66], brass, 9, 7, [1, 1, 0.34]);

  if (!coarse) {
    const studX = innerHalf - 0.19;
    for (const y of [0.22, 1.18, 2.10]) {
      addSphere(THREE, group, 0.043, [-studX, y, -3.66], brass, 7, 5, [1, 1, 0.30]);
      addSphere(THREE, group, 0.043, [studX, y, -3.66], brass, 7, 5, [1, 1, 0.30]);
    }
    addBox(THREE, group, [0.045, 3.08, 0.05], [-innerHalf * 0.42, 0.96, -3.75], oakEdge);
    addBox(THREE, group, [0.045, 3.08, 0.05], [innerHalf * 0.42, 0.96, -3.75], oakEdge);
  }

  group.userData.homePortalArchitecture = 'integrated-teutonic-v3';
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

function addDungeonStair(THREE, parent, materials) {
  const { stoneEdge, dark, iron, brass } = materials;
  const stair = new THREE.Group();
  stair.name = 'home-castle-dungeon-stair';
  stair.position.set(-6.92, -0.89, 3.92);
  stair.rotation.y = -0.16;
  parent.add(stair);

  // Dark well first: it must read as a hole in the castle, not a glowing UI
  // ornament. The old brass is used only for tiny edge catches.
  addCylinder(THREE, stair, 1.02, 1.08, 0.13, [0, -0.02, 0], dark, 24);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.11, 8, 28), stoneEdge);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.045;
  stair.add(rim);

  const stepCount = 11;
  for (let index = 0; index < stepCount; index += 1) {
    const angle = -0.28 - index * 0.43;
    const radius = 0.63;
    const step = addBox(
      THREE,
      stair,
      [0.68, 0.075, 0.34],
      [Math.cos(angle) * radius, -0.05 - index * 0.075, Math.sin(angle) * radius],
      stoneEdge,
      [0, -angle + Math.PI / 2, 0],
    );
    step.userData.homeDungeonStep = index + 1;
  }

  addCylinder(THREE, stair, 0.045, 0.055, 1.16, [0, -0.46, 0], iron, 8);
  addSphere(THREE, stair, 0.075, [0, 0.14, 0], brass, 8, 6, [1, 1, 1]);
  stair.userData.homeDungeonStair = 'spiral-stone-v1';
  return stair;
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

  // Sixty-four individual square meshes were pure draw-call/build churn. Keep
  // exactly the same geometry/materials but instance each colour in one batch.
  const square = 0.38;
  const squareGeometry = new THREE.BoxGeometry(square, 0.035, square);
  const squareLayout = homeBoardSquareLayout(square);
  const scratchMatrix = new THREE.Matrix4();
  for (const [positions, material] of [[squareLayout.light, boardLight], [squareLayout.dark, boardDark]]) {
    const squares = new THREE.InstancedMesh(squareGeometry, material, positions.length);
    positions.forEach((position, index) => {
      scratchMatrix.makeTranslation(...position);
      squares.setMatrixAt(index, scratchMatrix);
    });
    squares.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    squares.instanceMatrix.needsUpdate = true;
    squares.userData.homeBoardSquares = 'instanced-v1';
    table.add(squares);
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
    return { setAmbience() {}, dispose() {} };
  }

  renderer.setClearColor(0x050607, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = coarse ? 1.10 : 1.18;
  renderer.shadowMap.enabled = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? MOBILE_DPR_CAP : DESKTOP_DPR_CAP));
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  // Desktop is deliberately almost frontal. A low FOV and long camera remove
  // the old doll-house / tipped-floor read while preserving genuine depth.
  const camera = new THREE.PerspectiveCamera(coarse ? 49 : 31, 1, 0.1, 60);
  camera.position.set(0, coarse ? 4.20 : 2.78, coarse ? 13.9 : 14.45);
  camera.lookAt(0, coarse ? 1.55 : 2.12, coarse ? -0.55 : -1.18);

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
  archXs.forEach((x) => addArchPortal(THREE, room, x, 2.22, materials, coarse));
  for (const x of [-7.25, -4.28, -1.43, 1.43, 4.28, 7.25]) {
    addBox(THREE, room, [0.58, 6.25, 0.76], [x, 2.08, -3.67], materials.stoneEdge);
    addBox(THREE, room, [0.86, 0.24, 0.88], [x, -0.82, -3.62], materials.stoneEdge);
    addBox(THREE, room, [0.96, 0.22, 0.90], [x, 4.12, -3.62], materials.stoneEdge);
  }

  addBalcony(THREE, room, materials);
  addChandelier(THREE, room, materials, -2.7, 5.02, -1.35, 0.82);
  addChandelier(THREE, room, materials, 2.7, 5.02, -1.35, 0.82);
  addRoomProps(THREE, room, materials, coarse);

  addSofa(THREE, room, materials);
  if (!coarse) addDungeonStair(THREE, room, materials);
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
  const warmKey = new THREE.DirectionalLight(0xe0aa6b, homeCastleWarmKeyIntensity(ambience));
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

  let resizeObserver = null;
  let resizeFallback = null;
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(scheduleRender);
    resizeObserver.observe(host);
  } else {
    resizeFallback = scheduleRender;
    window.addEventListener('resize', resizeFallback);
  }

  let intersectionObserver = null;
  if (typeof IntersectionObserver === 'function') {
    intersectionObserver = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) scheduleRender();
    }, { rootMargin: '160px' });
    intersectionObserver.observe(host);
  }

  const onVisibility = () => { if (!document.hidden) scheduleRender(); };
  document.addEventListener('visibilitychange', onVisibility);

  renderScene();
  host.dataset.homeCastleHubReady = 'true';
  host.dataset.homeCastleHubRenderMode = 'on-demand';
  host.dataset.homeCastleHubArchitecture = 'integrated-teutonic-v4-immersive';
  host.dataset.homeCastleHubBoardSquares = 'instanced-2-draws-per-board';
  host.dataset.homeCastleHubCamera = coarse ? 'mobile-existing-v1' : 'frontal-diorama-v1';
  host.dataset.homeCastleHubDungeonStair = coarse ? 'omitted-mobile' : 'spiral-stone-v1';

  const setAmbience = (nextAmbience) => {
    const nextIntensity = homeCastleWarmKeyIntensity(nextAmbience);
    if (warmKey.intensity === nextIntensity) return;
    warmKey.intensity = nextIntensity;
    scheduleRender();
  };

  const dispose = () => {
    if (renderRaf) window.cancelAnimationFrame(renderRaf);
    resizeObserver?.disconnect?.();
    intersectionObserver?.disconnect?.();
    if (resizeFallback) window.removeEventListener('resize', resizeFallback);
    document.removeEventListener('visibilitychange', onVisibility);

    // Materials/geometries are intentionally shared by instancing and across
    // many static meshes. Dispose each GPU resource once, not once per owner.
    const geometries = new Set();
    const materialsToDispose = new Set();
    scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (Array.isArray(object.material)) object.material.forEach((entry) => { if (entry) materialsToDispose.add(entry); });
      else if (object.material) materialsToDispose.add(object.material);
    });
    geometries.forEach((geometry) => geometry.dispose?.());
    materialsToDispose.forEach((material) => material.dispose?.());
    renderer.dispose();
    renderer.forceContextLoss?.();
    canvas.remove();
  };

  return { setAmbience, dispose };
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
  const controllerRef = useRef(null);
  const ambienceRef = useRef(ambience);
  ambienceRef.current = ambience;

  // Build the expensive static hall once. Ambience changes only mutate the
  // warm key and schedule one render; they must never rebuild the castle.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let cancelled = false;
    void import('three').then((THREE) => {
      if (cancelled || !host.isConnected) return;
      const controller = buildCastleHubScene(THREE, { host, ambience: ambienceRef.current });
      if (cancelled || !host.isConnected) {
        controller.dispose();
        return;
      }
      controllerRef.current = controller;
      controller.setAmbience(ambienceRef.current);
    }).catch(() => {
      if (host.isConnected) host.dataset.homeCastleHubFallback = 'three-load-failed';
    });
    return () => {
      cancelled = true;
      controllerRef.current?.dispose?.();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setAmbience?.(ambience);
  }, [ambience]);

  return (
    <div className="home-castle-hub" data-home-castle-hub="canonical-v2">
      <div
        ref={hostRef}
        className="home-great-hall-scene home-castle-hub__scene"
        data-home-scene="castle-hub-canonical-v2"
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
