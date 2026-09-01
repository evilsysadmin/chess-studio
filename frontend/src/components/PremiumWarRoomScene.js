import * as THREE from 'three';

const COLORS = Object.freeze({
  walnut: 0x3a2114,
  walnutDark: 0x160c08,
  walnutWarm: 0x5a321c,
  brass: 0xc5963f,
  brassDark: 0x76501f,
  ivory: 0xeadbbd,
  burgundy: 0x5b2028,
  burgundyDark: 0x2e1015,
  bottleGreen: 0x173c31,
  teal: 0x173943,
  parchment: 0xcab98e,
  charcoal: 0x11151c,
});

function material(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.08,
    roughness: options.roughness ?? 0.56,
    clearcoat: options.clearcoat ?? 0.28,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.2,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.opacity != null && options.opacity < 1,
    opacity: options.opacity ?? 1,
  });
}

function addMesh(group, geometry, mat, position, rotation = [0, 0, 0], scale = null) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addBox(group, size, color, position, options = {}) {
  const mesh = addMesh(
    group,
    new THREE.BoxGeometry(...size),
    material(color, options),
    position,
    options.rotation || [0, 0, 0],
  );
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

function addBookStack(group, x, y, z, flip = false, compact = false) {
  const palette = [COLORS.bottleGreen, COLORS.burgundy, 0x29394b, 0x533623, 0x4d4a2c, 0x30233e];
  const count = compact ? 4 : 7;
  for (let index = 0; index < count; index += 1) {
    const width = 0.48 + (index % 3) * 0.1;
    const height = 0.1 + (index % 2) * 0.025;
    const depth = 0.34 + ((index + 1) % 3) * 0.035;
    const offsetX = (index % 2 ? 0.04 : -0.025) * (flip ? -1 : 1);
    addBox(group, [width, height, depth], palette[index % palette.length], [x + offsetX, y + index * 0.112, z], {
      roughness: 0.7,
      clearcoat: 0.12,
      rotation: [0, (index % 3 - 1) * 0.035 * (flip ? -1 : 1), 0],
    });
    addBox(group, [width * 0.92, 0.014, depth * 1.01], 0xb5965b, [x + offsetX, y + index * 0.112 + height * 0.1, z + 0.003], {
      metalness: 0.15,
      roughness: 0.55,
      castShadow: false,
    });
  }
}

function addVase(group, x, y, z, color, segments) {
  const glaze = material(color, { metalness: 0.12, roughness: 0.32, clearcoat: 0.74, clearcoatRoughness: 0.1 });
  addMesh(group, new THREE.SphereGeometry(0.26, segments, Math.max(10, Math.floor(segments * 0.65))), glaze, [x, y + 0.25, z], [0, 0, 0], [1, 1.15, 1]);
  addMesh(group, new THREE.CylinderGeometry(0.11, 0.16, 0.24, segments), glaze, [x, y + 0.52, z]);
  addMesh(group, new THREE.TorusGeometry(0.12, 0.018, 8, segments), material(COLORS.brass, { metalness: 0.8, roughness: 0.22 }), [x, y + 0.64, z], [Math.PI / 2, 0, 0]);
}

function addBankerLamp(group, x, y, z, facing, segments, coarsePointer) {
  const brass = material(COLORS.brass, { metalness: 0.84, roughness: 0.2, clearcoat: 0.72, clearcoatRoughness: 0.08 });
  const green = material(0x1d513d, { roughness: 0.26, clearcoat: 0.64, emissive: 0x103326, emissiveIntensity: 0.16 });
  addMesh(group, new THREE.CylinderGeometry(0.28, 0.34, 0.08, segments), brass, [x, y + 0.04, z]);
  addMesh(group, new THREE.CylinderGeometry(0.035, 0.045, 0.58, Math.max(12, Math.floor(segments / 2))), brass, [x, y + 0.34, z]);
  addMesh(group, new THREE.SphereGeometry(0.07, 14, 10), brass, [x, y + 0.64, z]);
  const shade = addMesh(
    group,
    new THREE.SphereGeometry(0.47, segments, Math.max(10, Math.floor(segments / 2)), 0, Math.PI * 2, 0, Math.PI / 2),
    green,
    [x + facing * 0.08, y + 0.67, z],
    [Math.PI, 0, 0],
    [1.15, 0.48, 0.72],
  );
  shade.castShadow = !coarsePointer;
  const glow = new THREE.PointLight(0xffc76b, coarsePointer ? 2.1 : 3.4, 5.2, 2);
  glow.position.set(x + facing * 0.14, y + 0.58, z + 0.2);
  group.add(glow);
}

function addWallSconce(group, x, y, z, towardBoard, segments, coarsePointer) {
  const brass = material(COLORS.brass, { metalness: 0.86, roughness: 0.2, clearcoat: 0.68 });
  addMesh(group, new THREE.CylinderGeometry(0.19, 0.19, 0.06, segments), brass, [x, y, z], [Math.PI / 2, 0, 0]);
  addBox(group, [0.06, 0.48, 0.08], COLORS.brassDark, [x, y - 0.16, z + towardBoard * 0.14], { metalness: 0.76, roughness: 0.28, rotation: [towardBoard * 0.18, 0, 0] });
  const glass = material(0xf2c875, { roughness: 0.2, clearcoat: 0.6, emissive: 0xff9d35, emissiveIntensity: 1.4, opacity: 0.92 });
  addMesh(group, new THREE.SphereGeometry(0.13, segments, Math.max(10, Math.floor(segments / 2))), glass, [x, y - 0.36, z + towardBoard * 0.2], [0, 0, 0], [0.82, 1.25, 0.82]);
  const light = new THREE.PointLight(0xffad4f, coarsePointer ? 2.4 : 4.2, 6.4, 2);
  light.position.set(x, y - 0.33, z + towardBoard * 0.42);
  group.add(light);
}

function addCurtain(group, x, y, z, towardBoard, side, compact = false) {
  const folds = compact ? 4 : 6;
  const brass = material(COLORS.brass, { metalness: 0.82, roughness: 0.22 });
  addMesh(group, new THREE.CylinderGeometry(0.035, 0.035, 2.5, 12), brass, [x, y + 1.22, z], [0, 0, Math.PI / 2]);
  for (let index = 0; index < folds; index += 1) {
    const width = 0.26;
    const px = x + side * (index * 0.18 + 0.1);
    const pz = z + towardBoard * (0.02 + (index % 2) * 0.055);
    addBox(group, [width, 2.7 - index * 0.08, 0.13], index % 2 ? COLORS.burgundyDark : COLORS.burgundy, [px, y - index * 0.035, pz], {
      roughness: index % 2 ? 0.9 : 0.82,
      clearcoat: 0.04,
      rotation: [0, side * 0.02 * index, side * 0.012 * index],
    });
  }
  addMesh(group, new THREE.SphereGeometry(0.07, 12, 8), brass, [x - 1.28, y + 1.22, z]);
  addMesh(group, new THREE.SphereGeometry(0.07, 12, 8), brass, [x + 1.28, y + 1.22, z]);
}

function addLaurel(group, centerX, centerY, z, side, segments) {
  const leafMaterial = material(0xa8792c, { metalness: 0.76, roughness: 0.28, clearcoat: 0.6 });
  const leafGeometry = new THREE.SphereGeometry(0.13, Math.max(10, Math.floor(segments / 2)), 8);
  for (let index = 0; index < 9; index += 1) {
    const t = index / 8;
    const angle = THREE.MathUtils.lerp(-1.03, 1.03, t);
    const x = centerX + side * (0.73 + Math.cos(angle) * 0.38);
    const y = centerY + Math.sin(angle) * 0.94;
    const leaf = addMesh(group, leafGeometry.clone(), leafMaterial, [x, y, z], [0, 0, side * (-angle * 0.72 + 0.48)], [0.55, 1.25, 0.35]);
    leaf.castShadow = true;
  }
}

function addPawnCrest(group, x, y, z, towardBoard, segments) {
  const plaque = material(0x17120f, { metalness: 0.16, roughness: 0.42, clearcoat: 0.5 });
  const brass = material(COLORS.brass, { metalness: 0.88, roughness: 0.2, clearcoat: 0.78, clearcoatRoughness: 0.08 });
  addMesh(group, new THREE.CylinderGeometry(1.42, 1.42, 0.12, segments), plaque, [x, y, z], [Math.PI / 2, 0, 0]);
  addMesh(group, new THREE.TorusGeometry(1.18, 0.055, 10, segments), brass, [x, y, z + towardBoard * 0.075]);
  addLaurel(group, x, y - 0.04, z + towardBoard * 0.11, -1, segments);
  addLaurel(group, x, y - 0.04, z + towardBoard * 0.11, 1, segments);

  const pawn = new THREE.Group();
  addMesh(pawn, new THREE.CylinderGeometry(0.34, 0.48, 0.12, segments), brass, [0, -0.7, 0]);
  addMesh(pawn, new THREE.CylinderGeometry(0.22, 0.34, 0.6, segments), brass, [0, -0.35, 0]);
  addMesh(pawn, new THREE.TorusGeometry(0.25, 0.045, 10, segments), brass, [0, -0.02, 0], [Math.PI / 2, 0, 0]);
  addMesh(pawn, new THREE.SphereGeometry(0.28, segments, Math.max(12, Math.floor(segments / 2))), brass, [0, 0.3, 0]);
  pawn.position.set(x, y - 0.04, z + towardBoard * 0.16);
  pawn.scale.setScalar(0.92);
  group.add(pawn);

  addBox(group, [0.72, 0.12, 0.08], COLORS.brass, [x, y + 1.55, z + towardBoard * 0.13], { metalness: 0.86, roughness: 0.2 });
  for (const crownX of [-0.28, 0, 0.28]) {
    addMesh(group, new THREE.ConeGeometry(0.095, 0.35, 12), brass, [x + crownX, y + 1.78 + (crownX === 0 ? 0.08 : 0), z + towardBoard * 0.13]);
    addMesh(group, new THREE.SphereGeometry(0.055, 10, 8), brass, [x + crownX, y + 1.96 + (crownX === 0 ? 0.08 : 0), z + towardBoard * 0.13]);
  }
}

function addPictureFrame(group, x, y, z, towardBoard, flip = false) {
  const frameMat = material(COLORS.brassDark, { metalness: 0.62, roughness: 0.28, clearcoat: 0.5 });
  addBox(group, [2.0, 1.42, 0.09], COLORS.walnutWarm, [x, y, z], { roughness: 0.52, clearcoat: 0.34 });
  addBox(group, [1.72, 1.14, 0.04], flip ? 0x314535 : 0x3f3727, [x, y, z + towardBoard * 0.075], { roughness: 0.86, castShadow: false });
  for (const [dx, dy, sx, sy] of [[0, 0.65, 1.95, 0.07], [0, -0.65, 1.95, 0.07], [-0.93, 0, 0.07, 1.35], [0.93, 0, 0.07, 1.35]]) {
    addMesh(group, new THREE.BoxGeometry(sx, sy, 0.04), frameMat, [x + dx, y + dy, z + towardBoard * 0.11]);
  }
  for (let index = 0; index < 4; index += 1) {
    addBox(group, [1.05 - index * 0.13, 0.025, 0.02], COLORS.parchment, [x + (index - 1.5) * 0.1, y + (index - 1.5) * 0.18, z + towardBoard * 0.12], {
      roughness: 0.8,
      rotation: [0, 0, (index % 2 ? -1 : 1) * 0.14],
      castShadow: false,
    });
  }
}

export function buildPremiumWarRoomLayer(theme, whiteSide, coarsePointer = false) {
  const group = new THREE.Group();
  group.name = 'premium-war-room-layer';
  group.userData.premiumWarRoom = true;

  const far = whiteSide ? -1 : 1;
  const towardBoard = -far;
  const wallZ = far * 7.6;
  const shelfZ = wallZ + towardBoard * 0.72;
  const segments = coarsePointer ? 16 : 28;
  const leftX = whiteSide ? -4.95 : 4.95;
  const rightX = -leftX;

  addCurtain(group, -1.65, 3.28, wallZ + towardBoard * 0.48, towardBoard, -1, coarsePointer);
  addCurtain(group, 1.65, 3.28, wallZ + towardBoard * 0.48, towardBoard, 1, coarsePointer);
  addPawnCrest(group, 0, 3.25, wallZ + towardBoard * 0.58, towardBoard, segments);
  addWallSconce(group, -3.25, 4.55, wallZ + towardBoard * 0.44, towardBoard, segments, coarsePointer);
  addWallSconce(group, 3.25, 4.55, wallZ + towardBoard * 0.44, towardBoard, segments, coarsePointer);

  addBox(group, [3.25, 0.22, 0.82], COLORS.walnutWarm, [leftX, 1.83, shelfZ], { roughness: 0.48, clearcoat: 0.38 });
  addBox(group, [3.25, 0.16, 0.84], COLORS.brassDark, [leftX, 1.69, shelfZ], { metalness: 0.55, roughness: 0.3 });
  addBankerLamp(group, leftX - (whiteSide ? 0.55 : -0.55), 1.92, shelfZ + towardBoard * 0.22, whiteSide ? 1 : -1, segments, coarsePointer);
  addBookStack(group, leftX + (whiteSide ? 0.62 : -0.62), 1.96, shelfZ + towardBoard * 0.08, !whiteSide, coarsePointer);
  addVase(group, leftX + (whiteSide ? -1.0 : 1.0), 1.91, shelfZ + towardBoard * 0.06, COLORS.burgundy, segments);

  addBox(group, [3.25, 0.22, 0.82], COLORS.walnutWarm, [rightX, 1.83, shelfZ], { roughness: 0.48, clearcoat: 0.38 });
  addBox(group, [3.25, 0.16, 0.84], COLORS.brassDark, [rightX, 1.69, shelfZ], { metalness: 0.55, roughness: 0.3 });
  addBookStack(group, rightX + (whiteSide ? -0.54 : 0.54), 1.96, shelfZ + towardBoard * 0.08, whiteSide, coarsePointer);
  addVase(group, rightX + (whiteSide ? 0.96 : -0.96), 1.91, shelfZ + towardBoard * 0.06, COLORS.bottleGreen, segments);
  addPictureFrame(group, rightX, 3.62, wallZ + towardBoard * 0.46, towardBoard, !whiteSide);

  if (!coarsePointer) {
    addVase(group, leftX + (whiteSide ? 1.18 : -1.18), 3.18, wallZ + towardBoard * 0.54, COLORS.teal, segments);
    addBookStack(group, rightX + (whiteSide ? 0.82 : -0.82), 3.02, wallZ + towardBoard * 0.54, !whiteSide, false);
  }

  const coolFill = new THREE.PointLight(theme?.felt ?? COLORS.teal, coarsePointer ? 1.2 : 2.1, 9.5, 2);
  coolFill.position.set(rightX * 0.72, 3.25, wallZ + towardBoard * 1.4);
  group.add(coolFill);

  return group;
}

export function buildPremiumTableLayer(theme, coarsePointer = false) {
  const group = new THREE.Group();
  group.name = 'premium-table-layer';
  const brass = material(theme?.glow ?? COLORS.brass, { metalness: 0.82, roughness: 0.22, clearcoat: 0.72, clearcoatRoughness: 0.08 });
  const leather = material(COLORS.burgundyDark, { roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.18 });
  const walnut = material(COLORS.walnutWarm, { metalness: 0.04, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.16 });

  addMesh(group, new THREE.BoxGeometry(10.25, 0.07, 10.25), leather, [0, -0.165, 0]);

  for (const [x, z, sx, sz] of [
    [0, 5.23, 10.55, 0.18], [0, -5.23, 10.55, 0.18],
    [5.23, 0, 0.18, 10.55], [-5.23, 0, 0.18, 10.55],
  ]) addMesh(group, new THREE.BoxGeometry(sx, 0.2, sz), walnut, [x, -0.08, z]);

  for (const [x, z, sx, sz] of [
    [0, 5.1, 10.24, 0.045], [0, -5.1, 10.24, 0.045],
    [5.1, 0, 0.045, 10.24], [-5.1, 0, 0.045, 10.24],
  ]) addMesh(group, new THREE.BoxGeometry(sx, 0.075, sz), brass, [x, 0.035, z]);

  const cornerSegments = coarsePointer ? 12 : 20;
  for (const x of [-5.15, 5.15]) {
    for (const z of [-5.15, 5.15]) {
      addMesh(group, new THREE.CylinderGeometry(0.16, 0.2, 0.12, cornerSegments), brass, [x, 0.01, z]);
      addMesh(group, new THREE.SphereGeometry(0.08, cornerSegments, 8), brass, [x, 0.11, z]);
    }
  }

  return group;
}
