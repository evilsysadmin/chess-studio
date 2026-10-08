import * as THREE from 'three';

export const SCHOOL_ROOM_SCENE_VERSION = 'school-room-war-room-v1';

function mat(color, metalness = 0.04, roughness = 0.74) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function boxGeometryKey(size) {
  return size.map((value) => Number(value).toFixed(4)).join('x');
}

function box(root, size, material, position, name = '', geometryPool = null) {
  const key = boxGeometryKey(size);
  let geometry = geometryPool?.get(key) || null;
  if (!geometry) {
    geometry = new THREE.BoxGeometry(...size);
    if (geometryPool) geometryPool.set(key, geometry);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = name;
  root.add(mesh);
  return mesh;
}

function desk(root, x, z, far, wood, brass, index, geometryPool) {
  const group = new THREE.Group();
  group.name = `school-desk-${index}`;
  box(group, [2.2, .16, .96], wood, [0, .82, 0], 'desktop', geometryPool);
  box(group, [2.0, .5, .1], wood, [0, .54, far * .39], 'desk-front', geometryPool);
  for (const dx of [-.82, .82]) for (const dz of [-.31, .31]) box(group, [.1, .72, .1], wood, [dx, .38, dz], 'desk-leg', geometryPool);
  box(group, [1.25, .12, .62], wood, [0, .43, -far * .94], 'chair-seat', geometryPool);
  box(group, [1.25, .7, .1], wood, [0, .79, -far * 1.2], 'chair-back', geometryPool);
  box(group, [.5, .04, .32], brass, [-.55, .93, -.04 * far], 'desk-book', geometryPool);
  group.position.set(x, -.03, z);
  root.add(group);
}

function bookcase(root, x, wallZ, toward, wood, brass, books, lite, geometryPool) {
  const group = new THREE.Group();
  group.name = x < 0 ? 'school-bookcase-left' : 'school-bookcase-right';
  box(group, [2.2, 4.55, .38], wood, [0, 2.25, 0], 'bookcase-back', geometryPool);
  for (let row = 0; row < 5; row += 1) {
    const y = .42 + row * .88;
    box(group, [2.3, .1, .58], wood, [0, y, toward * .08], 'bookcase-shelf', geometryPool);
    const count = lite ? 3 : 5;
    for (let i = 0; i < count; i += 1) {
      box(group, [.2, .48 + ((row + i) % 3) * .07, .32], books[(row + i) % books.length], [-.72 + i * (lite ? .58 : .34), y + .37, toward * .18], 'school-book', geometryPool);
    }
  }
  box(group, [2.42, .1, .62], brass, [0, 4.52, toward * .1], 'bookcase-cornice', geometryPool);
  group.position.set(x, 0, wallZ + toward * .58);
  root.add(group);
}

function chalkboard(root, wallZ, toward, green, wood, brass, geometryPool) {
  const z = wallZ + toward * .66;
  box(root, [7.0, 3.0, .18], green, [0, 3.35, z], 'school-chalkboard', geometryPool);
  box(root, [7.28, .15, .26], wood, [0, 4.92, z + toward * .04], 'chalkboard-top', geometryPool);
  box(root, [7.28, .15, .26], wood, [0, 1.78, z + toward * .04], 'chalkboard-bottom', geometryPool);
  box(root, [.15, 3.28, .26], wood, [-3.57, 3.35, z + toward * .04], 'chalkboard-left', geometryPool);
  box(root, [.15, 3.28, .26], wood, [3.57, 3.35, z + toward * .04], 'chalkboard-right', geometryPool);

  const pts = [];
  const startX = -1.25, startY = 2.28, step = .31;
  for (let i = 0; i <= 8; i += 1) {
    const p = i * step;
    pts.push(startX + p, startY, z + toward * .12, startX + p, startY + step * 8, z + toward * .12);
    pts.push(startX, startY + p, z + toward * .12, startX + step * 8, startY + p, z + toward * .12);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const grid = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xd4cdb4, transparent: true, opacity: .62 }));
  grid.name = 'school-chalk-diagram';
  root.add(grid);
  box(root, [.8, .07, .16], brass, [2.45, 1.68, z + toward * .14], 'chalk-tray', geometryPool);
}

export function buildSchoolRoomLayer(theme, whiteSide, coarsePointer = false) {
  const root = new THREE.Group();
  const geometryPool = new Map();
  const pooledBox = (target, size, material, position, name = '') => (
    box(target, size, material, position, name, geometryPool)
  );
  root.name = 'matthias-school-room-layer';
  root.userData.schoolRoomSceneVersion = SCHOOL_ROOM_SCENE_VERSION;
  root.userData.schoolRoomCanonical = true;

  const far = whiteSide ? -1 : 1;
  const toward = -far;
  const wallZ = far * 7.28;
  const lite = Boolean(coarsePointer);
  const wood = mat(theme?.frame ?? 0x24130c, .05, .7);
  const woodDark = mat(0x160d09, .02, .82);
  const stone = mat(0x574d44, .01, .9);
  const brass = mat(0xa77a2d, .68, .3);
  const green = mat(0x142921, .01, .94);
  const cloth = mat(0x17372d, .01, .92);
  const books = [mat(0x4b211b), mat(0x243c46), mat(0x5b4826), mat(0x302c20)];

  pooledBox(root, [20, .28, 19], stone, [0, -.59, 0], 'school-floor');
  pooledBox(root, [18.2, 6.5, .34], stone, [0, 2.58, wallZ], 'school-back-wall');
  pooledBox(root, [18, 1.3, .4], woodDark, [0, .53, wallZ + toward * .16], 'school-wainscot');
  pooledBox(root, [11.8, .05, 7.6], mat(0x3a1b14, .01, .92), [0, -.42, far * 1.05], 'school-rug');

  chalkboard(root, wallZ, toward, green, wood, brass, geometryPool);
  bookcase(root, -6.1, wallZ, toward, wood, brass, books, lite, geometryPool);
  bookcase(root, 6.1, wallZ, toward, wood, brass, books, lite, geometryPool);

  pooledBox(root, [4.15, .2, .78], wood, [0, .92, far * 6.15], 'teacher-desk');
  pooledBox(root, [3.7, .82, .16], wood, [0, .48, far * 6.48], 'teacher-desk-front');
  pooledBox(root, [.72, .05, .44], brass, [-1.05, 1.05, far * 6.0], 'teacher-book');

  for (const x of [-4.6, 4.6]) {
    pooledBox(root, [1.5, 2.35, .1], cloth, [x, 3.65, wallZ + toward * .66], 'school-banner');
    pooledBox(root, [1.68, .08, .16], brass, [x, 4.88, wallZ + toward * .72], 'school-banner-rail');
  }

  const rows = lite ? [2.4, 4.55] : [1.85, 3.65, 5.2];
  let count = 0;
  for (const row of rows) for (const x of [-7.05, 7.05]) desk(root, x, far * row, far, wood, brass, count++, geometryPool);

  if (!lite) {
    pooledBox(root, [2.0, 2.65, .7], stone, [7.05, 1.28, far * 5.45], 'school-fireplace');
    pooledBox(root, [1.12, 1.3, .18], new THREE.MeshBasicMaterial({ color: 0x120906 }), [7.05, .72, far * 5.82], 'school-hearth');
    pooledBox(root, [2.32, .17, .86], wood, [7.05, 2.55, far * 5.53], 'school-mantel');
    const fire = new THREE.PointLight(0xff8b3d, 1.1, 7.2, 2);
    fire.position.set(7.05, 1.0, far * 6.0);
    fire.castShadow = false;
    fire.name = 'school-firelight';
    root.add(fire);
  }

  const ring = new THREE.Mesh(new THREE.TorusGeometry(lite ? 1.3 : 1.7, .065, 10, lite ? 24 : 36), brass);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 5.65, far * 1.5);
  ring.name = 'school-chandelier';
  ring.castShadow = false;
  root.add(ring);

  const warm = new THREE.PointLight(0xffcb82, lite ? .52 : .78, 12, 2);
  warm.position.set(0, 5.25, far * 1.45);
  warm.castShadow = false;
  root.add(warm);
  const cool = new THREE.PointLight(0x87a4c8, lite ? .34 : .46, 15, 2);
  cool.position.set(-5.8, 4.6, toward * 5.2);
  cool.castShadow = false;
  root.add(cool);

  let renderedBoxMeshes = 0;
  root.traverse((object) => {
    if (object.isMesh && object.geometry?.type === 'BoxGeometry') renderedBoxMeshes += 1;
  });
  root.userData.schoolRoomDeskCount = count;
  root.userData.schoolRoomRenderLite = lite;
  root.userData.schoolRoomBoxMeshCount = renderedBoxMeshes;
  root.userData.schoolRoomBoxGeometryCount = geometryPool.size;
  root.userData.schoolRoomGeometryPool = 'box-dimensions-v1';
  return root;
}
