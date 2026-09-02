import * as THREE from 'three';

function seededNoise(x, y, seed) {
  const value = Math.sin((x * 17.173 + y * 41.927 + seed * 73.119) * 0.83) * 43758.5453;
  return value - Math.floor(value);
}

function createMicroSurfaceTexture({ name, seed = 1, mode = 'steel' }) {
  const size = mode === 'canvas' ? 96 : 80;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const noise = seededNoise(x, y, seed);
      let value;
      if (mode === 'canvas') {
        const warp = Math.sin(x * Math.PI * 0.52) * 21;
        const weft = Math.sin(y * Math.PI * 0.47) * 18;
        const knot = Math.sin((x + y) * 0.31 + seed) * 7;
        value = 148 + warp + weft + knot + (noise - 0.5) * 12;
      } else if (mode === 'wood') {
        const grain = Math.sin((x * 0.18) + Math.sin(y * 0.09 + seed) * 2.2) * 24;
        const pore = Math.sin((x + y * 0.23) * 0.71 + seed) * 7;
        value = 142 + grain + pore + (noise - 0.5) * 18;
      } else if (mode === 'gilding') {
        const leaf = Math.sin(x * 0.27 + seed) * 8 + Math.cos(y * 0.33 - seed) * 7;
        const age = seededNoise(Math.floor(x / 5), Math.floor(y / 5), seed + 19) * 28;
        value = 154 + leaf + age + (noise - 0.5) * 10;
      } else {
        const brush = Math.sin(y * 0.61 + seed) * 9 + Math.sin(y * 1.73 + x * 0.035) * 4;
        const hammer = Math.cos(x * 0.19 + y * 0.23 + seed) * 10;
        const patina = seededNoise(Math.floor(x / 6), Math.floor(y / 6), seed + 37) * 24;
        value = 142 + brush + hammer + patina + (noise - 0.5) * 11;
      }

      const shade = THREE.MathUtils.clamp(Math.round(value), 58, 222);
      const index = (y * size + x) * 4;
      data[index] = shade;
      data[index + 1] = shade;
      data[index + 2] = shade;
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = name;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(mode === 'canvas' ? 7 : 3.5, mode === 'canvas' ? 5 : 5.5);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.userData.warRoomPremiumSurface = mode;
  texture.userData.warRoomPremiumSurfaceVersion = 'v3';
  return texture;
}

function physical(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0,
    roughness: options.roughness ?? 0.72,
    clearcoat: options.clearcoat ?? 0.08,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.42,
    specularIntensity: options.specularIntensity ?? 0.24,
    sheen: options.sheen ?? 0,
    sheenRoughness: options.sheenRoughness ?? 0.6,
    sheenColor: new THREE.Color(options.sheenColor ?? color),
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.opacity != null && options.opacity < 1,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
    side: options.side ?? THREE.FrontSide,
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

function applyArmorMaterialFinish(armor, seed) {
  const steelTexture = createMicroSurfaceTexture({
    name: `war-room-brushed-patina-steel-${seed}`,
    seed,
    mode: 'steel',
  });
  const seen = new Set();

  armor.traverse((child) => {
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material || seen.has(material) || (material.metalness ?? 0) < 0.55) continue;
      seen.add(material);
      material.roughnessMap = steelTexture;
      material.bumpMap = steelTexture;
      material.bumpScale = (material.metalness ?? 0) > 0.9 ? 0.0035 : 0.0075;
      material.roughness = Math.min(0.48, Math.max(0.23, (material.roughness ?? 0.36) + 0.015));
      if (typeof material.clearcoat === 'number') material.clearcoat = Math.max(material.clearcoat, 0.16);
      if (typeof material.clearcoatRoughness === 'number') material.clearcoatRoughness = Math.min(material.clearcoatRoughness, 0.34);
      if ('envMapIntensity' in material) material.envMapIntensity = Math.max(material.envMapIntensity ?? 0, 0.5);
      material.userData.warRoomPremiumArmorFinish = 'brushed-patina-metal-v3';
      material.needsUpdate = true;
    }
  });
}

function addArmorMuseumDetails(armor, towardBoard, side) {
  if (armor.getObjectByName('war-room-armor-heraldic-medallion')) return;

  const polished = physical(0xaab1b3, {
    metalness: 0.95,
    roughness: 0.19,
    clearcoat: 0.28,
    clearcoatRoughness: 0.18,
    specularIntensity: 0.94,
  });
  const antiqueBrass = physical(0x765527, {
    metalness: 0.82,
    roughness: 0.34,
    clearcoat: 0.18,
    clearcoatRoughness: 0.31,
    specularIntensity: 0.62,
  });
  const shadowSteel = physical(0x202528, {
    metalness: 0.78,
    roughness: 0.5,
    clearcoat: 0.1,
    specularIntensity: 0.42,
  });

  addMesh(
    armor,
    new THREE.CylinderGeometry(0.082, 0.082, 0.02, 20),
    antiqueBrass,
    [0, 1.58, towardBoard * 0.232],
    [Math.PI / 2, 0, 0],
    'war-room-armor-heraldic-medallion',
  );
  addBox(
    armor,
    [0.48, 0.022, 0.024],
    polished,
    [0, 1.73, towardBoard * 0.215],
    'war-room-armor-breast-etched-band',
  );

  for (const shoulderSide of [-1, 1]) {
    addBox(
      armor,
      [0.28, 0.026, 0.035],
      polished,
      [shoulderSide * 0.43, 1.79, towardBoard * 0.105],
      'war-room-armor-pauldron-polished-ridge',
      [0, 0, shoulderSide * 0.08],
    );
  }

  for (const legSide of [-1, 1]) {
    for (let plate = 0; plate < 3; plate += 1) {
      addBox(
        armor,
        [0.21 - plate * 0.016, 0.028, 0.055],
        plate === 1 ? polished : shadowSteel,
        [legSide * 0.17, 0.205 + plate * 0.035, towardBoard * (0.18 + plate * 0.025)],
        'war-room-armor-sabaton-lame',
      );
    }
  }

  for (const handSide of [-1, 1]) {
    const baseY = handSide < 0 ? 0.89 : 0.76;
    for (let finger = 0; finger < 3; finger += 1) {
      addBox(
        armor,
        [0.045, 0.026, 0.075],
        shadowSteel,
        [handSide * (0.075 - finger * 0.007), baseY - 0.03 - finger * 0.018, towardBoard * (0.425 + finger * 0.015)],
        'war-room-armor-gauntlet-finger-plate',
        [0, 0, handSide * 0.08],
      );
    }
  }

  const sword = armor.getObjectByName('war-room-zweihander');
  if (sword) {
    addBox(sword, [0.014, 1.27, 0.01], polished, [-0.042, 1.66, towardBoard * 0.026], 'war-room-zweihander-polished-edge-left');
    addBox(sword, [0.014, 1.27, 0.01], polished, [0.042, 1.66, towardBoard * 0.026], 'war-room-zweihander-polished-edge-right');
    addMesh(
      sword,
      new THREE.TorusGeometry(0.095, 0.012, 7, 18),
      antiqueBrass,
      [0, 0.34, 0],
      [Math.PI / 2, 0, 0],
      'war-room-zweihander-pommel-ring',
    );
  }

  armor.userData.warRoomArmorFinish = 'museum-gothic-steel-v3';
  armor.userData.warRoomArmorDetail = 'etched-riveted-articulated-v3';
  armor.userData.warRoomArmorDisplaySide = side < 0 ? 'left' : 'right';
}

function premiumizeArmor(armor, { seed, towardBoard, side }) {
  if (!armor || armor.userData.warRoomMuseumFinish === 'v3') return false;
  applyArmorMaterialFinish(armor, seed);
  addArmorMuseumDetails(armor, towardBoard, side);
  armor.userData.warRoomMuseumFinish = 'v3';
  return true;
}

function applyPaintingMaterials(frame, index) {
  const canvas = frame.getObjectByName('war-room-premium-painting-canvas');
  const weave = createMicroSurfaceTexture({
    name: `war-room-canvas-weave-${index}`,
    seed: 41 + index * 17,
    mode: 'canvas',
  });
  const gilding = createMicroSurfaceTexture({
    name: `war-room-aged-gilding-${index}`,
    seed: 53 + index * 19,
    mode: 'gilding',
  });
  const wood = createMicroSurfaceTexture({
    name: `war-room-frame-wood-grain-${index}`,
    seed: 71 + index * 23,
    mode: 'wood',
  });

  if (canvas?.material) {
    canvas.material.roughnessMap = weave;
    canvas.material.bumpMap = weave;
    canvas.material.bumpScale = 0.0045;
    canvas.material.roughness = Math.max(canvas.material.roughness ?? 0.8, 0.82);
    canvas.material.clearcoat = Math.max(canvas.material.clearcoat ?? 0, 0.025);
    canvas.material.clearcoatRoughness = 0.82;
    canvas.material.userData.warRoomCanvasFinish = 'woven-varnished-linen-v3';
    canvas.material.needsUpdate = true;
  }

  const seen = new Set();
  frame.traverse((child) => {
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material || seen.has(material) || material === canvas?.material) continue;
      seen.add(material);
      if ((material.metalness ?? 0) > 0.5) {
        material.roughnessMap = gilding;
        material.bumpMap = gilding;
        material.bumpScale = 0.0035;
        material.roughness = Math.min(0.42, Math.max(0.25, material.roughness ?? 0.32));
        material.userData.warRoomFrameFinish = 'aged-water-gilding-v3';
      } else if (material.color) {
        material.roughnessMap = wood;
        material.bumpMap = wood;
        material.bumpScale = 0.0055;
        material.userData.warRoomFrameFinish = 'hand-rubbed-walnut-v3';
      }
      material.needsUpdate = true;
    }
  });
}

function addPaintingMuseumDetails(frame, { index, towardBoard }) {
  if (frame.getObjectByName(`war-room-picture-lamp-${index}`)) return;

  const gilt = physical(0x9b7333, {
    metalness: 0.8,
    roughness: 0.29,
    clearcoat: 0.24,
    clearcoatRoughness: 0.24,
    specularIntensity: 0.68,
  });
  const darkGold = physical(0x5d421d, {
    metalness: 0.68,
    roughness: 0.42,
    clearcoat: 0.14,
    specularIntensity: 0.48,
  });
  const innerShadow = physical(0x1a120d, { roughness: 0.78, clearcoat: 0.04, specularIntensity: 0.12 });

  const beadGeometry = new THREE.SphereGeometry(0.022, 8, 6);
  for (const x of [-0.78, -0.39, 0, 0.39, 0.78]) {
    addMesh(frame, beadGeometry, darkGold, [x, 0.735, towardBoard * 0.139], [0, 0, 0], 'war-room-premium-frame-gilt-bead');
    addMesh(frame, beadGeometry, darkGold, [x, -0.735, towardBoard * 0.139], [0, 0, 0], 'war-room-premium-frame-gilt-bead');
  }

  for (const [cx, cy, rz] of [
    [-1.05, 0.76, 0.68], [1.05, 0.76, -0.68], [-1.05, -0.76, -0.68], [1.05, -0.76, 0.68],
  ]) {
    const leaf = addMesh(
      frame,
      new THREE.SphereGeometry(0.06, 12, 8),
      gilt,
      [cx, cy, towardBoard * 0.145],
      [0, 0, rz],
      'war-room-premium-frame-leaf-ornament',
    );
    leaf.scale.set(1.7, 0.48, 0.44);
    leaf.castShadow = false;
  }

  addBox(frame, [1.98, 0.025, 0.022], innerShadow, [0, 0.67, towardBoard * 0.145], 'war-room-premium-frame-inner-shadow-top');
  addBox(frame, [1.98, 0.025, 0.022], innerShadow, [0, -0.67, towardBoard * 0.145], 'war-room-premium-frame-inner-shadow-bottom');

  const lamp = new THREE.Group();
  lamp.name = `war-room-picture-lamp-${index}`;
  lamp.userData.warRoomPictureLamp = 'brass-gallery-lamp-v3';
  lamp.position.set(0, 1.08, towardBoard * 0.13);
  addBox(lamp, [0.82, 0.05, 0.055], gilt, [0, 0, 0], 'war-room-picture-lamp-bar');
  addBox(lamp, [0.055, 0.21, 0.05], darkGold, [-0.28, -0.12, -towardBoard * 0.015], 'war-room-picture-lamp-arm');
  addBox(lamp, [0.055, 0.21, 0.05], darkGold, [0.28, -0.12, -towardBoard * 0.015], 'war-room-picture-lamp-arm');
  const glow = addBox(
    lamp,
    [0.68, 0.018, 0.022],
    new THREE.MeshBasicMaterial({ color: 0xffd79a, transparent: true, opacity: 0.78 }),
    [0, -0.035, towardBoard * 0.036],
    'war-room-picture-lamp-glow',
  );
  glow.castShadow = false;
  glow.receiveShadow = false;
  frame.add(lamp);

  const plaque = new THREE.Group();
  plaque.name = `war-room-picture-plaque-${index}`;
  plaque.position.set(0, -1.05, towardBoard * 0.12);
  addBox(plaque, [0.58, 0.13, 0.026], darkGold, [0, 0, 0], 'war-room-picture-plaque-bed');
  addBox(plaque, [0.46, 0.022, 0.012], gilt, [0, 0, towardBoard * 0.022], 'war-room-picture-plaque-line');
  frame.add(plaque);

  const varnish = addMesh(
    frame,
    new THREE.PlaneGeometry(1.9, 1.28),
    physical(0xffffff, {
      roughness: 0.2,
      clearcoat: 0.95,
      clearcoatRoughness: 0.16,
      specularIntensity: 0.75,
      opacity: 0.035,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    [0, 0, towardBoard * 0.134],
    [0, 0, 0],
    'war-room-painting-varnish',
  );
  varnish.castShadow = false;
  varnish.receiveShadow = false;

  frame.userData.warRoomPaintingFinish = 'museum-canvas-and-gilding-v3';
  frame.userData.warRoomGalleryFinish = 'lit-carved-frame-v3';
}

function premiumizePainting(frame, options) {
  if (!frame || frame.userData.warRoomMuseumFinish === 'v3') return false;
  applyPaintingMaterials(frame, options.index);
  addPaintingMuseumDetails(frame, options);
  frame.userData.warRoomMuseumFinish = 'v3';
  return true;
}

export function applyWarRoomPremiumFinishPass(group, { towardBoard = 1 } = {}) {
  if (!group || group.userData.warRoomPremiumFinishVersion === 'museum-gothic-v3') return 0;

  let upgraded = 0;
  upgraded += premiumizeArmor(group.getObjectByName('war-room-teutonic-armor-left'), {
    seed: 101,
    towardBoard,
    side: -1,
  }) ? 1 : 0;
  upgraded += premiumizeArmor(group.getObjectByName('war-room-teutonic-armor-right'), {
    seed: 149,
    towardBoard,
    side: 1,
  }) ? 1 : 0;

  for (const index of [0, 1]) {
    upgraded += premiumizePainting(group.getObjectByName(`war-room-premium-painting-${index}`), {
      index,
      towardBoard,
    }) ? 1 : 0;
  }

  group.userData.warRoomPremiumFinishVersion = 'museum-gothic-v3';
  group.userData.warRoomPremiumFinishedObjects = upgraded;
  return upgraded;
}
