import * as THREE from 'three';
import { installTeutonicWarRoomDecor } from './WarRoomTeutonicDecor.js';
import { applyWarRoomPremiumFinishPass } from './WarRoomPremiumFinishPass.js';
import { applyWarRoomPracticalLighting } from './WarRoomPracticalLighting.js';

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
    transparent: options.opacity != null && options.opacity < 1,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
    map: options.map ?? null,
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

function addBox(group, size, material, position, name = '') {
  return addMesh(group, new THREE.BoxGeometry(...size), material, position, [0, 0, 0], name);
}

function seededNoise(x, y, seed) {
  const value = Math.sin((x * 12.9898 + y * 78.233 + seed * 37.719) * 0.91) * 43758.5453;
  return value - Math.floor(value);
}

function mix(a, b, amount) {
  return a + (b - a) * Math.min(1, Math.max(0, amount));
}

function putPixel(data, width, height, x, y, rgb, alpha = 1) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const index = (Math.floor(y) * width + Math.floor(x)) * 4;
  for (let channel = 0; channel < 3; channel += 1) {
    data[index + channel] = Math.round(mix(data[index + channel], rgb[channel], alpha));
  }
  data[index + 3] = 255;
}

function paintRect(data, width, height, left, top, right, bottom, rgb, seed, variation = 8) {
  for (let y = Math.max(0, top); y < Math.min(height, bottom); y += 1) {
    for (let x = Math.max(0, left); x < Math.min(width, right); x += 1) {
      const grain = (seededNoise(x, y, seed) - 0.5) * variation;
      putPixel(data, width, height, x, y, rgb.map((value) => value + grain), 0.92);
    }
  }
}

function createPainterlyTexture(seed, warm = false) {
  const width = 160;
  const height = 112;
  const data = new Uint8Array(width * height * 4);
  const skyTop = warm ? [43, 45, 47] : [36, 48, 57];
  const skyLow = warm ? [142, 106, 75] : [103, 116, 118];
  const farEarth = warm ? [72, 58, 44] : [48, 61, 54];
  const nearEarth = warm ? [39, 31, 26] : [29, 39, 35];
  const horizon = warm ? 0.52 : 0.55;

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const noise = seededNoise(x, y, seed);
      const stroke = seededNoise(Math.floor(x / 6), Math.floor(y / 3), seed + 11);
      const ridge = horizon + Math.sin(u * Math.PI * (2.1 + (seed % 5) * 0.08)) * 0.038;
      const below = v > ridge;
      const amount = below
        ? Math.min(1, (v - ridge) * 1.85 + stroke * 0.18)
        : Math.min(1, v / Math.max(0.01, ridge) + stroke * 0.08);
      const a = below ? farEarth : skyTop;
      const b = below ? nearEarth : skyLow;
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const brushed = Math.sin(x * 0.37 + y * 0.11 + seed) * 2.2;
        data[index + channel] = Math.max(0, Math.min(255,
          mix(a[channel], b[channel], amount) + (noise - 0.5) * 14 + brushed,
        ));
      }
      data[index + 3] = 255;
    }
  }

  const mountainLayers = warm
    ? [[0.42, [82, 70, 60]], [0.47, [61, 55, 49]], [0.51, [45, 42, 37]]]
    : [[0.44, [76, 86, 88]], [0.49, [56, 68, 67]], [0.53, [39, 52, 49]]];
  mountainLayers.forEach(([baseV, tone], layerIndex) => {
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const peak = Math.sin(u * Math.PI * (2.5 + layerIndex * 0.7) + seed * 0.21) * (8 - layerIndex)
        + Math.sin(u * Math.PI * 7.1 + layerIndex) * 3;
      const top = Math.round(height * baseV - peak);
      const bottom = Math.round(height * (0.58 + layerIndex * 0.025));
      for (let y = top; y < bottom; y += 1) putPixel(data, width, height, x, y, tone, 0.55 + layerIndex * 0.12);
    }
  });

  const castleX = warm ? 98 : 45;
  const castleY = 50;
  const stone = warm ? [139, 126, 103] : [126, 128, 120];
  const stoneDark = warm ? [91, 80, 66] : [78, 82, 78];
  paintRect(data, width, height, castleX, castleY + 9, castleX + 32, castleY + 29, stone, seed + 31, 13);
  paintRect(data, width, height, castleX + 4, castleY + 2, castleX + 12, castleY + 29, stone, seed + 33, 12);
  paintRect(data, width, height, castleX + 23, castleY - 1, castleX + 31, castleY + 29, stone, seed + 37, 12);
  paintRect(data, width, height, castleX + 13, castleY + 6, castleX + 23, castleY + 29, stoneDark, seed + 39, 8);
  for (const towerLeft of [castleX + 4, castleX + 23]) {
    for (let merlon = 0; merlon < 3; merlon += 1) {
      paintRect(data, width, height, towerLeft + merlon * 3, castleY - (towerLeft === castleX + 23 ? 4 : 1), towerLeft + merlon * 3 + 2, castleY + 3, stone, seed + merlon, 5);
    }
  }
  const windowTone = warm ? [39, 31, 25] : [29, 37, 38];
  [[8, 10], [26, 8], [17, 14], [8, 19], [26, 18]].forEach(([dx, dy]) => {
    paintRect(data, width, height, castleX + dx, castleY + dy, castleX + dx + 2, castleY + dy + 4, windowTone, seed, 2);
  });

  const roadStart = castleX + 16;
  for (let y = castleY + 28; y < height; y += 1) {
    const t = (y - castleY - 28) / Math.max(1, height - castleY - 28);
    const half = 1 + t * 12;
    const center = roadStart + (warm ? t * 8 : -t * 5);
    for (let x = Math.floor(center - half); x <= Math.ceil(center + half); x += 1) {
      putPixel(data, width, height, x, y, warm ? [112, 89, 62] : [86, 86, 70], 0.42);
    }
  }

  for (let cloud = 0; cloud < 7; cloud += 1) {
    const cx = Math.floor(seededNoise(cloud, seed, 77) * width);
    const cy = 12 + Math.floor(seededNoise(seed, cloud, 91) * 28);
    const radius = 5 + Math.floor(seededNoise(cloud, seed, 101) * 8);
    for (let y = cy - 3; y <= cy + 3; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        const falloff = 1 - Math.abs(x - cx) / Math.max(1, radius);
        if (falloff > 0) putPixel(data, width, height, x, y, warm ? [178, 151, 118] : [151, 161, 160], falloff * 0.09);
      }
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.name = warm ? 'war-room-painting-texture-warm' : 'war-room-painting-texture-cool';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.userData.warRoomPainterly = true;
  texture.userData.resolution = [width, height];
  texture.userData.warRoomPaintingDetail = 'layered-landscape-v2';
  return texture;
}

function addPainting(group, x, y, z, towardBoard, warm, index) {
  const frameDark = physical(0x2d1a11, { metalness: 0.03, roughness: 0.48, clearcoat: 0.34, clearcoatRoughness: 0.32, specularIntensity: 0.36 });
  const frameWarm = physical(0x5b3821, { metalness: 0.04, roughness: 0.42, clearcoat: 0.42, clearcoatRoughness: 0.25, specularIntensity: 0.42 });
  const gilding = physical(0xb78a43, { metalness: 0.78, roughness: 0.25, clearcoat: 0.44, clearcoatRoughness: 0.2, specularIntensity: 0.66 });
  const agedGold = physical(0x725126, { metalness: 0.62, roughness: 0.37, clearcoat: 0.25, specularIntensity: 0.46 });
  const linen = physical(0xffffff, {
    roughness: 0.81,
    clearcoat: 0.018,
    clearcoatRoughness: 0.9,
    specularIntensity: 0.12,
    map: createPainterlyTexture(17 + index * 13, warm),
  });

  const frame = new THREE.Group();
  frame.name = `war-room-premium-painting-${index}`;
  frame.userData.warRoomPaintingFinish = 'painterly-canvas-v2';
  frame.position.set(x, y, z);

  addBox(frame, [2.48, 1.86, 0.08], frameDark, [0, 0, 0], 'war-room-premium-frame-back');
  addBox(frame, [2.34, 1.72, 0.042], frameWarm, [0, 0, towardBoard * 0.05], 'war-room-premium-frame-wood-bed');
  addBox(frame, [2.18, 1.56, 0.034], gilding, [0, 0, towardBoard * 0.079], 'war-room-premium-frame-gilt-bed');
  addBox(frame, [1.94, 1.32, 0.028], linen, [0, 0, towardBoard * 0.104], 'war-room-premium-painting-canvas');

  const outerBars = [
    [0, 0.86, 2.42, 0.085], [0, -0.86, 2.42, 0.085],
    [-1.19, 0, 0.085, 1.76], [1.19, 0, 0.085, 1.76],
  ];
  for (const [dx, dy, sx, sy] of outerBars) addBox(frame, [sx, sy, 0.052], gilding, [dx, dy, towardBoard * 0.104]);

  const innerBars = [
    [0, 0.7, 2.06, 0.035], [0, -0.7, 2.06, 0.035],
    [-1.01, 0, 0.035, 1.42], [1.01, 0, 0.035, 1.42],
  ];
  for (const [dx, dy, sx, sy] of innerBars) {
    const trim = addBox(frame, [sx, sy, 0.032], agedGold, [dx, dy, towardBoard * 0.122]);
    trim.castShadow = false;
  }

  for (const [cx, cy] of [[-1.13, 0.8], [1.13, 0.8], [-1.13, -0.8], [1.13, -0.8]]) {
    const rosette = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 12), agedGold);
    rosette.position.set(cx, cy, towardBoard * 0.132);
    rosette.rotation.x = Math.PI / 2;
    rosette.castShadow = false;
    frame.add(rosette);
  }

  group.add(frame);
  return frame;
}

function sceneRoot(object) {
  let current = object;
  while (current?.parent) current = current.parent;
  return current;
}

function attachLegacyArmorRetirementDriver(group) {
  const driver = group?.getObjectByName?.('war-room-premium-painting-canvas');
  if (!driver || driver.userData.warRoomLegacyArmorRetirementDriver) return;
  driver.userData.warRoomLegacyArmorRetirementDriver = true;
  const previous = driver.onBeforeRender;
  driver.onBeforeRender = (...args) => {
    previous?.(...args);
    const root = sceneRoot(driver);
    for (const name of ['war-room-armor-guard-left', 'war-room-armor-guard-right']) {
      const legacy = root?.getObjectByName?.(name);
      if (!legacy || legacy.userData.replacedByGothicArmor) continue;
      legacy.visible = false;
      legacy.userData.replacedByGothicArmor = true;
      legacy.userData.replacement = name.endsWith('left') ? 'war-room-teutonic-armor-left' : 'war-room-teutonic-armor-right';
    }
    if (root?.userData) root.userData.warRoomLegacyArmorRetired = true;
  };
}

export function addPremiumWarRoomPaintings(group, { wallZ, towardBoard, coarsePointer = false } = {}) {
  if (!group || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return 0;

  installTeutonicWarRoomDecor(group, { wallZ, towardBoard, coarsePointer });
  if (coarsePointer) return 0;

  const paintingZ = wallZ + towardBoard * 0.72;
  addPainting(group, -4.95, 3.65, paintingZ, towardBoard, false, 0);
  addPainting(group, 4.95, 3.66, paintingZ, towardBoard, true, 1);
  applyWarRoomPremiumFinishPass(group, { towardBoard });
  applyWarRoomPracticalLighting(group, { wallZ, towardBoard, coarsePointer });
  attachLegacyArmorRetirementDriver(group);
  group.userData.warRoomPremiumPaintings = 2;
  group.userData.warRoomPremiumPaintingVersion = 'v2';
  return 2;
}
