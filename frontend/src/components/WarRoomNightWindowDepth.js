import * as THREE from 'three';

export const WAR_ROOM_NIGHT_WINDOW_VERSION = 'weather-window-right-v2';
export const WAR_ROOM_WEATHER_STATES = Object.freeze(['rain', 'cloudy', 'snow', 'sunny']);

const DEFAULT_WEATHER = 'rain';
const WINDOW_X = 5.12;
const FIREPLACE_X = 2.55;
const WINDOW_CENTER_Y = 3.33;
const WINDOW_WIDTH = 2.38;
const WINDOW_HEIGHT = 3.42;

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hashNoise(x, y, seed) {
  const value = Math.sin((x * 12.9898 + y * 78.233 + seed * 41.137) * 0.913) * 43758.5453;
  return value - Math.floor(value);
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

function fillDisc(data, width, height, cx, cy, radius, rgb, alpha = 1) {
  const radiusSquared = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const distanceSquared = (x - cx) ** 2 + (y - cy) ** 2;
      if (distanceSquared > radiusSquared) continue;
      setPixel(data, width, height, x, y, rgb, alpha * (1 - distanceSquared / (radiusSquared * 1.3)));
    }
  }
}

function setOverlayPixel(data, width, height, x, y, rgb, alpha) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || px >= width || py < 0 || py >= height) return;
  const index = (py * width + px) * 4;
  data[index] = rgb[0];
  data[index + 1] = rgb[1];
  data[index + 2] = rgb[2];
  data[index + 3] = Math.max(data[index + 3], clampByte(alpha));
}

function fillOverlayDisc(data, width, height, cx, cy, radius, rgb, alpha) {
  const radiusSquared = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const distanceSquared = (x - cx) ** 2 + (y - cy) ** 2;
      if (distanceSquared > radiusSquared) continue;
      setOverlayPixel(data, width, height, x, y, rgb, alpha * (1 - distanceSquared / (radiusSquared * 1.25)));
    }
  }
}

export function normalizeWarRoomWeather(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return WAR_ROOM_WEATHER_STATES.includes(normalized) ? normalized : DEFAULT_WEATHER;
}

function weatherPalette(weather) {
  switch (weather) {
    case 'sunny':
      return { top: [52, 91, 132], low: [196, 154, 101], ridge: [35, 48, 47] };
    case 'cloudy':
      return { top: [43, 53, 64], low: [101, 108, 115], ridge: [27, 37, 39] };
    case 'snow':
      return { top: [72, 91, 109], low: [166, 179, 187], ridge: [43, 55, 57] };
    case 'rain':
    default:
      return { top: [23, 33, 46], low: [70, 84, 95], ridge: [19, 30, 34] };
  }
}

function createWeatherSkyTexture(weather) {
  const width = 160;
  const height = 128;
  const data = new Uint8Array(width * height * 4);
  const palette = weatherPalette(weather);

  for (let y = 0; y < height; y += 1) {
    const t = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const grain = (hashNoise(x, y, 17) - 0.5) * (weather === 'sunny' ? 6 : 10);
      const cloudBand = weather === 'sunny'
        ? 0
        : (Math.sin(x * 0.055 + y * 0.02) + Math.sin(x * 0.021 - y * 0.038 + 1.7)) * 4;
      const index = (y * width + x) * 4;
      data[index] = clampByte(palette.top[0] + (palette.low[0] - palette.top[0]) * t + grain + cloudBand);
      data[index + 1] = clampByte(palette.top[1] + (palette.low[1] - palette.top[1]) * t + grain + cloudBand);
      data[index + 2] = clampByte(palette.top[2] + (palette.low[2] - palette.top[2]) * t + grain + cloudBand * 1.1);
      data[index + 3] = 255;
    }
  }

  if (weather === 'sunny') {
    fillDisc(data, width, height, 123, 28, 11, [244, 208, 133], 0.94);
    fillDisc(data, width, height, 123, 28, 17, [225, 180, 108], 0.16);
  } else {
    const cloudColor = weather === 'snow' ? [164, 177, 187] : [81, 93, 104];
    for (let cloud = 0; cloud < 10; cloud += 1) {
      const cx = 2 + cloud * 18;
      const cy = 20 + (cloud % 3) * 9;
      fillDisc(data, width, height, cx, cy, 19 + (cloud % 2) * 5, cloudColor, weather === 'cloudy' ? 0.28 : 0.22);
    }
  }

  // Distant Rhine/Alpine silhouette. Keep it quiet so the board remains the hero.
  for (let x = 0; x < width; x += 1) {
    const ridge = 86
      + Math.sin(x * 0.091) * 5
      + Math.sin(x * 0.034 + 1.7) * 9
      + Math.sin(x * 0.19 + 0.4) * 2.5;
    for (let y = Math.max(0, Math.floor(ridge)); y < height; y += 1) {
      const depth = (y - ridge) / Math.max(1, height - ridge);
      const index = (y * width + x) * 4;
      const snowLift = weather === 'snow' && y < ridge + 5 ? 72 : 0;
      data[index] = clampByte(palette.ridge[0] + depth * 10 + snowLift);
      data[index + 1] = clampByte(palette.ridge[1] + depth * 10 + snowLift);
      data[index + 2] = clampByte(palette.ridge[2] + depth * 9 + snowLift);
      data[index + 3] = 255;
    }
  }

  // A tiny fortress silhouette gives the exterior depth without becoming a second focal point.
  const fortress = weather === 'snow' ? [72, 77, 78] : [31, 35, 36];
  for (let y = 72; y < 91; y += 1) {
    for (let x = 103; x < 126; x += 1) setPixel(data, width, height, x, y, fortress, 0.92);
  }
  for (const towerX of [105, 120]) {
    for (let y = 63; y < 90; y += 1) {
      for (let x = towerX; x < towerX + 5; x += 1) setPixel(data, width, height, x, y, fortress, 0.96);
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `war-room-weather-sky-${weather}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.userData.warRoomWeatherWindow = weather;
  texture.userData.resolution = [width, height];
  return texture;
}

function createWeatherOverlayTexture(weather) {
  const width = 160;
  const height = 128;
  const data = new Uint8Array(width * height * 4);
  const pale = weather === 'snow' ? [229, 238, 241] : [166, 197, 216];

  if (weather === 'rain') {
    for (let streak = 0; streak < 68; streak += 1) {
      const x = Math.floor(hashNoise(streak, 7, 41) * width);
      const y = Math.floor(hashNoise(streak, 11, 67) * height);
      const length = 8 + Math.floor(hashNoise(streak, 19, 13) * 17);
      const alpha = 60 + hashNoise(streak, 23, 31) * 90;
      for (let step = 0; step < length; step += 1) {
        setOverlayPixel(data, width, height, x - step * 0.22, y + step, pale, alpha * (1 - step / (length * 1.35)));
      }
    }
  } else if (weather === 'snow') {
    for (let flake = 0; flake < 58; flake += 1) {
      const x = hashNoise(flake, 13, 29) * width;
      const y = hashNoise(flake, 17, 71) * height;
      const radius = 0.9 + hashNoise(flake, 31, 47) * 1.8;
      fillOverlayDisc(data, width, height, x, y, radius, pale, 90 + radius * 42);
    }
  } else if (weather === 'cloudy') {
    for (let band = 0; band < 8; band += 1) {
      const cx = 6 + band * 24;
      fillOverlayDisc(data, width, height, cx, 53 + (band % 2) * 10, 23, [151, 165, 175], 28);
    }
  } else {
    // Barely visible glazing haze on clear days.
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (hashNoise(x, y, 97) > 0.997) setOverlayPixel(data, width, height, x, y, [224, 231, 230], 14);
      }
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `war-room-weather-overlay-${weather}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.userData.warRoomWeatherWindow = weather;
  texture.userData.warRoomWeatherLayer = 'precipitation';
  texture.userData.resolution = [width, height];
  return texture;
}

function createArchShape(width, height) {
  const radius = width / 2;
  const halfHeight = height / 2;
  const shoulderY = halfHeight - radius;
  const shape = new THREE.Shape();
  shape.moveTo(-radius, -halfHeight);
  shape.lineTo(radius, -halfHeight);
  shape.lineTo(radius, shoulderY);
  shape.absarc(0, shoulderY, radius, 0, Math.PI, false);
  shape.lineTo(-radius, -halfHeight);
  shape.closePath();
  return shape;
}

function physical(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0,
    roughness: options.roughness ?? 0.66,
    clearcoat: options.clearcoat ?? 0.1,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.42,
    specularIntensity: options.specularIntensity ?? 0.3,
    transparent: options.opacity != null && options.opacity < 1,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
  });
}

function addBox(group, size, material, position, name) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function makeArchMesh(group, geometry, material, z, towardBoard, name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(0, WINDOW_CENTER_Y, z);
  mesh.rotation.y = towardBoard < 0 ? Math.PI : 0;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}

function attachWeatherMotion(mesh, weather) {
  const texture = mesh?.material?.map;
  if (!texture || weather === 'sunny') return;
  mesh.userData.warRoomWeatherAnimated = weather;
  mesh.onBeforeRender = () => {
    const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    if (weather === 'rain') {
      texture.offset.y = -((now * 0.000045) % 1);
      texture.offset.x = (now * 0.000006) % 1;
    } else if (weather === 'snow') {
      texture.offset.y = -((now * 0.000012) % 1);
      texture.offset.x = Math.sin(now * 0.00018) * 0.035;
    } else {
      texture.offset.x = (now * 0.000004) % 1;
    }
  };
}

function installWeatherWindow(group, { wallZ, towardBoard, weather }) {
  const side = Math.sign(towardBoard) || 1;
  const window = new THREE.Group();
  window.name = 'war-room-weather-window';
  window.position.x = side * WINDOW_X;
  window.userData.warRoomWeatherWindow = WAR_ROOM_NIGHT_WINDOW_VERSION;
  window.userData.weather = weather;
  window.userData.side = side > 0 ? 'right' : 'left';

  const frontZ = wallZ + towardBoard * 1.36;
  const recess = physical(0x17110e, { roughness: 0.82, clearcoat: 0.035, specularIntensity: 0.16 });
  const timber = physical(0x2a1a12, { roughness: 0.5, clearcoat: 0.28, clearcoatRoughness: 0.31, specularIntensity: 0.42 });
  const trim = physical(0x74512b, { metalness: 0.32, roughness: 0.38, clearcoat: 0.26, specularIntensity: 0.48 });

  const back = addBox(window, [2.9, 3.9, 0.075], recess, [0, WINDOW_CENTER_Y, frontZ], 'war-room-weather-window-recess');
  back.castShadow = false;

  const archGeometry = new THREE.ShapeGeometry(createArchShape(WINDOW_WIDTH, WINDOW_HEIGHT), 28);
  const skyMaterial = new THREE.MeshBasicMaterial({
    map: createWeatherSkyTexture(weather),
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const sky = makeArchMesh(window, archGeometry, skyMaterial, frontZ + towardBoard * 0.052, towardBoard, 'war-room-weather-window-sky');
  sky.userData.weather = weather;

  const overlayMaterial = new THREE.MeshBasicMaterial({
    map: createWeatherOverlayTexture(weather),
    transparent: true,
    opacity: weather === 'rain' ? 0.78 : weather === 'snow' ? 0.8 : 0.62,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const precipitation = makeArchMesh(window, archGeometry.clone(), overlayMaterial, frontZ + towardBoard * 0.066, towardBoard, 'war-room-weather-window-precipitation');
  precipitation.renderOrder = 3;
  precipitation.userData.weather = weather;
  attachWeatherMotion(precipitation, weather);

  const glassMaterial = physical(0xc8d8df, {
    roughness: weather === 'rain' ? 0.4 : 0.56,
    clearcoat: 0.72,
    clearcoatRoughness: 0.2,
    specularIntensity: 0.72,
    opacity: 0.1,
    depthWrite: false,
  });
  const glass = makeArchMesh(window, archGeometry.clone(), glassMaterial, frontZ + towardBoard * 0.078, towardBoard, 'war-room-weather-window-glass');
  glass.renderOrder = 4;

  const radius = WINDOW_WIDTH / 2;
  const halfHeight = WINDOW_HEIGHT / 2;
  const shoulderY = WINDOW_CENTER_Y + halfHeight - radius;
  const bottomY = WINDOW_CENTER_Y - halfHeight;
  const straightHeight = shoulderY - bottomY;
  const frameZ = frontZ + towardBoard * 0.095;
  const frameDepth = 0.12;

  addBox(window, [0.13, straightHeight + 0.15, frameDepth], timber, [-radius - 0.055, bottomY + straightHeight / 2, frameZ], 'war-room-weather-window-jamb-left');
  addBox(window, [0.13, straightHeight + 0.15, frameDepth], timber, [radius + 0.055, bottomY + straightHeight / 2, frameZ], 'war-room-weather-window-jamb-right');
  addBox(window, [WINDOW_WIDTH + 0.34, 0.16, 0.22], trim, [0, bottomY - 0.09, frameZ], 'war-room-weather-window-sill');

  const archTrim = new THREE.Mesh(
    new THREE.TorusGeometry(radius + 0.055, 0.065, 8, 40, Math.PI),
    timber,
  );
  archTrim.name = 'war-room-weather-window-arch-trim';
  archTrim.position.set(0, shoulderY, frameZ);
  archTrim.castShadow = true;
  archTrim.receiveShadow = true;
  window.add(archTrim);

  addBox(window, [0.075, WINDOW_HEIGHT - 0.28, 0.09], trim, [0, WINDOW_CENTER_Y - 0.03, frameZ + towardBoard * 0.025], 'war-room-weather-window-mullion');
  addBox(window, [WINDOW_WIDTH - 0.18, 0.07, 0.09], trim, [0, shoulderY - 0.15, frameZ + towardBoard * 0.025], 'war-room-weather-window-transom');

  group.add(window);
  return window;
}

export function installWarRoomNightWindowDepth(group, {
  wallZ,
  towardBoard,
  coarsePointer = false,
  weather = null,
} = {}) {
  if (!group || coarsePointer || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return 0;
  if (group.userData.warRoomNightWindowDepth === WAR_ROOM_NIGHT_WINDOW_VERSION) return 0;

  const condition = normalizeWarRoomWeather(weather || group.userData.warRoomWeather);
  const side = Math.sign(towardBoard) || 1;
  const fireplace = group.getObjectByName?.('war-room-fireplace');
  if (fireplace) {
    fireplace.position.x = side * FIREPLACE_X;
    fireplace.userData.warRoomWeatherWindowLayout = WAR_ROOM_NIGHT_WINDOW_VERSION;
  }

  const window = installWeatherWindow(group, { wallZ, towardBoard, weather: condition });
  group.userData.warRoomNightWindowDepth = WAR_ROOM_NIGHT_WINDOW_VERSION;
  group.userData.warRoomWeather = condition;
  group.userData.warRoomWeatherWindowSide = side > 0 ? 'right' : 'left';
  group.userData.warRoomWeatherWindowMeshCount = window.children.filter((child) => child.isMesh).length;
  group.userData.warRoomNightWindowMeshCount = group.userData.warRoomWeatherWindowMeshCount;
  group.userData.warRoomNightWindowTextureCount = 2;
  return group.userData.warRoomWeatherWindowMeshCount;
}
