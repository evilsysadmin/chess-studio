import * as THREE from 'three';

export const WAR_ROOM_NIGHT_WINDOW_VERSION = 'rhenish-night-v1';

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hashNoise(x, y, seed) {
  const value = Math.sin((x * 12.9898 + y * 78.233 + seed * 41.137) * 0.913) * 43758.5453;
  return value - Math.floor(value);
}

function createSkyTexture() {
  const width = 128;
  const height = 64;
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const t = y / (height - 1);
    const top = [7, 12, 22];
    const low = [28, 41, 54];
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const grain = (hashNoise(x, y, 17) - 0.5) * 5;
      const horizonGlow = Math.exp(-Math.pow((t - 0.72) / 0.24, 2)) * 5;
      data[index] = clampByte(top[0] + (low[0] - top[0]) * t + grain + horizonGlow);
      data[index + 1] = clampByte(top[1] + (low[1] - top[1]) * t + grain + horizonGlow * 1.15);
      data[index + 2] = clampByte(top[2] + (low[2] - top[2]) * t + grain + horizonGlow * 1.35);
      data[index + 3] = 255;
    }
  }

  for (let y = 5; y < 42; y += 1) {
    for (let x = 4; x < width - 4; x += 1) {
      const star = hashNoise(x, y, 59);
      if (star < 0.9955) continue;
      const index = (y * width + x) * 4;
      const brightness = star > 0.9988 ? 215 : 165;
      data[index] = brightness;
      data[index + 1] = brightness + 6;
      data[index + 2] = Math.min(255, brightness + 18);
    }
  }

  for (let x = 0; x < width; x += 1) {
    const ridge = 44
      + Math.sin(x * 0.105) * 3.8
      + Math.sin(x * 0.037 + 1.4) * 5.5
      + Math.sin(x * 0.23 + 0.8) * 1.7;
    for (let y = Math.max(0, Math.floor(ridge)); y < height; y += 1) {
      const index = (y * width + x) * 4;
      const depth = (y - ridge) / Math.max(1, height - ridge);
      const base = 15 + depth * 7;
      data[index] = clampByte(base * 0.82);
      data[index + 1] = clampByte(base * 0.94);
      data[index + 2] = clampByte(base * 1.03);
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'war-room-rhenish-night-sky';
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.userData.warRoomNightWindow = 'sky';
  texture.userData.resolution = [width, height];
  return texture;
}

function createMistTexture() {
  const width = 128;
  const height = 32;
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    const vertical = Math.exp(-Math.pow((v - 0.56) / 0.28, 2));
    for (let x = 0; x < width; x += 1) {
      const broad = (Math.sin(x * 0.11) + Math.sin(x * 0.037 + 1.8)) * 0.25 + 0.5;
      const noise = hashNoise(x, y, 83);
      const alpha = clampByte((12 + broad * 32 + noise * 10) * vertical);
      const index = (y * width + x) * 4;
      data[index] = 118;
      data[index + 1] = 136;
      data[index + 2] = 148;
      data[index + 3] = alpha;
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'war-room-rhenish-night-mist';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.userData.warRoomNightWindow = 'mist';
  texture.userData.resolution = [width, height];
  return texture;
}

function addPanel(group, { name, texture, x, y, z, towardBoard, transparent = false, opacity = 1 }) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent,
    opacity,
    depthWrite: !transparent,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.24, 3.02), material);
  panel.name = name;
  panel.position.set(x, y, z);
  panel.rotation.y = towardBoard < 0 ? Math.PI : 0;
  panel.castShadow = false;
  panel.receiveShadow = false;
  panel.userData.warRoomNightWindowDepth = WAR_ROOM_NIGHT_WINDOW_VERSION;
  group.add(panel);
  return panel;
}

export function installWarRoomNightWindowDepth(group, {
  wallZ,
  towardBoard,
  coarsePointer = false,
} = {}) {
  if (!group || coarsePointer || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return 0;
  if (group.userData.warRoomNightWindowDepth === WAR_ROOM_NIGHT_WINDOW_VERSION) return 0;

  const windowX = towardBoard * 4.2;
  const skyTexture = createSkyTexture();
  const mistTexture = createMistTexture();

  addPanel(group, {
    name: 'war-room-night-sky-panel',
    texture: skyTexture,
    x: windowX,
    y: 3.3,
    z: wallZ + towardBoard * 0.29,
    towardBoard,
  });
  const mist = addPanel(group, {
    name: 'war-room-night-mist-panel',
    texture: mistTexture,
    x: windowX,
    y: 3.18,
    z: wallZ + towardBoard * 0.315,
    towardBoard,
    transparent: true,
    opacity: 0.52,
  });
  mist.renderOrder = 2;

  group.userData.warRoomNightWindowDepth = WAR_ROOM_NIGHT_WINDOW_VERSION;
  group.userData.warRoomNightWindowMeshCount = 2;
  group.userData.warRoomNightWindowTextureCount = 2;
  return 2;
}
