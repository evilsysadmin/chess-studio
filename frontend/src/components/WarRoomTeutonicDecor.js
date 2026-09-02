import * as THREE from 'three';

function physical(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0,
    roughness: options.roughness ?? 0.72,
    roughnessMap: options.roughnessMap ?? null,
    bumpMap: options.bumpMap ?? null,
    bumpScale: options.bumpScale ?? 0,
    clearcoat: options.clearcoat ?? 0.08,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.42,
    specularIntensity: options.specularIntensity ?? 0.24,
    sheen: options.sheen ?? 0,
    sheenRoughness: options.sheenRoughness ?? 0.6,
    sheenColor: new THREE.Color(options.sheenColor ?? color),
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
}

function addMesh(group, geometry, material, position, rotation = [0, 0, 0], name = '') {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  group.add(mesh);
  return mesh;
}

function addBox(group, size, material, position, name = '', rotation = [0, 0, 0]) {
  return addMesh(group, new THREE.BoxGeometry(...size), material, position, rotation, name);
}

function createHammeredSteelTexture(seed = 1) {
  const width = 64;
  const height = 64;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const wave = Math.sin((x + seed * 7) * 0.41) * 18 + Math.cos((y - seed * 3) * 0.37) * 15;
      const cross = Math.sin((x + y) * 0.79 + seed) * 10;
      const fleck = ((x * 23 + y * 31 + seed * 19 + x * y * 5) % 41) - 20;
      const value = THREE.MathUtils.clamp(Math.round(142 + wave + cross + fleck * 0.7), 72, 218);
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `war-room-hammered-steel-${seed}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.5, 4.2);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.userData.warRoomArmorTexture = 'hammered-steel-v2';
  return texture;
}

function addTeutonicMasonry(group, { wallZ, towardBoard }) {
  const masonry = new THREE.Group();
  masonry.name = 'war-room-teutonic-masonry';
  masonry.userData.warRoomWallFinish = 'smoked-rhenish-ashlar-v2';
  const stone = physical(0x373633, { roughness: 0.94, clearcoat: 0.012, specularIntensity: 0.11 });
  const stoneLift = physical(0x4a4843, { roughness: 0.9, clearcoat: 0.018, specularIntensity: 0.14 });
  const grout = physical(0x1c1b19, { roughness: 0.99, clearcoat: 0, specularIntensity: 0.03 });
  const depth = 13.05;
  const centerZ = wallZ + towardBoard * (depth / 2);

  for (const side of [-1, 1]) {
    const x = side * 7.73;
    const skin = addBox(
      masonry,
      [0.075, 5.34, depth],
      stone,
      [x, 2.43, centerZ],
      side < 0 ? 'war-room-teutonic-wall-left' : 'war-room-teutonic-wall-right',
    );
    skin.userData.warRoomMasonry = 'dark-ashlar';
    addBox(masonry, [0.1, 0.2, depth], stoneLift, [side * 7.68, 0.07, centerZ], 'war-room-teutonic-wall-plinth');

    for (const y of [0.72, 1.42, 2.12, 2.82, 3.52, 4.22, 4.92]) {
      const line = addBox(masonry, [0.085, 0.026, depth - 0.18], grout, [side * 7.685, y, centerZ], 'war-room-teutonic-mortar-course');
      line.castShadow = false;
    }

    for (let row = 0; row < 7; row += 1) {
      const y = 0.37 + row * 0.7;
      const stagger = row % 2 ? 1.12 : 0;
      for (let offset = 1.1 + stagger; offset < depth - 0.55; offset += 2.25) {
        const joint = addBox(
          masonry,
          [0.086, 0.61, 0.027],
          grout,
          [side * 7.68, y, wallZ + towardBoard * offset],
          'war-room-teutonic-mortar-joint',
        );
        joint.castShadow = false;
      }
    }
  }

  group.add(masonry);
  return masonry;
}

function addRivet(group, material, position, name = 'war-room-armor-rivet') {
  const rivet = addMesh(group, new THREE.SphereGeometry(0.018, 8, 6), material, position, [0, 0, 0], name);
  rivet.castShadow = false;
  return rivet;
}

function addTeutonicArmor(group, { side, wallZ, towardBoard }) {
  const armor = new THREE.Group();
  armor.name = side < 0 ? 'war-room-teutonic-armor-left' : 'war-room-teutonic-armor-right';
  armor.userData.warRoomArmorScale = 'human';
  armor.userData.warRoomArmorStyle = 'german-gothic-plate';
  armor.userData.warRoomArmorFinish = 'hammered-fluted-steel-v2';
  armor.userData.warRoomWeapon = 'zweihander-two-handed';
  armor.position.set(side * 6.68, 0, wallZ + towardBoard * 4.48);
  armor.rotation.y = side * 0.055;

  const hammered = createHammeredSteelTexture(side < 0 ? 3 : 7);
  const steel = physical(0x596166, {
    metalness: 0.9,
    roughness: 0.38,
    roughnessMap: hammered,
    bumpMap: hammered,
    bumpScale: 0.016,
    clearcoat: 0.16,
    clearcoatRoughness: 0.34,
    specularIntensity: 0.72,
  });
  const steelDark = physical(0x252a2d, {
    metalness: 0.8,
    roughness: 0.5,
    roughnessMap: hammered,
    bumpMap: hammered,
    bumpScale: 0.012,
    clearcoat: 0.08,
    specularIntensity: 0.48,
  });
  const edge = physical(0x9ca3a4, { metalness: 0.94, roughness: 0.22, clearcoat: 0.24, clearcoatRoughness: 0.2, specularIntensity: 0.92 });
  const chain = physical(0x303538, { metalness: 0.68, roughness: 0.64, bumpMap: hammered, bumpScale: 0.01, specularIntensity: 0.4 });
  const leather = physical(0x24150f, { roughness: 0.82, clearcoat: 0.035, specularIntensity: 0.14 });
  const oxblood = physical(0x351719, { roughness: 0.78, clearcoat: 0.04, sheen: 0.18, sheenColor: 0x7a3438 });
  const brass = physical(0x765121, { metalness: 0.82, roughness: 0.34, clearcoat: 0.18, specularIntensity: 0.62 });
  const voidMat = physical(0x090a0b, { roughness: 1, clearcoat: 0, specularIntensity: 0.02 });

  addMesh(armor, new THREE.CylinderGeometry(0.46, 0.52, 0.12, 28), physical(0x201f1d, { roughness: 0.95 }), [0, 0.06, 0], [0, 0, 0], 'war-room-armor-plinth');

  for (const legSide of [-1, 1]) {
    const greave = addMesh(armor, new THREE.CapsuleGeometry(0.095, 0.36, 4, 12), steelDark, [legSide * 0.165, 0.45, 0], [0, 0, legSide * 0.025], 'war-room-armor-greave');
    greave.scale.z = 0.82;
    addBox(armor, [0.022, 0.43, 0.16], edge, [legSide * 0.165, 0.45, towardBoard * 0.075], 'war-room-armor-greave-flute');

    const knee = addMesh(armor, new THREE.SphereGeometry(0.12, 16, 10), steel, [legSide * 0.165, 0.72, towardBoard * 0.015], [0, 0, 0], 'war-room-armor-poleyn');
    knee.scale.set(1.08, 0.82, 0.9);
    addMesh(
      armor,
      new THREE.ConeGeometry(0.07, 0.2, 8),
      edge,
      [legSide * 0.29, 0.72, 0],
      [0, 0, -legSide * Math.PI / 2],
      'war-room-armor-knee-wing',
    );

    const thigh = addMesh(armor, new THREE.CapsuleGeometry(0.12, 0.32, 4, 12), steel, [legSide * 0.16, 0.97, 0], [0, 0, -legSide * 0.035], 'war-room-armor-cuisse');
    thigh.scale.z = 0.84;
    addBox(armor, [0.022, 0.38, 0.18], edge, [legSide * 0.16, 0.98, towardBoard * 0.085], 'war-room-armor-cuisse-flute');

    addBox(armor, [0.24, 0.105, 0.34], steelDark, [legSide * 0.17, 0.17, towardBoard * 0.065], 'war-room-armor-sabaton');
    addMesh(
      armor,
      new THREE.ConeGeometry(0.13, 0.26, 8),
      steelDark,
      [legSide * 0.17, 0.17, towardBoard * 0.25],
      [towardBoard > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0],
      'war-room-armor-sabaton-point',
    );
  }

  addBox(armor, [0.54, 0.15, 0.34], leather, [0, 1.19, 0], 'war-room-armor-belt');
  addBox(armor, [0.11, 0.18, 0.05], brass, [0, 1.19, towardBoard * 0.19], 'war-room-armor-belt-buckle');

  for (let plate = 0; plate < 3; plate += 1) {
    const fauld = addMesh(
      armor,
      new THREE.CylinderGeometry(0.31 + plate * 0.035, 0.34 + plate * 0.035, 0.105, 20),
      plate === 1 ? steelDark : steel,
      [0, 1.27 - plate * 0.09, 0],
      [0, 0, 0],
      'war-room-armor-fauld-plate',
    );
    fauld.scale.z = 0.64;
  }
  for (const hipSide of [-1, 1]) {
    addBox(armor, [0.22, 0.34, 0.08], steelDark, [hipSide * 0.2, 1.08, towardBoard * 0.13], 'war-room-armor-tasset', [0, 0, hipSide * 0.06]);
    addBox(armor, [0.17, 0.3, 0.025], oxblood, [hipSide * 0.19, 1.06, -towardBoard * 0.02], 'war-room-armor-leather-skirt');
  }

  const breast = addMesh(armor, new THREE.SphereGeometry(0.44, 26, 18), steel, [0, 1.56, 0], [0, 0, 0], 'war-room-armor-breastplate');
  breast.scale.set(0.88, 1.06, 0.49);
  addBox(armor, [0.035, 0.65, 0.035], edge, [0, 1.58, towardBoard * 0.214], 'war-room-armor-breast-keel');
  for (const fluteX of [-0.24, -0.12, 0.12, 0.24]) {
    addBox(
      armor,
      [0.018, 0.52, 0.025],
      edge,
      [fluteX, 1.57, towardBoard * (0.198 - Math.abs(fluteX) * 0.13)],
      'war-room-armor-breast-flute',
      [0, 0, -fluteX * 0.18],
    );
  }
  addMesh(armor, new THREE.TorusGeometry(0.22, 0.045, 8, 20), chain, [0, 1.84, 0], [Math.PI / 2, 0, 0], 'war-room-armor-gorget-mail');
  addMesh(armor, new THREE.CylinderGeometry(0.22, 0.27, 0.13, 20), steelDark, [0, 1.83, 0], [0, 0, 0], 'war-room-armor-gorget');

  for (const armSide of [-1, 1]) {
    const shoulder = addMesh(armor, new THREE.SphereGeometry(0.2, 18, 12), steel, [armSide * 0.43, 1.72, 0], [0, 0, 0], 'war-room-armor-pauldron');
    shoulder.scale.set(1.28, 0.74, 1.0);
    addBox(armor, [0.34, 0.08, 0.28], steelDark, [armSide * 0.44, 1.63, 0], 'war-room-armor-pauldron-lame', [0, 0, armSide * 0.08]);
    for (const rivetX of [-0.07, 0.07]) addRivet(armor, brass, [armSide * 0.43 + rivetX, 1.72, towardBoard * 0.18]);

    const upper = addMesh(
      armor,
      new THREE.CapsuleGeometry(0.082, 0.28, 4, 10),
      steelDark,
      [armSide * 0.37, 1.47, towardBoard * 0.08],
      [0, 0, armSide * 0.38],
      'war-room-armor-rerebrace',
    );
    upper.scale.z = 0.84;
    const elbow = addMesh(armor, new THREE.SphereGeometry(0.095, 14, 9), steel, [armSide * 0.29, 1.29, towardBoard * 0.13], [0, 0, 0], 'war-room-armor-couter');
    elbow.scale.set(1.05, 0.84, 0.9);
    addMesh(
      armor,
      new THREE.ConeGeometry(0.055, 0.16, 8),
      edge,
      [armSide * 0.39, 1.29, towardBoard * 0.12],
      [0, 0, -armSide * Math.PI / 2],
      'war-room-armor-elbow-wing',
    );

    const forearm = addMesh(
      armor,
      new THREE.CapsuleGeometry(0.074, 0.31, 4, 10),
      steel,
      [armSide * 0.2, 1.08, towardBoard * 0.23],
      [0, 0, armSide * 0.53],
      'war-room-armor-vambrace',
    );
    forearm.scale.z = 0.82;
    addBox(armor, [0.018, 0.34, 0.13], edge, [armSide * 0.2, 1.08, towardBoard * 0.295], 'war-room-armor-vambrace-flute', [0, 0, armSide * 0.53]);

    const handY = armSide < 0 ? 0.89 : 0.76;
    const hand = addMesh(armor, new THREE.SphereGeometry(0.085, 14, 9), steelDark, [armSide * 0.08, handY, towardBoard * 0.39], [0, 0, 0], 'war-room-armor-gauntlet');
    hand.scale.set(1.0, 0.72, 0.82);
  }

  const helmet = addMesh(armor, new THREE.SphereGeometry(0.285, 26, 18), steel, [0, 2.07, 0], [0, 0, 0], 'war-room-armor-helmet');
  helmet.scale.set(0.94, 1.02, 0.9);
  addMesh(armor, new THREE.TorusGeometry(0.27, 0.025, 8, 24), edge, [0, 2.05, 0], [Math.PI / 2, 0, 0], 'war-room-armor-helmet-brow');
  addMesh(
    armor,
    new THREE.ConeGeometry(0.28, 0.34, 4),
    steelDark,
    [0, 2.03, towardBoard * 0.24],
    [towardBoard > 0 ? Math.PI / 2 : -Math.PI / 2, 0, Math.PI / 4],
    'war-room-armor-sallet-visor',
  );
  addBox(armor, [0.42, 0.12, 0.12], steelDark, [0, 1.95, -towardBoard * 0.2], 'war-room-armor-sallet-tail', [towardBoard * 0.22, 0, 0]);
  addBox(armor, [0.34, 0.18, 0.08], steelDark, [0, 1.91, towardBoard * 0.17], 'war-room-armor-bevor');
  for (const slitX of [-0.13, -0.043, 0.043, 0.13]) {
    addBox(armor, [0.052, 0.018, 0.014], voidMat, [slitX, 2.04, towardBoard * 0.405], 'war-room-armor-visor-slit');
  }
  addBox(armor, [0.035, 0.38, 0.05], edge, [0, 2.22, 0], 'war-room-armor-helmet-comb', [0, 0, 0]);

  const sword = new THREE.Group();
  sword.name = 'war-room-zweihander';
  sword.userData.warRoomSwordType = 'two-handed';
  sword.userData.warRoomSwordFinish = 'fullered-ceremonial-v2';
  sword.position.set(0, 0, towardBoard * 0.44);
  sword.rotation.z = side * 0.035;

  addBox(sword, [0.105, 1.38, 0.038], edge, [0, 1.64, 0], 'war-room-zweihander-blade');
  addBox(sword, [0.032, 1.28, 0.012], steelDark, [0, 1.66, towardBoard * 0.027], 'war-room-zweihander-fuller');
  addMesh(
    sword,
    new THREE.ConeGeometry(0.065, 0.28, 4),
    edge,
    [0, 2.46, 0],
    [0, 0, Math.PI / 4],
    'war-room-zweihander-tip',
  );
  addBox(sword, [0.12, 0.23, 0.045], steelDark, [0, 1.01, 0], 'war-room-zweihander-ricasso');
  addBox(sword, [0.78, 0.06, 0.06], steelDark, [0, 0.92, 0], 'war-room-zweihander-crossguard', [0, 0, side * 0.035]);
  addMesh(sword, new THREE.ConeGeometry(0.045, 0.18, 8), edge, [-0.38, 0.92, 0], [0, 0, Math.PI / 2], 'war-room-zweihander-quillon-left');
  addMesh(sword, new THREE.ConeGeometry(0.045, 0.18, 8), edge, [0.38, 0.92, 0], [0, 0, -Math.PI / 2], 'war-room-zweihander-quillon-right');
  addBox(sword, [0.3, 0.04, 0.045], edge, [0, 1.12, 0], 'war-room-zweihander-parrying-hooks');
  addBox(sword, [0.09, 0.47, 0.075], leather, [0, 0.63, 0], 'war-room-zweihander-grip');
  for (const wrapY of [0.45, 0.52, 0.59, 0.66, 0.73, 0.8]) {
    addBox(sword, [0.1, 0.014, 0.08], oxblood, [0, wrapY, towardBoard * 0.005], 'war-room-zweihander-grip-wrap');
  }
  addMesh(sword, new THREE.SphereGeometry(0.105, 14, 10), brass, [0, 0.34, 0], [0, 0, 0], 'war-room-zweihander-pommel');
  armor.add(sword);

  group.add(armor);
  return armor;
}

function sceneRoot(object) {
  let current = object;
  while (current?.parent) current = current.parent;
  return current;
}

function tuneGroupMaterials(group, multiplier, maxMetalness = 0.45) {
  if (!group) return;
  const seen = new Set();
  group.traverse((child) => {
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!material?.color || seen.has(material) || (material.metalness ?? 0) > maxMetalness) return;
      seen.add(material);
      material.color.multiplyScalar(multiplier);
      if (typeof material.roughness === 'number') material.roughness = Math.min(1, material.roughness + 0.035);
      material.needsUpdate = true;
    });
  });
}

function recolorCastleWalls(root, coarsePointer) {
  const wallGroup = root?.getObjectByName?.('war-room-castle-side-walls');
  if (!wallGroup || wallGroup.userData.warRoomDarkCastleCoherence) return;
  wallGroup.userData.warRoomDarkCastleCoherence = 'smoked-rhenish-v2';
  const seen = new Set();
  wallGroup.traverse((child) => {
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((mat) => {
      if (!mat?.color || seen.has(mat) || (mat.metalness ?? 0) > 0.5) return;
      seen.add(mat);
      const trimLike = child.name?.includes?.('panel') || child.name?.includes?.('joint');
      mat.color.setHex(trimLike ? (coarsePointer ? 0x514d47 : 0x555049) : (coarsePointer ? 0x3f3d39 : 0x363532));
      if (typeof mat.roughness === 'number') mat.roughness = Math.max(mat.roughness, 0.88);
      if (typeof mat.clearcoat === 'number') mat.clearcoat = Math.min(mat.clearcoat, 0.025);
      mat.needsUpdate = true;
    });
  });
}

function addPremiumSofaDetails(sofa, towardBoard, coarsePointer) {
  if (!sofa || sofa.userData.warRoomPremiumUpholstery) return;
  sofa.userData.warRoomPremiumUpholstery = 'club-tufted-v2';
  const leather = physical(0x35161a, { roughness: 0.48, clearcoat: 0.22, clearcoatRoughness: 0.3, sheen: 0.5, sheenRoughness: 0.68, sheenColor: 0x8f4a53 });
  const leatherHi = physical(0x532229, { roughness: 0.43, clearcoat: 0.28, clearcoatRoughness: 0.24, sheen: 0.56, sheenColor: 0xac6369 });
  const walnut = physical(0x3b2114, { roughness: 0.52, clearcoat: 0.3, clearcoatRoughness: 0.28, specularIntensity: 0.34 });
  const brass = physical(0x8b6329, { metalness: 0.76, roughness: 0.31, clearcoat: 0.28, specularIntensity: 0.62 });

  const cushionXs = coarsePointer ? [0] : [-0.43, 0.43];
  for (const x of cushionXs) {
    const cushion = addMesh(
      sofa,
      new THREE.CapsuleGeometry(coarsePointer ? 0.2 : 0.17, coarsePointer ? 0.84 : 0.45, coarsePointer ? 2 : 4, coarsePointer ? 8 : 12),
      leatherHi,
      [x, 0.69, 0],
      [0, 0, Math.PI / 2],
      'war-room-sofa-seat-cushion',
    );
    cushion.scale.z = coarsePointer ? 1.35 : 1.72;
  }

  addBox(sofa, [1.54, 0.08, 0.08], walnut, [0, 0.77, -towardBoard * 0.49], 'war-room-sofa-walnut-rail');
  const backPad = addMesh(
    sofa,
    new THREE.CapsuleGeometry(0.22, 1.12, coarsePointer ? 2 : 4, coarsePointer ? 8 : 14),
    leather,
    [0, 1.03, -towardBoard * 0.42],
    [0, 0, Math.PI / 2],
    'war-room-sofa-back-cushion',
  );
  backPad.scale.z = 0.58;

  if (!coarsePointer) {
    for (const x of [-0.55, -0.18, 0.18, 0.55]) addRivet(sofa, brass, [x, 1.04, towardBoard * -0.29], 'war-room-sofa-tuft-button');
    for (const edgeSide of [-1, 1]) {
      for (let index = 0; index < 4; index += 1) {
        addRivet(sofa, brass, [edgeSide * 0.91, 0.54 + index * 0.11, towardBoard * 0.32], 'war-room-sofa-brass-nail');
      }
    }
  }
}

function addPremiumConsoleDetails(consoleGroup, coarsePointer) {
  if (!consoleGroup || consoleGroup.userData.warRoomPremiumConsole) return;
  consoleGroup.userData.warRoomPremiumConsole = 'campaign-table-v2';
  const wood = physical(0x2b180f, { roughness: 0.58, clearcoat: 0.26, clearcoatRoughness: 0.32, specularIntensity: 0.3 });
  const brass = physical(0x8a6128, { metalness: 0.78, roughness: 0.3, clearcoat: 0.28, specularIntensity: 0.62 });
  addBox(consoleGroup, [0.72, 0.07, 1.72], wood, [0, 0.24, 0], 'war-room-console-lower-shelf');
  addBox(consoleGroup, [0.71, 0.27, 0.05], wood, [0, 0.7, -1.06], 'war-room-console-apron');
  if (!coarsePointer) {
    for (const [x, z] of [[-0.31, -1.02], [0.31, -1.02], [-0.31, 1.02], [0.31, 1.02]]) {
      addMesh(consoleGroup, new THREE.CylinderGeometry(0.04, 0.05, 0.12, 10), brass, [x, 0.08, z], [0, 0, 0], 'war-room-console-brass-foot');
    }
  }
}

function replaceConeFireWithLicks(fireCore, coarsePointer) {
  if (!fireCore || fireCore.userData.warRoomPremiumFire === 'lathed-licks-v2') return;
  const flames = fireCore.children.filter((child) => child?.isMesh);
  const radialSegments = coarsePointer ? 9 : 16;
  flames.forEach((flame, index) => {
    const old = flame.geometry;
    old?.computeBoundingBox?.();
    const oldHeight = old?.boundingBox ? Math.max(0.2, old.boundingBox.max.y - old.boundingBox.min.y) : 0.5;
    const profile = [
      [0.018, -0.32], [0.105 + (index % 2) * 0.018, -0.25], [0.145, -0.1],
      [0.115, 0.08], [0.072, 0.25], [0.032, 0.38], [0.006, 0.49],
    ].map(([radius, y]) => new THREE.Vector2(radius, y));
    const geometry = new THREE.LatheGeometry(profile, radialSegments);
    geometry.scale(1, oldHeight / 0.81, 0.78 + (index % 3) * 0.08);
    old?.dispose?.();
    flame.geometry = geometry;
    flame.userData.warRoomPremiumFlame = true;
    if (flame.material) {
      flame.material.transparent = true;
      flame.material.depthWrite = false;
      flame.material.blending = THREE.AdditiveBlending;
      flame.material.opacity = Math.min(flame.material.opacity ?? 0.82, index % 2 ? 0.72 : 0.8);
      flame.material.needsUpdate = true;
    }
  });
  fireCore.userData.warRoomPremiumFire = 'lathed-licks-v2';
}

function applyPremiumRoomPass(root, { wallZ, towardBoard, coarsePointer }) {
  if (!root || root.userData.warRoomPremiumCoherence === 'v4-gothic') return;
  root.userData.warRoomPremiumCoherence = 'v4-gothic';

  recolorCastleWalls(root, coarsePointer);
  tuneGroupMaterials(root.getObjectByName?.('coffered-paneling'), coarsePointer ? 0.78 : 0.66, 0.46);
  const curtainMaterials = new Set();
  root.traverse?.((child) => {
    if (!child?.name?.includes?.('war-room-velvet-curtain') || !child.material?.color || curtainMaterials.has(child.material)) return;
    curtainMaterials.add(child.material);
    child.material.color.multiplyScalar(coarsePointer ? 0.78 : 0.6);
    child.material.roughness = Math.max(child.material.roughness ?? 0.8, 0.9);
    child.material.needsUpdate = true;
  });

  const sofaOffset = coarsePointer ? 6.25 : 7.8;
  for (const [name, sofaSide] of [['war-room-sofa-left', -1], ['war-room-sofa-right', 1]]) {
    const sofa = root.getObjectByName?.(name);
    if (!sofa) continue;
    sofa.position.set(sofaSide * 6.6, 0.02, wallZ + towardBoard * sofaOffset);
    sofa.userData.warRoomOffsetFromWall = sofaOffset;
    sofa.userData.warRoomFurniturePlacement = 'side-wall-premium-spaced-v4';
    addPremiumSofaDetails(sofa, towardBoard, coarsePointer);
  }

  const consoleOffset = coarsePointer ? 3.3 : 1.15;
  for (const name of ['war-room-side-console-left', 'war-room-side-console-right']) {
    const consoleGroup = root.getObjectByName?.(name);
    if (!consoleGroup) continue;
    consoleGroup.position.z = wallZ + towardBoard * consoleOffset;
    consoleGroup.userData.warRoomOffsetFromWall = consoleOffset;
    consoleGroup.userData.warRoomFurniturePlacement = 'rear-console-premium-spaced-v4';
    addPremiumConsoleDetails(consoleGroup, coarsePointer);
  }

  root.userData.warRoomFurnitureGap = Math.abs(sofaOffset - consoleOffset);
  replaceConeFireWithLicks(root.getObjectByName?.('war-room-fire-core'), coarsePointer);
}

function attachPremiumRoomDriver(group, options) {
  const driver = group?.getObjectByName?.('war-room-castle-wall-left') || group?.getObjectByName?.('war-room-castle-floor-slab');
  if (!driver || driver.userData.warRoomPremiumRoomDriver) return;
  driver.userData.warRoomPremiumRoomDriver = true;
  const previous = driver.onBeforeRender;
  driver.onBeforeRender = (...args) => {
    previous?.(...args);
    applyPremiumRoomPass(sceneRoot(driver), options);
  };
}

export function installTeutonicWarRoomDecor(group, { wallZ, towardBoard, coarsePointer = false } = {}) {
  if (!group || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return 0;
  attachPremiumRoomDriver(group, { wallZ, towardBoard, coarsePointer });
  if (coarsePointer) return 0;

  addTeutonicMasonry(group, { wallZ, towardBoard });
  addTeutonicArmor(group, { side: -1, wallZ, towardBoard });
  addTeutonicArmor(group, { side: 1, wallZ, towardBoard });
  group.userData.warRoomTeutonicArmorCount = 2;
  group.userData.warRoomTeutonicStyle = 'smoked-rhenish-gothic-v2';
  return 2;
}
