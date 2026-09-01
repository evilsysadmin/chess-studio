import * as THREE from 'three';
import { warRoomDecorProfile } from './WarRoom3DMobileVisuals.js';

const COLORS = Object.freeze({
  walnut: 0x3a2114,
  walnutDark: 0x160c08,
  walnutWarm: 0x5a321c,
  mahogany: 0x482217,
  brass: 0xc5963f,
  brassDark: 0x76501f,
  ivory: 0xeadbbd,
  burgundy: 0x5b2028,
  burgundyDark: 0x2e1015,
  bottleGreen: 0x173c31,
  emerald: 0x245542,
  teal: 0x173943,
  navy: 0x17283a,
  parchment: 0xcab98e,
  charcoal: 0x11151c,
  stone: 0x6f6253,
  stoneLight: 0xa69780,
});

function material(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.08,
    roughness: options.roughness ?? 0.56,
    clearcoat: options.clearcoat ?? 0.28,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.2,
    sheen: options.sheen ?? 0.08,
    sheenRoughness: options.sheenRoughness ?? 0.5,
    sheenColor: new THREE.Color(options.sheenColor ?? color),
    ior: options.ior ?? 1.48,
    specularIntensity: options.specularIntensity ?? 0.72,
    specularColor: new THREE.Color(options.specularColor ?? 0xffffff),
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.opacity != null && options.opacity < 1,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
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
  if (options.name) mesh.name = options.name;
  return mesh;
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function attachFlameKinetics(anchor, light, baseIntensity, phase = 0, coarsePointer = false) {
  light.userData.baseWarRoomIntensity = baseIntensity;
  if (coarsePointer) return;
  anchor.userData.warRoomFlame = true;
  const baseScale = anchor.scale.clone();
  const baseRotationZ = anchor.rotation.z;
  anchor.onBeforeRender = () => {
    const now = nowMs();
    const slow = Math.sin(now * 0.0067 + phase);
    const fast = Math.sin(now * 0.021 + phase * 1.73);
    const flutter = slow * 0.075 + fast * 0.038;
    light.intensity = baseIntensity * (1 + flutter);
    anchor.rotation.z = baseRotationZ + slow * 0.075 + fast * 0.025;
    anchor.scale.set(baseScale.x * (1 - flutter * 0.12), baseScale.y * (1 + flutter * 0.22), baseScale.z);
  };
}

function attachFireplaceKinetics(fireCore, flames, embers, light, baseIntensity, coarsePointer = false) {
  light.userData.baseWarRoomIntensity = baseIntensity;
  fireCore.userData.warRoomFireCore = true;
  if (coarsePointer) return;

  const animationAnchor = flames[0];
  if (!animationAnchor) return;
  animationAnchor.userData.warRoomFireAnimationAnchor = true;

  const bases = flames.map((flame) => ({
    scale: flame.scale.clone(),
    y: flame.position.y,
    rotationZ: flame.rotation.z,
  }));
  const emberBases = embers.map((item) => item.material?.emissiveIntensity ?? 0.8);

  animationAnchor.onBeforeRender = () => {
    const now = nowMs();
    const slow = Math.sin(now * 0.0049);
    const mid = Math.sin(now * 0.0117 + 1.4);
    const quick = Math.sin(now * 0.0263 + 0.35);
    const lightFlutter = slow * 0.08 + mid * 0.055 + quick * 0.025;
    light.intensity = baseIntensity * (1 + lightFlutter);

    flames.forEach((flame, index) => {
      const base = bases[index];
      const phase = index * 1.37;
      const wave = Math.sin(now * (0.0085 + index * 0.0007) + phase);
      const tremor = Math.sin(now * (0.021 + index * 0.0011) + phase * 0.71);
      const lean = wave * 0.08 + tremor * 0.028;
      flame.position.y = base.y + wave * 0.025 + tremor * 0.008;
      flame.rotation.z = base.rotationZ + lean;
      flame.scale.set(
        base.scale.x * (1 - tremor * 0.07),
        base.scale.y * (1 + wave * 0.12 + tremor * 0.045),
        base.scale.z * (1 - wave * 0.04),
      );
    });

    embers.forEach((item, index) => {
      if (!item.material) return;
      item.material.emissiveIntensity = emberBases[index] * (1 + 0.18 * Math.sin(now * 0.006 + index * 1.9));
    });
  };
}

function addBookStack(group, x, y, z, flip = false, compact = false) {
  const palette = [COLORS.bottleGreen, COLORS.burgundy, COLORS.navy, 0x533623, 0x4d4a2c, 0x30233e];
  const count = compact ? 4 : 7;
  for (let index = 0; index < count; index += 1) {
    const width = 0.48 + (index % 3) * 0.1;
    const height = 0.1 + (index % 2) * 0.025;
    const depth = 0.34 + ((index + 1) % 3) * 0.035;
    const offsetX = (index % 2 ? 0.04 : -0.025) * (flip ? -1 : 1);
    addBox(group, [width, height, depth], palette[index % palette.length], [x + offsetX, y + index * 0.112, z], {
      roughness: 0.72,
      clearcoat: 0.12,
      sheen: 0.22,
      sheenColor: 0xefe2c8,
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
  const glaze = material(color, {
    metalness: 0.12,
    roughness: 0.3,
    clearcoat: 0.82,
    clearcoatRoughness: 0.08,
    specularIntensity: 0.9,
  });
  addMesh(group, new THREE.SphereGeometry(0.26, segments, Math.max(10, Math.floor(segments * 0.65))), glaze, [x, y + 0.25, z], [0, 0, 0], [1, 1.15, 1]);
  addMesh(group, new THREE.CylinderGeometry(0.11, 0.16, 0.24, segments), glaze, [x, y + 0.52, z]);
  addMesh(group, new THREE.TorusGeometry(0.12, 0.018, 8, segments), material(COLORS.brass, { metalness: 0.82, roughness: 0.2 }), [x, y + 0.64, z], [Math.PI / 2, 0, 0]);
}

function addBankerLamp(group, x, y, z, facing, segments, coarsePointer) {
  const brass = material(COLORS.brass, { metalness: 0.88, roughness: 0.18, clearcoat: 0.76, clearcoatRoughness: 0.07 });
  const green = material(0x1d513d, { roughness: 0.24, clearcoat: 0.7, emissive: 0x103326, emissiveIntensity: 0.2, sheen: 0.18 });
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
  const glow = new THREE.PointLight(0xffc76b, warRoomDecorProfile(coarsePointer).bankerLamp, 5.6, 2);
  glow.position.set(x + facing * 0.14, y + 0.58, z + 0.2);
  group.add(glow);
}

function addWallSconce(group, x, y, z, towardBoard, segments, coarsePointer, phase = 0) {
  const brass = material(COLORS.brass, { metalness: 0.88, roughness: 0.18, clearcoat: 0.72 });
  addMesh(group, new THREE.CylinderGeometry(0.19, 0.19, 0.06, segments), brass, [x, y, z], [Math.PI / 2, 0, 0]);
  addBox(group, [0.06, 0.5, 0.08], COLORS.brassDark, [x, y - 0.16, z + towardBoard * 0.14], {
    metalness: 0.78,
    roughness: 0.26,
    rotation: [towardBoard * 0.18, 0, 0],
  });
  addMesh(group, new THREE.TorusGeometry(0.13, 0.018, 8, segments), brass, [x, y - 0.38, z + towardBoard * 0.21], [Math.PI / 2, 0, 0]);

  const flameMat = material(0xffc15b, {
    metalness: 0,
    roughness: 0.18,
    clearcoat: 0.1,
    emissive: 0xff7a19,
    emissiveIntensity: 2.15,
  });
  const flame = addMesh(
    group,
    new THREE.ConeGeometry(0.085, 0.27, Math.max(10, Math.floor(segments / 2))),
    flameMat,
    [x, y - 0.43, z + towardBoard * 0.22],
    [0, 0, phase ? 0.035 : -0.035],
    [0.9, 1.05, 0.9],
  );
  flame.name = 'war-room-sconce-flame';
  const baseIntensity = warRoomDecorProfile(coarsePointer).wallSconce;
  const light = new THREE.PointLight(0xffa64a, baseIntensity, 7.2, 2);
  light.position.set(x, y - 0.38, z + towardBoard * 0.48);
  group.add(light);
  attachFlameKinetics(flame, light, baseIntensity, phase, coarsePointer);
}

function addCurtain(group, x, y, z, towardBoard, side, compact = false) {
  const folds = compact ? 5 : 9;
  const decor = warRoomDecorProfile(compact);
  const brass = material(COLORS.brass, { metalness: 0.84, roughness: 0.2 });
  addMesh(group, new THREE.CylinderGeometry(0.035, 0.035, 2.9, 12), brass, [x, y + 1.28, z], [0, 0, Math.PI / 2]);

  const velvetA = material(decor.curtainLight, {
    roughness: 0.84,
    clearcoat: 0.02,
    sheen: 0.58,
    sheenRoughness: 0.78,
    sheenColor: 0xa45d65,
  });
  const velvetB = material(decor.curtainDark, {
    roughness: 0.93,
    clearcoat: 0.01,
    sheen: 0.44,
    sheenRoughness: 0.82,
    sheenColor: 0x77333e,
  });

  for (let index = 0; index < folds; index += 1) {
    const px = x + side * (index * 0.145 + 0.08);
    const pz = z + towardBoard * (0.02 + (index % 2) * 0.065);
    const height = 2.86 - index * 0.055;
    const fold = addMesh(
      group,
      new THREE.CapsuleGeometry(0.105, Math.max(1.9, height - 0.21), 5, 10),
      index % 2 ? velvetB : velvetA,
      [px, y - index * 0.02, pz],
      [0, 0, side * 0.012 * index],
      [1, 1, 0.7],
    );
    fold.name = 'war-room-velvet-curtain-fold';
  }

  addMesh(
    group,
    new THREE.SphereGeometry(0.72, compact ? 14 : 24, compact ? 9 : 14),
    velvetA,
    [x + side * 0.6, y + 1.05, z + towardBoard * 0.03],
    [0, 0, side * 0.1],
    [1.45, 0.34, 0.34],
  );
  const tieX = x + side * (compact ? 0.48 : 0.65);
  const tieY = y - 0.05;
  addMesh(group, new THREE.TorusGeometry(0.18, 0.025, 8, 22), brass, [tieX, tieY, z + towardBoard * 0.16], [Math.PI / 2, 0, 0], [0.72, 1, 1]);
  addMesh(group, new THREE.CylinderGeometry(0.017, 0.02, 0.38, 10), brass, [tieX + side * 0.06, tieY - 0.22, z + towardBoard * 0.17], [0, 0, side * 0.13]);
  addMesh(group, new THREE.ConeGeometry(0.065, 0.18, 12), brass, [tieX + side * 0.11, tieY - 0.48, z + towardBoard * 0.17], [0, 0, side * 0.08]);
  addMesh(group, new THREE.SphereGeometry(0.07, 12, 8), brass, [x - 1.48, y + 1.28, z]);
  addMesh(group, new THREE.SphereGeometry(0.07, 12, 8), brass, [x + 1.48, y + 1.28, z]);
}

function addLaurel(group, centerX, centerY, z, side, segments) {
  const leafMaterial = material(0xa8792c, { metalness: 0.78, roughness: 0.26, clearcoat: 0.64 });
  const leafGeometry = new THREE.SphereGeometry(0.13, Math.max(10, Math.floor(segments / 2)), 8);
  for (let index = 0; index < 9; index += 1) {
    const t = index / 8;
    const angle = THREE.MathUtils.lerp(-1.03, 1.03, t);
    const leafX = centerX + side * (0.73 + Math.cos(angle) * 0.38);
    const leafY = centerY + Math.sin(angle) * 0.94;
    addMesh(group, leafGeometry.clone(), leafMaterial, [leafX, leafY, z], [0, 0, side * (-angle * 0.72 + 0.48)], [0.55, 1.25, 0.35]);
  }
}

function addPawnCrest(group, x, y, z, towardBoard, segments) {
  const plaque = material(0x17120f, { metalness: 0.18, roughness: 0.38, clearcoat: 0.58 });
  const brass = material(COLORS.brass, { metalness: 0.9, roughness: 0.18, clearcoat: 0.8, clearcoatRoughness: 0.07 });
  const crest = new THREE.Group();
  crest.name = 'ceremonial-pawn-crest';
  crest.userData.singlePawnDisplay = true;
  addMesh(crest, new THREE.CylinderGeometry(1.42, 1.42, 0.12, segments), plaque, [0, 0, 0], [Math.PI / 2, 0, 0]);
  addMesh(crest, new THREE.TorusGeometry(1.18, 0.055, 10, segments), brass, [0, 0, towardBoard * 0.075]);
  addLaurel(crest, 0, -0.04, towardBoard * 0.11, -1, segments);
  addLaurel(crest, 0, -0.04, towardBoard * 0.11, 1, segments);

  const pawn = new THREE.Group();
  pawn.name = 'ceremonial-single-pawn';
  addMesh(pawn, new THREE.CylinderGeometry(0.34, 0.48, 0.12, segments), brass, [0, -0.7, 0]);
  addMesh(pawn, new THREE.CylinderGeometry(0.22, 0.34, 0.6, segments), brass, [0, -0.35, 0]);
  addMesh(pawn, new THREE.TorusGeometry(0.25, 0.045, 10, segments), brass, [0, -0.02, 0], [Math.PI / 2, 0, 0]);
  addMesh(pawn, new THREE.SphereGeometry(0.28, segments, Math.max(12, Math.floor(segments / 2))), brass, [0, 0.3, 0]);
  pawn.position.z = towardBoard * 0.16;
  pawn.scale.setScalar(0.92);
  crest.add(pawn);

  addBox(crest, [0.72, 0.12, 0.08], COLORS.brass, [0, 1.55, towardBoard * 0.13], { metalness: 0.88, roughness: 0.18 });
  for (const crownX of [-0.28, 0, 0.28]) {
    addMesh(crest, new THREE.ConeGeometry(0.095, 0.35, 12), brass, [crownX, 1.78 + (crownX === 0 ? 0.08 : 0), towardBoard * 0.13]);
    addMesh(crest, new THREE.SphereGeometry(0.055, 10, 8), brass, [crownX, 1.96 + (crownX === 0 ? 0.08 : 0), towardBoard * 0.13]);
  }
  crest.position.set(x, y, z);
  group.add(crest);
}

function addPictureFrame(group, x, y, z, towardBoard, flip = false, coarsePointer = false) {
  const frameMat = material(COLORS.brassDark, { metalness: 0.64, roughness: 0.26, clearcoat: 0.54 });
  addBox(group, [2.2, 1.62, 0.09], COLORS.walnutWarm, [x, y, z], { roughness: 0.5, clearcoat: 0.4 });
  addBox(group, [1.92, 1.34, 0.04], flip ? 0x4c5144 : 0x394652, [x, y, z + towardBoard * 0.075], { roughness: 0.86, castShadow: false });
  for (const [dx, dy, sx, sy] of [[0, 0.75, 2.15, 0.07], [0, -0.75, 2.15, 0.07], [-1.03, 0, 0.07, 1.55], [1.03, 0, 0.07, 1.55]]) {
    addMesh(group, new THREE.BoxGeometry(sx, sy, 0.04), frameMat, [x + dx, y + dy, z + towardBoard * 0.11]);
  }

  const artZ = z + towardBoard * 0.13;
  const mountainMat = material(flip ? 0x5d6252 : 0x65717a, { roughness: 0.95, clearcoat: 0 });
  const castleMat = material(0xbbb09b, { roughness: 0.88, clearcoat: 0.03 });
  const roofMat = material(0x4b3130, { roughness: 0.92, clearcoat: 0.02 });
  const earthMat = material(0x31352d, { roughness: 0.98, clearcoat: 0 });
  addBox(group, [1.82, 0.32, 0.018], 0x30372f, [x, y - 0.48, artZ], { roughness: 0.96, castShadow: false });
  addMesh(group, new THREE.ConeGeometry(0.45, 0.85, 3), mountainMat, [x - 0.53, y + 0.06, artZ + towardBoard * 0.006], [0, 0, 0.03], [1.25, 1, 0.18]);
  addMesh(group, new THREE.ConeGeometry(0.38, 0.72, 3), mountainMat, [x + 0.58, y + 0.1, artZ + towardBoard * 0.007], [0, 0, -0.04], [1.15, 1, 0.18]);
  addBox(group, [0.58, 0.38, 0.028], 0x8f8776, [x + 0.12, y - 0.14, artZ + towardBoard * 0.02], { roughness: 0.9, castShadow: false });
  for (const towerX of [x - 0.24, x + 0.43]) {
    addMesh(group, new THREE.BoxGeometry(0.22, 0.58, 0.03), castleMat, [towerX, y + 0.02, artZ + towardBoard * 0.025]);
    addMesh(group, new THREE.ConeGeometry(0.16, 0.22, 4), roofMat, [towerX, y + 0.42, artZ + towardBoard * 0.03], [0, Math.PI / 4, 0], [1, 1, 0.22]);
  }
  addBox(group, [0.08, 0.35, 0.035], castleMat.color?.getHex?.() || 0xbbb09b, [x + 0.1, y + 0.12, artZ + towardBoard * 0.03], { roughness: 0.88, castShadow: false });
  addBox(group, [1.75, 0.025, 0.02], earthMat.color?.getHex?.() || 0x31352d, [x, y - 0.34, artZ + towardBoard * 0.035], { roughness: 1, castShadow: false });

  if (!coarsePointer) {
    const troopMat = material(0x201d19, { roughness: 1, clearcoat: 0 });
    for (let index = 0; index < 7; index += 1) {
      const troopX = x - 0.7 + index * 0.22;
      addMesh(group, new THREE.SphereGeometry(0.025, 8, 6), troopMat, [troopX, y - 0.38 + (index % 2) * 0.035, artZ + towardBoard * 0.04]);
      addBox(group, [0.024, 0.12, 0.012], 0x201d19, [troopX, y - 0.45 + (index % 2) * 0.035, artZ + towardBoard * 0.04], { roughness: 1, castShadow: false });
    }
  }
}

function addWarRoomSofa(group, x, y, z, towardBoard, side, segments, compact = false) {
  const sofa = new THREE.Group();
  sofa.name = side < 0 ? 'war-room-sofa-left' : 'war-room-sofa-right';
  sofa.userData.warRoomFurniture = 'club-sofa';
  const leather = material(COLORS.burgundyDark, {
    roughness: 0.5,
    clearcoat: 0.26,
    sheen: 0.42,
    sheenColor: 0x9b5961,
  });
  const leatherHighlight = material(COLORS.burgundy, {
    roughness: 0.46,
    clearcoat: 0.34,
    sheen: 0.52,
    sheenColor: 0xb36f74,
  });
  const timber = material(COLORS.walnutWarm, { roughness: 0.48, clearcoat: 0.42 });
  const brass = material(COLORS.brassDark, { metalness: 0.7, roughness: 0.3, clearcoat: 0.3 });

  addMesh(sofa, new THREE.BoxGeometry(compact ? 1.42 : 1.7, 0.32, 0.78), leatherHighlight, [0, 0.48, 0]);
  addMesh(sofa, new THREE.BoxGeometry(compact ? 1.5 : 1.82, 0.86, 0.3), leather, [0, 0.94, -towardBoard * 0.36], [towardBoard * -0.06, 0, 0]);
  addMesh(sofa, new THREE.BoxGeometry(0.28, 0.62, 0.82), leather, [-(compact ? 0.82 : 0.99), 0.68, 0]);
  addMesh(sofa, new THREE.BoxGeometry(0.28, 0.62, 0.82), leather, [(compact ? 0.82 : 0.99), 0.68, 0]);

  for (const legX of [-(compact ? 0.62 : 0.76), compact ? 0.62 : 0.76]) {
    addMesh(sofa, new THREE.CylinderGeometry(0.055, 0.07, 0.32, Math.max(10, Math.floor(segments / 2))), timber, [legX, 0.16, -towardBoard * 0.2]);
    addMesh(sofa, new THREE.CylinderGeometry(0.055, 0.07, 0.32, Math.max(10, Math.floor(segments / 2))), timber, [legX, 0.16, towardBoard * 0.2]);
  }

  if (!compact) {
    for (const buttonX of [-0.48, 0, 0.48]) {
      const button = addMesh(sofa, new THREE.SphereGeometry(0.035, 10, 7), brass, [buttonX, 0.98, towardBoard * 0.168]);
      button.castShadow = false;
    }
  }

  sofa.position.set(x, y, z);
  sofa.rotation.y = side * towardBoard * 0.14;
  group.add(sofa);
}

function addFireplace(group, x, y, z, towardBoard, segments, coarsePointer = false) {
  const stone = material(COLORS.stone, {
    metalness: 0.01,
    roughness: 0.3,
    clearcoat: 0.72,
    clearcoatRoughness: 0.12,
    specularIntensity: 0.78,
  });
  const stoneLight = material(COLORS.stoneLight, {
    metalness: 0,
    roughness: 0.26,
    clearcoat: 0.78,
    clearcoatRoughness: 0.1,
    specularIntensity: 0.82,
  });
  const iron = material(0x181412, { metalness: 0.58, roughness: 0.58, clearcoat: 0.08 });
  const emberMaterial = material(0x8a2a12, { roughness: 0.75, emissive: 0xff4a13, emissiveIntensity: 0.85 });
  const fireplace = new THREE.Group();
  fireplace.name = 'war-room-fireplace';

  addBox(fireplace, [1.76, 1.12, 0.08], 0x0e0b09, [0, 0.62, towardBoard * 0.06], { roughness: 1, clearcoat: 0 });
  addMesh(fireplace, new THREE.BoxGeometry(0.25, 1.45, 0.35), stone, [-1.03, 0.72, 0]);
  addMesh(fireplace, new THREE.BoxGeometry(0.25, 1.45, 0.35), stone, [1.03, 0.72, 0]);
  addMesh(fireplace, new THREE.BoxGeometry(2.3, 0.26, 0.42), stoneLight, [0, 1.47, 0]);
  addMesh(fireplace, new THREE.BoxGeometry(2.62, 0.16, 0.62), stoneLight, [0, 1.7, towardBoard * 0.02]);
  addMesh(fireplace, new THREE.BoxGeometry(2.34, 0.12, 0.82), stoneLight, [0, 0.03, towardBoard * 0.18]);

  for (const [index, logY] of [0.28, 0.41].entries()) {
    const logA = addMesh(fireplace, new THREE.CylinderGeometry(0.075, 0.09, 0.82, 12), iron, [-0.18, logY, towardBoard * 0.25], [0, 0, Math.PI / 2 - 0.12]);
    const logB = addMesh(fireplace, new THREE.CylinderGeometry(0.07, 0.09, 0.72, 12), iron, [0.22, logY + 0.02, towardBoard * 0.26], [0, 0, Math.PI / 2 + 0.14]);
    logA.name = index === 0 ? 'war-room-fire-log' : '';
    logB.name = index === 0 ? 'war-room-fire-cross-log' : '';
  }

  const embers = [];
  const emberPositions = [
    [-0.42, 0.23, 1.1], [-0.2, 0.25, 0.88], [0.02, 0.22, 1.0], [0.24, 0.24, 0.92], [0.43, 0.22, 1.08],
  ];
  emberPositions.slice(0, coarsePointer ? 3 : 5).forEach(([emberX, emberY, stretch], index) => {
    const emberMat = emberMaterial.clone();
    emberMat.emissiveIntensity = 0.72 + index * 0.08;
    const ember = addMesh(fireplace, new THREE.SphereGeometry(0.12, 12, 8), emberMat, [emberX, emberY, towardBoard * 0.31], [0, 0, 0], [stretch, 0.38, 0.48]);
    ember.name = index === 0 ? 'war-room-fire-ember' : '';
    embers.push(ember);
  });

  const fireCore = new THREE.Group();
  fireCore.name = 'war-room-fire-core';
  const flames = [];
  const flameCount = coarsePointer ? 3 : 6;
  for (let index = 0; index < flameCount; index += 1) {
    const side = index - (flameCount - 1) / 2;
    const tall = 0.42 + (index % 3) * 0.11;
    const outerMat = material(index % 2 ? 0xffa03a : 0xffc44f, {
      metalness: 0,
      roughness: 0.24,
      emissive: index % 2 ? 0xff511a : 0xff7b22,
      emissiveIntensity: 2.05,
      clearcoat: 0.02,
      opacity: 0.82,
      depthWrite: false,
    });
    const outer = addMesh(
      fireCore,
      new THREE.ConeGeometry(0.115 + (index % 2) * 0.018, tall, Math.max(10, Math.floor(segments / 2))),
      outerMat,
      [side * 0.155, 0.47 + (index % 2) * 0.055, towardBoard * (0.31 + (index % 3) * 0.012)],
      [0, 0, side * 0.025],
      [1, 1, 0.72],
    );
    outer.name = index === 0 ? 'war-room-fire-flame-outer' : '';
    flames.push(outer);

    if (!coarsePointer || index % 2 === 0) {
      const innerMat = material(0xffe59b, {
        metalness: 0,
        roughness: 0.18,
        emissive: 0xffa331,
        emissiveIntensity: 2.4,
        clearcoat: 0,
        opacity: 0.88,
        depthWrite: false,
      });
      const inner = addMesh(
        fireCore,
        new THREE.ConeGeometry(0.055 + (index % 2) * 0.008, tall * 0.68, Math.max(9, Math.floor(segments / 2))),
        innerMat,
        [side * 0.155, 0.4 + (index % 2) * 0.045, towardBoard * 0.345],
        [0, 0, -side * 0.018],
        [1, 1, 0.68],
      );
      inner.name = index === 0 ? 'war-room-fire-flame-inner' : '';
      flames.push(inner);
    }
  }
  fireplace.add(fireCore);

  const baseIntensity = coarsePointer ? 2.8 : 4.55;
  const fireLight = new THREE.PointLight(0xff8738, baseIntensity, 8.8, 2);
  fireLight.name = 'war-room-fire-light';
  fireLight.position.set(0, 0.69, towardBoard * 0.9);
  fireplace.add(fireLight);
  attachFireplaceKinetics(fireCore, flames, embers, fireLight, baseIntensity, coarsePointer);

  fireplace.position.set(x, y, z);
  group.add(fireplace);
}

function addCofferedPaneling(group, wallZ, towardBoard, coarsePointer) {
  const panels = new THREE.Group();
  panels.name = 'coffered-paneling';
  const xs = coarsePointer ? [-5.45, -3.65, 3.65, 5.45] : [-6.1, -4.75, -3.4, 3.4, 4.75, 6.1];
  for (let index = 0; index < xs.length; index += 1) {
    const x = xs[index];
    const width = coarsePointer ? 1.18 : 1.05;
    addBox(panels, [width, 2.2, 0.08], index % 2 ? COLORS.walnut : COLORS.mahogany, [x, 3.35, wallZ + towardBoard * 0.42], {
      roughness: 0.5,
      clearcoat: 0.38,
      sheen: 0.12,
    });
    addBox(panels, [width * 0.78, 1.82, 0.045], 0x25140d, [x, 3.35, wallZ + towardBoard * 0.5], {
      roughness: 0.64,
      clearcoat: 0.22,
      castShadow: false,
    });
    for (const panelY of [2.36, 4.34]) {
      addBox(panels, [width * 0.92, 0.035, 0.025], COLORS.brassDark, [x, panelY, wallZ + towardBoard * 0.54], {
        metalness: 0.68,
        roughness: 0.28,
        castShadow: false,
      });
    }
  }
  addBox(panels, [14.2, 0.14, 0.16], COLORS.brassDark, [0, 5.05, wallZ + towardBoard * 0.48], { metalness: 0.66, roughness: 0.3 });
  addBox(panels, [14.2, 0.16, 0.18], COLORS.walnutWarm, [0, 1.98, wallZ + towardBoard * 0.46], { roughness: 0.5, clearcoat: 0.38 });
  group.add(panels);
}

function addCommandCabinet(group, x, y, z, towardBoard, segments, compact = false) {
  const cabinet = new THREE.Group();
  cabinet.name = 'command-cabinet';
  const width = compact ? 1.75 : 2.15;
  addBox(cabinet, [width, 1.05, 0.72], COLORS.walnutWarm, [0, 0.52, 0], { roughness: 0.46, clearcoat: 0.44 });
  addBox(cabinet, [width * 0.88, 0.82, 0.05], COLORS.walnutDark, [0, 0.52, towardBoard * 0.39], { roughness: 0.6 });
  const drawerCount = compact ? 2 : 3;
  for (let index = 0; index < drawerCount; index += 1) {
    const drawerY = 0.25 + index * 0.27;
    addBox(cabinet, [width * 0.7, 0.17, 0.035], COLORS.mahogany, [0, drawerY, towardBoard * 0.43], { roughness: 0.5, clearcoat: 0.3 });
    addMesh(cabinet, new THREE.TorusGeometry(0.075, 0.012, 8, segments, Math.PI), material(COLORS.brass, { metalness: 0.86, roughness: 0.2 }), [0, drawerY, towardBoard * 0.47], [Math.PI / 2, 0, 0]);
  }
  addBox(cabinet, [width + 0.14, 0.08, 0.86], COLORS.brassDark, [0, 1.08, 0], { metalness: 0.58, roughness: 0.3 });
  cabinet.position.set(x, y, z);
  group.add(cabinet);
}

function addCinematicAccentLights(group, theme, wallZ, towardBoard, coarsePointer) {
  const decor = warRoomDecorProfile(coarsePointer);
  const target = new THREE.Object3D();
  target.position.set(0, 3.25, wallZ + towardBoard * 0.62);
  group.add(target);

  const crestSpot = new THREE.SpotLight(0xffd08a, decor.crest, 15, Math.PI / 7, 0.6, 2);
  crestSpot.position.set(0, 6.25, wallZ + towardBoard * 3.5);
  crestSpot.target = target;
  crestSpot.castShadow = false;
  group.add(crestSpot);

  const moonFill = new THREE.PointLight(0x6ca7c7, decor.moon, 10.5, 2);
  moonFill.position.set(whiteSideSign(towardBoard) * 5.2, 4.2, wallZ + towardBoard * 1.7);
  group.add(moonFill);

  const paletteFill = new THREE.PointLight(theme?.felt ?? COLORS.teal, decor.palette, 10.5, 2);
  paletteFill.position.set(-whiteSideSign(towardBoard) * 4.6, 3.15, wallZ + towardBoard * 1.45);
  group.add(paletteFill);
}

function whiteSideSign(towardBoard) {
  return towardBoard < 0 ? 1 : -1;
}

export function buildPremiumWarRoomLayer(theme, whiteSide, coarsePointer = false) {
  const group = new THREE.Group();
  group.name = 'premium-war-room-layer';
  group.userData.premiumWarRoom = true;
  group.userData.premiumPass = 'cinematic-v3-teutonic';

  const far = whiteSide ? -1 : 1;
  const towardBoard = -far;
  const wallZ = far * 7.6;
  const shelfZ = wallZ + towardBoard * 0.72;
  const segments = coarsePointer ? 14 : 28;
  const leftX = whiteSide ? -4.95 : 4.95;
  const rightX = -leftX;

  addCofferedPaneling(group, wallZ, towardBoard, coarsePointer);
  addCurtain(group, -1.72, 3.28, wallZ + towardBoard * 0.52, towardBoard, -1, coarsePointer);
  addCurtain(group, 1.72, 3.28, wallZ + towardBoard * 0.52, towardBoard, 1, coarsePointer);
  addPawnCrest(group, 0, 3.25, wallZ + towardBoard * 0.62, towardBoard, segments);
  addWallSconce(group, -3.18, 4.55, wallZ + towardBoard * 0.52, towardBoard, segments, coarsePointer, 0.7);
  addWallSconce(group, 3.18, 4.55, wallZ + towardBoard * 0.52, towardBoard, segments, coarsePointer, 3.2);

  // Ala de la chimenea: piedra pulida, fuego multicapa y cuadro alpino sobre la repisa.
  addFireplace(group, leftX, 0.34, wallZ + towardBoard * 0.93, towardBoard, segments, coarsePointer);
  addBox(group, [3.12, 0.18, 0.78], COLORS.walnutWarm, [leftX, 2.02, shelfZ], { roughness: 0.42, clearcoat: 0.5 });
  addBox(group, [3.14, 0.08, 0.82], COLORS.brassDark, [leftX, 1.89, shelfZ], { metalness: 0.6, roughness: 0.28 });
  addBookStack(group, leftX + (whiteSide ? 0.72 : -0.72), 2.12, shelfZ + towardBoard * 0.06, !whiteSide, coarsePointer);
  addVase(group, leftX + (whiteSide ? -1.02 : 1.02), 2.08, shelfZ + towardBoard * 0.05, COLORS.burgundy, segments);
  addPictureFrame(group, leftX, 3.65, wallZ + towardBoard * 0.54, towardBoard, whiteSide, coarsePointer);

  // Ala de mando: segundo cuadro, libros, lámpara y cajonera.
  addBox(group, [3.25, 0.22, 0.82], COLORS.walnutWarm, [rightX, 1.83, shelfZ], { roughness: 0.46, clearcoat: 0.44 });
  addBox(group, [3.25, 0.16, 0.84], COLORS.brassDark, [rightX, 1.69, shelfZ], { metalness: 0.58, roughness: 0.28 });
  addBankerLamp(group, rightX + (whiteSide ? -0.72 : 0.72), 1.92, shelfZ + towardBoard * 0.22, whiteSide ? -1 : 1, segments, coarsePointer);
  addBookStack(group, rightX + (whiteSide ? 0.46 : -0.46), 1.96, shelfZ + towardBoard * 0.08, whiteSide, coarsePointer);
  addVase(group, rightX + (whiteSide ? 1.08 : -1.08), 1.91, shelfZ + towardBoard * 0.06, COLORS.bottleGreen, segments);
  addPictureFrame(group, rightX, 3.66, wallZ + towardBoard * 0.54, towardBoard, !whiteSide, coarsePointer);
  addCommandCabinet(group, rightX, 0.42, wallZ + towardBoard * 1.08, towardBoard, segments, coarsePointer);

  // Zona habitable: dos sofás bajos, detrás de la última fila del tablero.
  // En móvil conservamos la silueta pero quitamos capitoné y segmentos caros.
  addWarRoomSofa(group, -5.55, 0.02, wallZ + towardBoard * 2.42, towardBoard, -1, segments, coarsePointer);
  addWarRoomSofa(group, 5.55, 0.02, wallZ + towardBoard * 2.42, towardBoard, 1, segments, coarsePointer);

  if (!coarsePointer) {
    addVase(group, rightX + (whiteSide ? -1.18 : 1.18), 3.04, wallZ + towardBoard * 0.58, COLORS.teal, segments);
    addBookStack(group, leftX + (whiteSide ? -0.76 : 0.76), 3.03, wallZ + towardBoard * 0.58, !whiteSide, false);
  }

  addCinematicAccentLights(group, theme, wallZ, towardBoard, coarsePointer);
  return group;
}

function addWarTablePapers(group, coarsePointer = false) {
  const paper = material(0xb6a681, { metalness: 0, roughness: 0.9, clearcoat: 0.02, specularIntensity: 0.18 });
  const ink = material(0x27221b, { metalness: 0, roughness: 0.95, clearcoat: 0, specularIntensity: 0.08 });
  const leather = material(0x2b1512, { metalness: 0, roughness: 0.72, clearcoat: 0.08, sheen: 0.18, sheenColor: 0x6e3d32 });
  const brass = material(COLORS.brassDark, { metalness: 0.82, roughness: 0.34, clearcoat: 0.18 });

  const folio = new THREE.Group();
  folio.name = 'war-table-field-folio';
  addMesh(folio, new THREE.BoxGeometry(1.1, 0.035, 0.72), leather, [-4.64, 0.11, -3.92], [0, 0.22, 0]);
  addMesh(folio, new THREE.BoxGeometry(0.92, 0.018, 0.61), paper, [-4.59, 0.145, -3.86], [0, 0.18, 0.018]);
  if (!coarsePointer) {
    for (let index = 0; index < 4; index += 1) {
      addMesh(folio, new THREE.BoxGeometry(0.52 - index * 0.055, 0.004, 0.012), ink,
        [-4.68 + index * 0.035, 0.16 + index * 0.001, -3.78 - index * 0.105], [0, 0.18, 0]);
    }
  }
  addMesh(folio, new THREE.CylinderGeometry(0.055, 0.055, 0.055, 18), brass, [-4.24, 0.185, -3.6]);
  group.add(folio);

  const pencil = new THREE.Group();
  pencil.name = 'war-table-map-pencil';
  addMesh(pencil, new THREE.CylinderGeometry(0.022, 0.022, 1.12, 12), material(0x7a4b27, { roughness: 0.76, clearcoat: 0.05 }), [4.73, 0.16, -2.3], [Math.PI / 2, 0, 0.08]);
  addMesh(pencil, new THREE.ConeGeometry(0.028, 0.12, 12), material(0x25201c, { roughness: 0.9, clearcoat: 0 }), [4.73, 0.16, -2.88], [Math.PI / 2, 0, 0]);
  group.add(pencil);
}

function addCommandChronometer(group, coarsePointer = false) {
  const brass = material(COLORS.brass, { metalness: 0.9, roughness: 0.3, clearcoat: 0.2, clearcoatRoughness: 0.28 });
  const face = material(0x9c9071, { metalness: 0, roughness: 0.82, clearcoat: 0.05, specularIntensity: 0.18 });
  const dark = material(0x15171a, { metalness: 0.12, roughness: 0.72, clearcoat: 0.08 });
  const watch = new THREE.Group();
  watch.name = 'war-table-command-chronometer';
  addMesh(watch, new THREE.CylinderGeometry(0.25, 0.25, 0.055, coarsePointer ? 18 : 32), brass, [4.62, 0.14, 3.86]);
  addMesh(watch, new THREE.CylinderGeometry(0.205, 0.205, 0.015, coarsePointer ? 18 : 32), face, [4.62, 0.18, 3.86]);
  if (!coarsePointer) {
    addMesh(watch, new THREE.BoxGeometry(0.018, 0.008, 0.145), dark, [4.62, 0.195, 3.81], [0, 0.45, 0]);
    addMesh(watch, new THREE.BoxGeometry(0.012, 0.009, 0.1), dark, [4.62, 0.197, 3.86], [0, -0.72, 0]);
    addMesh(watch, new THREE.TorusGeometry(0.29, 0.018, 8, 30), brass, [4.62, 0.15, 3.86], [Math.PI / 2, 0, 0]);
  }
  group.add(watch);
}

function addMatthiasCommandRelic(group, theme, coarsePointer = false) {
  const brass = material(theme?.glow ?? COLORS.brass, { metalness: 0.86, roughness: 0.3, clearcoat: 0.24 });
  const charcoal = material(0x17191d, { metalness: 0.12, roughness: 0.68, clearcoat: 0.08 });
  const relic = new THREE.Group();
  relic.name = 'matthias-command-relic';
  relic.userData.matthiasPresence = true;
  addMesh(relic, new THREE.CylinderGeometry(0.3, 0.36, 0.09, coarsePointer ? 16 : 28), brass, [-4.62, 0.13, 4.08]);
  addMesh(relic, new THREE.CylinderGeometry(0.17, 0.24, 0.42, coarsePointer ? 16 : 28), charcoal, [-4.62, 0.38, 4.08]);
  addMesh(relic, new THREE.SphereGeometry(0.19, coarsePointer ? 16 : 28, coarsePointer ? 10 : 18), material(0x8e7354, { roughness: 0.82, clearcoat: 0.03 }), [-4.62, 0.67, 4.08]);
  addMesh(relic, new THREE.CylinderGeometry(0.22, 0.25, 0.07, coarsePointer ? 16 : 28), charcoal, [-4.62, 0.82, 4.08]);
  addMesh(relic, new THREE.BoxGeometry(0.29, 0.025, 0.12), charcoal, [-4.62, 0.79, 3.96], [0.08, 0, 0]);
  addMesh(relic, new THREE.SphereGeometry(0.035, 10, 8), brass, [-4.62, 0.825, 3.84]);
  group.add(relic);
}

function addTableEdgeWear(group, coarsePointer = false) {
  if (coarsePointer) return;
  const wear = material(0x7b5730, { metalness: 0.02, roughness: 0.82, clearcoat: 0.02, opacity: 0.48, specularIntensity: 0.18 });
  const marks = [
    [-3.8, -5.245, 0.48, 0.022], [-1.25, -5.245, 0.25, 0.018], [2.72, -5.245, 0.4, 0.02],
    [5.245, -2.95, 0.022, 0.42], [5.245, 2.1, 0.02, 0.3], [-5.245, 1.1, 0.02, 0.36],
  ];
  for (const [x, z, sx, sz] of marks) addMesh(group, new THREE.BoxGeometry(sx, 0.012, sz), wear, [x, 0.055, z]);
}

export function buildPremiumTableLayer(theme, coarsePointer = false) {
  const group = new THREE.Group();
  group.name = 'premium-table-layer';
  group.userData.premiumPass = 'cinematic-v3-teutonic';

  const brass = material(theme?.glow ?? COLORS.brass, { metalness: 0.86, roughness: 0.2, clearcoat: 0.76, clearcoatRoughness: 0.07 });
  const leather = material(COLORS.burgundyDark, { roughness: 0.46, clearcoat: 0.3, clearcoatRoughness: 0.16, sheen: 0.38, sheenColor: 0x8c4c56 });
  const walnut = material(COLORS.walnutWarm, { metalness: 0.04, roughness: 0.4, clearcoat: 0.54, clearcoatRoughness: 0.14 });
  const emerald = material(COLORS.emerald, { roughness: 0.42, clearcoat: 0.34, sheen: 0.22, sheenColor: 0x6ea88c });

  addMesh(group, new THREE.BoxGeometry(10.25, 0.07, 10.25), leather, [0, -0.165, 0]);

  for (const [x, z, sx, sz] of [
    [0, 5.23, 10.55, 0.18], [0, -5.23, 10.55, 0.18],
    [5.23, 0, 0.18, 10.55], [-5.23, 0, 0.18, 10.55],
  ]) addMesh(group, new THREE.BoxGeometry(sx, 0.2, sz), walnut, [x, -0.08, z]);

  for (const [x, z, sx, sz] of [
    [0, 5.1, 10.24, 0.045], [0, -5.1, 10.24, 0.045],
    [5.1, 0, 0.045, 10.24], [-5.1, 0, 0.045, 10.24],
  ]) addMesh(group, new THREE.BoxGeometry(sx, 0.075, sz), brass, [x, 0.035, z]);

  const emeraldInlay = new THREE.Group();
  emeraldInlay.name = 'emerald-table-inlay';
  for (const [x, z, sx, sz] of [
    [0, 4.88, 9.74, 0.055], [0, -4.88, 9.74, 0.055],
    [4.88, 0, 0.055, 9.74], [-4.88, 0, 0.055, 9.74],
  ]) addMesh(emeraldInlay, new THREE.BoxGeometry(sx, 0.04, sz), emerald, [x, 0.045, z]);
  group.add(emeraldInlay);

  const cornerSegments = coarsePointer ? 12 : 22;
  for (const x of [-5.15, 5.15]) {
    for (const z of [-5.15, 5.15]) {
      addMesh(group, new THREE.CylinderGeometry(0.16, 0.2, 0.12, cornerSegments), brass, [x, 0.01, z]);
      addMesh(group, new THREE.SphereGeometry(0.08, cornerSegments, 8), brass, [x, 0.11, z]);
      if (!coarsePointer) {
        addMesh(group, new THREE.TorusGeometry(0.11, 0.018, 8, cornerSegments), emerald, [x, 0.12, z], [Math.PI / 2, 0, 0]);
      }
    }
  }

  addWarTablePapers(group, coarsePointer);
  addCommandChronometer(group, coarsePointer);
  addMatthiasCommandRelic(group, theme, coarsePointer);
  addTableEdgeWear(group, coarsePointer);

  return group;
}
