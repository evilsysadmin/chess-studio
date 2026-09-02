import * as THREE from 'three';
import './WarRoomCompositionPolish.css';

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function setPixel(data, width, height, x, y, rgb, alpha = 1) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || px >= width || py < 0 || py >= height) return;
  const index = (py * width + px) * 4;
  const mix = Math.max(0, Math.min(1, alpha));
  data[index] = clampByte(data[index] * (1 - mix) + rgb[0] * mix);
  data[index + 1] = clampByte(data[index + 1] * (1 - mix) + rgb[1] * mix);
  data[index + 2] = clampByte(data[index + 2] * (1 - mix) + rgb[2] * mix);
  data[index + 3] = 255;
}

function fillRect(data, width, height, left, top, right, bottom, rgb, alpha = 1) {
  for (let y = Math.max(0, Math.floor(top)); y < Math.min(height, Math.ceil(bottom)); y += 1) {
    for (let x = Math.max(0, Math.floor(left)); x < Math.min(width, Math.ceil(right)); x += 1) {
      setPixel(data, width, height, x, y, rgb, alpha);
    }
  }
}

function fillTriangle(data, width, height, a, b, c, rgb, alpha = 1) {
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  const area = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (!area) return;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const w1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / area;
      const w2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / area;
      const w3 = 1 - w1 - w2;
      if (w1 >= 0 && w2 >= 0 && w3 >= 0) setPixel(data, width, height, x, y, rgb, alpha);
    }
  }
}

function fillDisc(data, width, height, cx, cy, radius, rgb, alpha = 1) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 <= r2) setPixel(data, width, height, x, y, rgb, alpha * (1 - d2 / (r2 * 1.25)));
    }
  }
}

function noise(x, y, seed) {
  const value = Math.sin((x * 12.9898 + y * 78.233 + seed * 31.417) * 0.91) * 43758.5453;
  return value - Math.floor(value);
}

function createGalleryLandscapeTexture(index) {
  const width = 192;
  const height = 128;
  const data = new Uint8Array(width * height * 4);
  const alpine = index === 1;

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const n = noise(x, y, 41 + index * 17);
      const stroke = Math.sin(x * 0.31 + y * 0.08 + index * 2.1) * 2.8;
      let rgb;
      if (alpine) {
        const top = [24, 32, 48];
        const low = [104, 111, 119];
        const t = Math.min(1, v * 1.38);
        rgb = top.map((value, channel) => value + (low[channel] - value) * t + (n - 0.5) * 12 + stroke);
      } else {
        const top = [35, 45, 63];
        const horizon = [173, 118, 76];
        const t = Math.min(1, v * 1.48);
        rgb = top.map((value, channel) => value + (horizon[channel] - value) * t + (n - 0.5) * 11 + stroke);
      }
      const p = (y * width + x) * 4;
      data[p] = clampByte(rgb[0]);
      data[p + 1] = clampByte(rgb[1]);
      data[p + 2] = clampByte(rgb[2]);
      data[p + 3] = 255;
    }
  }

  if (!alpine) {
    // Rhein dusk: river, wooded banks and a hilltop castle catching the last sun.
    fillRect(data, width, height, 0, 78, width, height, [35, 52, 57], 0.88);
    for (let y = 80; y < height; y += 1) {
      const t = (y - 80) / 48;
      const center = 83 + t * 14;
      const half = 27 + t * 26;
      fillRect(data, width, height, center - half, y, center + half, y + 1, [79, 82, 75], 0.28);
      if (y % 4 === 0) fillRect(data, width, height, center - half * 0.7, y, center + half * 0.45, y + 1, [178, 117, 69], 0.12);
    }
    fillTriangle(data, width, height, [112, 43], [192, 66], [192, 121], [38, 47, 38], 0.92);
    fillTriangle(data, width, height, [0, 68], [76, 60], [48, 112], [42, 55, 45], 0.78);
    fillRect(data, width, height, 126, 48, 170, 72, [127, 116, 95], 0.96);
    fillRect(data, width, height, 132, 38, 143, 72, [143, 128, 102], 0.98);
    fillRect(data, width, height, 155, 35, 166, 72, [149, 132, 102], 0.98);
    fillTriangle(data, width, height, [131, 38], [143, 38], [137, 29], [72, 51, 44], 0.98);
    fillTriangle(data, width, height, [154, 35], [166, 35], [160, 25], [72, 51, 44], 0.98);
    fillRect(data, width, height, 143, 43, 155, 72, [97, 89, 76], 0.98);
    for (const [wx, wy] of [[136, 49], [159, 46], [148, 54], [136, 60], [159, 58]]) {
      fillRect(data, width, height, wx, wy, wx + 2, wy + 4, [225, 166, 83], 0.9);
    }
    fillRect(data, width, height, 29, 81, 97, 84, [49, 42, 35], 0.75);
    for (let x = 34; x < 95; x += 8) fillDisc(data, width, height, x, 79 + (x % 3), 2.3, [204, 145, 73], 0.45);
  } else {
    // Alpine moonstorm: snow ridges, cold moon and a fortress pinned to the pass.
    fillDisc(data, width, height, 151, 24, 11, [218, 221, 207], 0.82);
    fillDisc(data, width, height, 151, 24, 7, [232, 231, 211], 0.45);
    fillTriangle(data, width, height, [8, 97], [72, 34], [116, 101], [63, 75, 85], 0.96);
    fillTriangle(data, width, height, [56, 104], [118, 27], [181, 105], [73, 82, 92], 0.98);
    fillTriangle(data, width, height, [84, 67], [118, 27], [139, 68], [197, 204, 199], 0.9);
    fillTriangle(data, width, height, [38, 70], [72, 34], [87, 69], [188, 196, 192], 0.76);
    fillRect(data, width, height, 84, 66, 130, 87, [101, 103, 98], 0.98);
    fillRect(data, width, height, 90, 54, 101, 87, [119, 119, 111], 0.98);
    fillRect(data, width, height, 114, 50, 125, 87, [121, 120, 111], 0.98);
    fillTriangle(data, width, height, [89, 54], [102, 54], [95, 43], [48, 49, 53], 0.98);
    fillTriangle(data, width, height, [113, 50], [126, 50], [120, 39], [48, 49, 53], 0.98);
    for (const [wx, wy] of [[94, 62], [119, 59], [106, 70], [94, 75], [119, 73]]) {
      fillRect(data, width, height, wx, wy, wx + 2, wy + 4, [198, 146, 74], 0.76);
    }
    fillRect(data, width, height, 0, 96, width, height, [24, 35, 35], 0.94);
    for (let x = 6; x < width; x += 12) {
      const base = 111 + (x % 4) * 2;
      fillTriangle(data, width, height, [x - 5, base], [x, 82 + (x % 5) * 3], [x + 5, base], [21, 38, 35], 0.94);
    }
    for (let cloud = 0; cloud < 9; cloud += 1) {
      const cx = 12 + cloud * 21;
      fillDisc(data, width, height, cx, 19 + (cloud % 3) * 5, 14, [57, 64, 76], 0.2);
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = alpine ? 'war-room-gallery-alpine-moonstorm-v4' : 'war-room-gallery-rhein-dusk-v4';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.userData.warRoomGallerySubject = alpine
    ? 'alpine-fortress-moonstorm-v4'
    : 'rhein-castle-river-dusk-v4';
  texture.userData.resolution = [width, height];
  return texture;
}

function installGalleryLandscapes(group) {
  let changed = 0;
  for (const index of [0, 1]) {
    const frame = group.getObjectByName?.(`war-room-premium-painting-${index}`);
    const canvas = frame?.getObjectByName?.('war-room-premium-painting-canvas');
    if (!frame || !canvas?.material || frame.userData.warRoomGalleryLandscapeVersion === 'v4') continue;
    const previousMap = canvas.material.map;
    const nextMap = createGalleryLandscapeTexture(index);
    canvas.material.map = nextMap;
    canvas.material.color?.setHex?.(0xffffff);
    canvas.material.needsUpdate = true;
    if (previousMap && previousMap !== nextMap) previousMap.dispose?.();
    frame.userData.warRoomGalleryLandscapeVersion = 'v4';
    frame.userData.warRoomGallerySubject = nextMap.userData.warRoomGallerySubject;
    changed += 1;
  }
  return changed;
}

function createFirebrickTexture() {
  const width = 96;
  const height = 96;
  const data = new Uint8Array(width * height * 4);
  const course = 16;
  for (let y = 0; y < height; y += 1) {
    const row = Math.floor(y / course);
    const offset = row % 2 ? 12 : 0;
    for (let x = 0; x < width; x += 1) {
      const localY = y % course;
      const localX = (x + offset) % 24;
      const mortar = localY < 2 || localX < 2;
      const centerHeat = Math.max(0, 1 - Math.abs(x - width / 2) / (width * 0.55));
      const lowHeat = Math.max(0, 1 - y / height);
      const soot = Math.min(1, (y / height) * 0.55 + noise(x, y, 91) * 0.22);
      const grain = (noise(x * 2, y * 3, 17) - 0.5) * 22;
      const base = mortar ? [41, 34, 30] : [92, 62, 46];
      const warmth = centerHeat * lowHeat * (mortar ? 9 : 28);
      const p = (y * width + x) * 4;
      data[p] = clampByte(base[0] + warmth + grain - soot * 34);
      data[p + 1] = clampByte(base[1] + warmth * 0.42 + grain * 0.55 - soot * 29);
      data[p + 2] = clampByte(base[2] + warmth * 0.12 + grain * 0.35 - soot * 24);
      data[p + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'war-room-fireplace-refractory-brick-v4';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.15, 1.1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.userData.warRoomFireplaceTexture = 'sooted-refractory-brick-v4';
  texture.userData.resolution = [width, height];
  return texture;
}

function addFireplaceInterior(group, towardBoard) {
  const fireplace = group.getObjectByName?.('war-room-fireplace');
  if (!fireplace || fireplace.userData.warRoomInteriorFinish === 'refractory-v4') return 0;
  const brickMap = createFirebrickTexture();
  const brick = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: brickMap,
    metalness: 0,
    roughness: 0.94,
    clearcoat: 0.012,
    clearcoatRoughness: 0.94,
    specularIntensity: 0.1,
    emissive: new THREE.Color(0x2b0d05),
    emissiveIntensity: 0.08,
  });
  brick.userData.warRoomFireplaceFinish = 'sooted-refractory-brick-v4';

  const addBrick = (geometry, position, name) => {
    const mesh = new THREE.Mesh(geometry, brick);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    fireplace.add(mesh);
    return mesh;
  };

  addBrick(new THREE.BoxGeometry(1.68, 1.02, 0.032), [0, 0.64, towardBoard * 0.105], 'war-room-fireplace-refractory-back');
  addBrick(new THREE.BoxGeometry(1.72, 0.035, 0.66), [0, 0.135, towardBoard * 0.26], 'war-room-fireplace-refractory-hearth');
  addBrick(new THREE.BoxGeometry(0.075, 1.01, 0.44), [-0.83, 0.64, towardBoard * 0.25], 'war-room-fireplace-refractory-return-left');
  addBrick(new THREE.BoxGeometry(0.075, 1.01, 0.44), [0.83, 0.64, towardBoard * 0.25], 'war-room-fireplace-refractory-return-right');

  fireplace.userData.warRoomInteriorFinish = 'refractory-v4';
  fireplace.userData.warRoomInteriorMeshCount = 4;
  return 4;
}

function recomposeArmorAndMasonry(group, { wallZ, towardBoard }) {
  let moved = 0;
  for (const [name, side] of [
    ['war-room-teutonic-armor-left', -1],
    ['war-room-teutonic-armor-right', 1],
  ]) {
    const armor = group.getObjectByName?.(name);
    if (!armor) continue;
    armor.position.x = side * 7.18;
    armor.position.z = wallZ + towardBoard * 4.95;
    armor.rotation.y = side * towardBoard * 0.16;
    armor.userData.warRoomArmorPlacement = 'outer-wall-sentry-v10';
    moved += 1;
  }

  let retiredJoints = 0;
  group.traverse?.((object) => {
    if (object?.name !== 'war-room-teutonic-mortar-joint') return;
    object.visible = false;
    object.userData.warRoomJointRetired = 'flat-ashlar-texture-v10';
    retiredJoints += 1;
  });

  for (const [targetName, side] of [
    ['war-room-museum-side-target-left', -1],
    ['war-room-museum-side-target-right', 1],
  ]) {
    const target = group.getObjectByName?.(targetName);
    if (!target) continue;
    target.position.set(side * 6.05, 2.58, wallZ + towardBoard * 2.7);
  }

  group.userData.warRoomArmorComposition = 'outer-wall-sentries-v10';
  group.userData.warRoomRetiredMortarJoints = retiredJoints;
  return moved;
}

export function applyWarRoomCompositionPolish(group, {
  wallZ,
  towardBoard,
  coarsePointer = false,
} = {}) {
  if (!group || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard) || coarsePointer) return 0;
  if (group.userData.warRoomCompositionPolishVersion === 'v10') return 0;

  const armorCount = recomposeArmorAndMasonry(group, { wallZ, towardBoard });
  const paintingCount = installGalleryLandscapes(group);
  const fireplaceMeshCount = addFireplaceInterior(group, towardBoard);

  group.userData.warRoomCompositionPolishVersion = 'v10';
  group.userData.warRoomCompositionArmorCount = armorCount;
  group.userData.warRoomCompositionPaintingCount = paintingCount;
  group.userData.warRoomCompositionFireplaceMeshCount = fireplaceMeshCount;
  return armorCount + paintingCount + fireplaceMeshCount;
}
