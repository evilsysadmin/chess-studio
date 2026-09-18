import * as THREE from 'three';

export const WAR_ROOM_VISUAL_CANON_VERSION = 'cinematic-gothic-study-2026-09-18-v1';

const C = Object.freeze({
  stone: 0x6d6254, stoneDark: 0x2b2622, walnut: 0x3a2114, walnutDark: 0x1c100b,
  burgundy: 0x681922, brass: 0xb98a3a, brassDark: 0x75501f,
  steel: 0x6f7476, steelDark: 0x2f3437, ivory: 0xdccfb4,
  glass: 0x31566d, fire: 0xff6b18, fireHot: 0xffc15d,
});

function mat(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.05,
    roughness: options.roughness ?? 0.62,
    clearcoat: options.clearcoat ?? 0.16,
    clearcoatRoughness: 0.28,
    sheen: options.sheen ?? 0,
    sheenColor: new THREE.Color(options.sheenColor ?? color),
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.opacity != null && options.opacity < 1,
    opacity: options.opacity ?? 1,
  });
}

function mesh(group, geometry, material, position, name = '', rotation = [0, 0, 0], scale = null) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(...position);
  item.rotation.set(...rotation);
  if (scale) item.scale.set(...scale);
  item.castShadow = true;
  item.receiveShadow = true;
  if (name) item.name = name;
  group.add(item);
  return item;
}

function box(group, size, material, position, name = '') {
  return mesh(group, new THREE.BoxGeometry(...size), material, position, name);
}

function instance(meshObject, index, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const dummy = new THREE.Object3D();
  dummy.position.set(...position);
  dummy.scale.set(...scale);
  dummy.rotation.set(...rotation);
  dummy.updateMatrix();
  meshObject.setMatrixAt(index, dummy.matrix);
}

function finish(meshObject, name) {
  meshObject.name = name;
  meshObject.instanceMatrix.needsUpdate = true;
  meshObject.castShadow = true;
  meshObject.receiveShadow = true;
  return meshObject;
}

function bannerGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.43, 0.95);
  shape.lineTo(0.43, 0.95);
  shape.lineTo(0.43, -0.56);
  shape.lineTo(0, -0.9);
  shape.lineTo(-0.43, -0.56);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.01, bevelSegments: 1,
  });
  geometry.center();
  return geometry;
}

function addBanners(group, wallZ, towardBoard, coarse) {
  const xs = coarse ? [-4.4, 0, 4.4] : [-6.2, -3.1, 0, 3.1, 6.2];
  const red = mat(C.burgundy, { roughness: 0.86, sheen: 0.5, sheenColor: 0xa34b56 });
  const brass = mat(C.brass, { metalness: 0.8, roughness: 0.28 });
  const z = wallZ + towardBoard * 0.44;

  const cloth = new THREE.InstancedMesh(bannerGeometry(), red, xs.length);
  const rods = new THREE.InstancedMesh(new THREE.BoxGeometry(1.02, 0.08, 0.08), brass, xs.length);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, coarse ? 10 : 16, coarse ? 7 : 10), brass, xs.length);
  const crossesV = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.26, 0.05), brass, xs.length);

  xs.forEach((x, i) => {
    instance(cloth, i, [x, 4.18, z]);
    instance(rods, i, [x, 5.14, z]);
    instance(heads, i, [x - 0.04, 4.46, z + towardBoard * 0.05], [1, 1.16, 0.34]);
    instance(crossesV, i, [x, 3.62, z + towardBoard * 0.06]);
  });
  group.add(
    finish(cloth, 'war-room-canon-banners'),
    finish(rods, 'war-room-canon-banner-rods'),
    finish(heads, 'war-room-canon-banner-horse-heads'),
    finish(crossesV, 'war-room-canon-banner-crosses-v'),
  );
}

function addBookshelf(group, wallZ, towardBoard, coarse) {
  const shelf = new THREE.Group();
  shelf.name = 'war-room-canon-bookshelf';
  shelf.position.set(-2.65, 0, wallZ + towardBoard * 0.7);
  const wood = mat(C.walnut, { roughness: 0.52, clearcoat: 0.28 });
  const dark = mat(C.walnutDark, { roughness: 0.72 });
  box(shelf, [2.45, 4.15, 0.28], dark, [0, 2.4, 0], 'war-room-canon-bookshelf-back');
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 4.35, 0.42), wood, 2);
  instance(posts, 0, [-1.12, 2.4, 0]);
  instance(posts, 1, [1.12, 2.4, 0]);
  shelf.add(finish(posts, 'war-room-canon-bookshelf-posts'));
  const count = coarse ? 4 : 6;
  const shelves = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 0.1, 0.48), wood, count);
  for (let i = 0; i < count; i += 1) instance(shelves, i, [0, 0.48 + i * 0.68, -towardBoard * 0.05]);
  shelf.add(finish(shelves, 'war-room-canon-bookshelf-shelves'));
  const books = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.44, 0.26), mat(0x5e2b25, { roughness: 0.8 }), coarse ? 10 : 20);
  const total = coarse ? 10 : 20;
  for (let i = 0; i < total; i += 1) {
    const row = i % Math.max(1, count - 1);
    const col = Math.floor(i / Math.max(1, count - 1));
    instance(books, i, [-0.92 + col * 0.45, 0.78 + row * 0.68, -towardBoard * 0.18], [0.85 + (i % 3) * 0.08, 0.9 + (i % 2) * 0.1, 1]);
  }
  shelf.add(finish(books, 'war-room-canon-books'));
  group.add(shelf);
}

function addChandelier(group, coarse) {
  const brass = mat(C.brass, { metalness: 0.82, roughness: 0.24 });
  const wax = mat(C.ivory, { roughness: 0.66 });
  const flameMat = mat(C.fireHot, { roughness: 0.2, emissive: C.fire, emissiveIntensity: 2.2 });
  const fixture = new THREE.Group();
  fixture.name = 'war-room-canon-chandelier';
  mesh(fixture, new THREE.TorusGeometry(2.05, 0.07, 10, coarse ? 28 : 44), brass, [0, 4.95, 0], 'war-room-canon-chandelier-ring', [Math.PI / 2, 0, 0]);
  const n = coarse ? 4 : 8;
  const candles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.075, 0.42, 10), wax, n);
  const flames = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.18, 10), flameMat, n);
  for (let i = 0; i < n; i += 1) {
    const angle = i * Math.PI * 2 / n;
    const x = Math.cos(angle) * 1.72;
    const z = Math.sin(angle) * 1.38;
    instance(candles, i, [x, 5.18, z]);
    instance(flames, i, [x, 5.48, z]);
  }
  fixture.add(finish(candles, 'war-room-canon-chandelier-candles'), finish(flames, 'war-room-canon-chandelier-flames'));
  group.add(fixture);
}

function addRightFireplace(group, wallZ, towardBoard, coarse) {
  const fire = new THREE.Group();
  fire.name = 'war-room-canon-right-fireplace';
  fire.position.set(4.75, 0, wallZ + towardBoard * 0.72);
  const stone = mat(C.stone, { roughness: 0.84 });
  const dark = mat(C.stoneDark, { roughness: 0.95 });
  const flameMat = mat(C.fireHot, { roughness: 0.18, emissive: C.fire, emissiveIntensity: 2.5 });
  box(fire, [2.7, 2.75, 0.34], stone, [0, 1.4, 0], 'war-room-canon-right-fireplace-body');
  box(fire, [1.92, 1.6, 0.18], dark, [0, 0.88, -towardBoard * 0.2], 'war-room-canon-right-fireplace-recess');
  box(fire, [3.0, 0.2, 0.6], stone, [0, 2.8, 0], 'war-room-canon-right-fireplace-mantel');
  const n = coarse ? 3 : 5;
  const flames = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.58, 12), flameMat, n);
  for (let i = 0; i < n; i += 1) instance(flames, i, [(i - (n - 1) / 2) * 0.32, 0.58 + (i % 2) * 0.08, -towardBoard * 0.32]);
  fire.add(finish(flames, 'war-room-canon-right-fireplace-flames'));
  group.add(fire);
}

function addWindowGlobeAndDescent(group, wallZ, towardBoard, coarse) {
  const brass = mat(C.brassDark, { metalness: 0.72, roughness: 0.34 });
  const stone = mat(C.stone, { roughness: 0.86 });
  const window = new THREE.Group();
  window.name = 'war-room-canon-right-window';
  window.position.set(6.72, 0, wallZ + towardBoard * 0.46);
  box(window, [1.5, 3.35, 0.11], mat(C.glass, { roughness: 0.2, emissive: 0x16374d, emissiveIntensity: 0.26 }), [0, 3.18, 0], 'war-room-canon-window-glass');
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.055, 3.0, 0.05), brass, 3);
  [-0.48, 0, 0.48].forEach((x, i) => instance(bars, i, [x, 3.18, towardBoard * 0.08]));
  window.add(finish(bars, 'war-room-canon-window-mullions'));
  group.add(window);

  const globe = new THREE.Group();
  globe.name = 'war-room-canon-floor-globe';
  globe.position.set(6.1, 0, wallZ + towardBoard * 2.1);
  mesh(globe, new THREE.SphereGeometry(0.58, coarse ? 14 : 24, coarse ? 9 : 16), mat(0x8a7b58, { roughness: 0.62 }), [0, 1.28, 0], 'war-room-canon-globe-sphere');
  mesh(globe, new THREE.TorusGeometry(0.69, 0.035, 8, coarse ? 22 : 34), brass, [0, 1.28, 0], 'war-room-canon-globe-ring');
  mesh(globe, new THREE.CylinderGeometry(0.13, 0.21, 0.72, 14), brass, [0, 0.58, 0], 'war-room-canon-globe-stand');
  group.add(globe);


}

function addCentralArmor(group, wallZ, towardBoard, coarse) {
  if (coarse) return;
  const armor = new THREE.Group();
  armor.name = 'war-room-canon-central-armor';
  armor.position.set(1.15, 0, wallZ + towardBoard * 0.96);
  const steel = mat(C.steel, { metalness: 0.78, roughness: 0.3 });
  const dark = mat(C.steelDark, { metalness: 0.64, roughness: 0.42 });
  const legs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 0.86, 14), dark, 2);
  instance(legs, 0, [-0.17, 0.63, 0]); instance(legs, 1, [0.17, 0.63, 0]);
  armor.add(finish(legs, 'war-room-canon-central-armor-legs'));
  mesh(armor, new THREE.CylinderGeometry(0.36, 0.48, 0.92, 18), steel, [0, 1.48, 0], 'war-room-canon-central-armor-cuirass');
  mesh(armor, new THREE.SphereGeometry(0.28, 18, 12), steel, [0, 2.14, 0], 'war-room-canon-central-armor-helmet', [0, 0, 0], [1, 0.92, 1]);
  box(armor, [0.44, 0.08, 0.12], dark, [0, 2.12, towardBoard * 0.23], 'war-room-canon-central-armor-visor');
  group.add(armor);
}

export function addWarRoomCanonStudyLayer(group, { wallZ, towardBoard, coarsePointer = false } = {}) {
  if (!group || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return null;
  const canon = new THREE.Group();
  canon.name = 'war-room-canon-2026-09-18';
  canon.userData.warRoomVisualCanon = WAR_ROOM_VISUAL_CANON_VERSION;
  addBanners(canon, wallZ, towardBoard, coarsePointer);
  if (!coarsePointer) addBookshelf(canon, wallZ, towardBoard, coarsePointer);
  addChandelier(canon, coarsePointer);
  addRightFireplace(canon, wallZ, towardBoard, coarsePointer);
  addWindowGlobeAndDescent(canon, wallZ, towardBoard, coarsePointer);
  group.add(canon);
  group.userData.warRoomVisualCanon = WAR_ROOM_VISUAL_CANON_VERSION;
  return canon;
}

function addDrape(group, z, facing, coarse) {
  const shape = new THREE.Shape();
  shape.moveTo(-1.7, 0.52); shape.lineTo(1.7, 0.52); shape.lineTo(1.7, -0.42);
  shape.lineTo(0, -0.78); shape.lineTo(-1.7, -0.42); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.01, bevelSegments: 1,
  });
  geometry.center();
  const brass = mat(C.brass, { metalness: 0.78, roughness: 0.28 });
  mesh(group, geometry, mat(C.burgundy, { roughness: 0.84, sheen: 0.5, sheenColor: 0xa34954 }), [0, -0.69, z],
    facing < 0 ? 'war-room-canon-table-drape-near' : 'war-room-canon-table-drape-far',
    [0, facing < 0 ? Math.PI : 0, 0]);
  const emblem = new THREE.Group();
  emblem.name = facing < 0 ? 'war-room-canon-table-horse-near' : 'war-room-canon-table-horse-far';
  emblem.position.set(0, -0.67, z + facing * 0.065);
  emblem.rotation.y = facing < 0 ? Math.PI : 0;
  mesh(emblem, new THREE.SphereGeometry(0.26, coarse ? 10 : 16, coarse ? 7 : 10), brass, [-0.08, 0.08, 0], '', [0, 0, 0], [1, 1.12, 0.34]);
  box(emblem, [0.22, 0.11, 0.06], brass, [-0.27, 0.01, 0]);
  group.add(emblem);
}

export function addWarRoomCanonTableLayer(group, { coarsePointer = false } = {}) {
  if (!group) return group;
  addDrape(group, -5.29, -1, coarsePointer);
  group.userData.warRoomVisualCanon = WAR_ROOM_VISUAL_CANON_VERSION;
  return group;
}
