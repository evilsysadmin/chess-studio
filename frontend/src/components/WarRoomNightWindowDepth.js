import * as THREE from 'three';

export const WAR_ROOM_NIGHT_WINDOW_VERSION = 'weather-window-gothic-v3';
export const WAR_ROOM_WEATHER_STATES = Object.freeze(['rain', 'cloudy', 'snow', 'sunny']);

const DEFAULT_WEATHER = 'rain';
const WINDOW_X = 5.18;
const FIREPLACE_X = 2.48;
const WINDOW_CENTER_Y = 3.48;
const WINDOW_WIDTH = 2.22;
const WINDOW_HEIGHT = 4.02;

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

function fillDisc(data, width, height, cx, cy, radius, rgb, alpha = 1, overlay = false) {
  const radiusSquared = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const distanceSquared = (x - cx) ** 2 + (y - cy) ** 2;
      if (distanceSquared > radiusSquared) continue;
      const localAlpha = alpha * (1 - distanceSquared / (radiusSquared * 1.25));
      if (overlay) setOverlayPixel(data, width, height, x, y, rgb, localAlpha);
      else setPixel(data, width, height, x, y, rgb, localAlpha);
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
      return { top: [55, 95, 139], low: [201, 157, 101], ridge: [39, 49, 43], cloud: [213, 210, 192] };
    case 'cloudy':
      return { top: [43, 52, 62], low: [105, 112, 119], ridge: [29, 37, 39], cloud: [131, 141, 150] };
    case 'snow':
      return { top: [74, 92, 108], low: [169, 181, 188], ridge: [46, 57, 58], cloud: [175, 187, 194] };
    case 'rain':
    default:
      return { top: [18, 29, 42], low: [66, 81, 94], ridge: [18, 28, 31], cloud: [86, 99, 111] };
  }
}

function createWeatherSkyTexture(weather, compact = false) {
  const width = compact ? 112 : 176;
  const height = compact ? 128 : 160;
  const data = new Uint8Array(width * height * 4);
  const palette = weatherPalette(weather);

  for (let y = 0; y < height; y += 1) {
    const t = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const grain = (hashNoise(x, y, 17) - 0.5) * (weather === 'sunny' ? 5 : 9);
      const cloudBand = weather === 'sunny'
        ? 0
        : (Math.sin(x * 0.052 + y * 0.018) + Math.sin(x * 0.023 - y * 0.035 + 1.7)) * 4.5;
      const index = (y * width + x) * 4;
      data[index] = clampByte(palette.top[0] + (palette.low[0] - palette.top[0]) * t + grain + cloudBand);
      data[index + 1] = clampByte(palette.top[1] + (palette.low[1] - palette.top[1]) * t + grain + cloudBand);
      data[index + 2] = clampByte(palette.top[2] + (palette.low[2] - palette.top[2]) * t + grain + cloudBand * 1.15);
      data[index + 3] = 255;
    }
  }

  if (weather === 'sunny') {
    fillDisc(data, width, height, width * 0.73, height * 0.2, compact ? 7 : 11, [247, 211, 139], 0.96);
    fillDisc(data, width, height, width * 0.73, height * 0.2, compact ? 12 : 18, [230, 182, 110], 0.16);
  } else {
    const cloudCount = compact ? 7 : 11;
    for (let cloud = 0; cloud < cloudCount; cloud += 1) {
      const cx = 2 + cloud * (width / Math.max(1, cloudCount - 1));
      const cy = height * (0.13 + (cloud % 3) * 0.055);
      fillDisc(
        data,
        width,
        height,
        cx,
        cy,
        compact ? 16 : 24,
        palette.cloud,
        weather === 'cloudy' ? 0.32 : 0.24,
      );
    }
  }

  // Deep valley silhouette with a small fortress. It is deliberately subdued:
  // the view sells depth/weather without becoming a second focal point.
  for (let x = 0; x < width; x += 1) {
    const ridge = height * 0.67
      + Math.sin(x * 0.091) * (compact ? 4 : 6)
      + Math.sin(x * 0.034 + 1.7) * (compact ? 7 : 10)
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

  const fortressX = Math.floor(width * 0.63);
  const fortressY = Math.floor(height * 0.55);
  const fortress = weather === 'snow' ? [72, 77, 78] : [29, 34, 35];
  for (let y = fortressY; y < fortressY + Math.floor(height * 0.12); y += 1) {
    for (let x = fortressX; x < fortressX + Math.floor(width * 0.15); x += 1) {
      setPixel(data, width, height, x, y, fortress, 0.94);
    }
  }
  for (const towerOffset of [2, Math.floor(width * 0.11)]) {
    for (let y = fortressY - Math.floor(height * 0.08); y < fortressY + Math.floor(height * 0.12); y += 1) {
      for (let x = fortressX + towerOffset; x < fortressX + towerOffset + Math.max(3, Math.floor(width * 0.028)); x += 1) {
        setPixel(data, width, height, x, y, fortress, 0.98);
      }
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

function createWeatherOverlayTexture(weather, compact = false) {
  const width = compact ? 112 : 176;
  const height = compact ? 128 : 160;
  const data = new Uint8Array(width * height * 4);
  const pale = weather === 'snow' ? [232, 240, 243] : [170, 204, 224];

  if (weather === 'rain') {
    const streakCount = compact ? 68 : 118;
    for (let streak = 0; streak < streakCount; streak += 1) {
      const x = Math.floor(hashNoise(streak, 7, 41) * width);
      const y = Math.floor(hashNoise(streak, 11, 67) * height);
      const length = (compact ? 10 : 13) + Math.floor(hashNoise(streak, 19, 13) * (compact ? 18 : 25));
      const alpha = 82 + hashNoise(streak, 23, 31) * 105;
      for (let step = 0; step < length; step += 1) {
        setOverlayPixel(
          data,
          width,
          height,
          x - step * 0.24,
          y + step,
          pale,
          alpha * (1 - step / (length * 1.35)),
        );
      }
    }
  } else if (weather === 'snow') {
    const flakeCount = compact ? 50 : 82;
    for (let flake = 0; flake < flakeCount; flake += 1) {
      const x = hashNoise(flake, 13, 29) * width;
      const y = hashNoise(flake, 17, 71) * height;
      const radius = 0.9 + hashNoise(flake, 31, 47) * (compact ? 1.6 : 2.2);
      fillDisc(data, width, height, x, y, radius, pale, 105 + radius * 44, true);
    }
  } else if (weather === 'cloudy') {
    for (let band = 0; band < (compact ? 6 : 9); band += 1) {
      const cx = 4 + band * (width / 7);
      fillDisc(data, width, height, cx, height * (0.38 + (band % 2) * 0.08), compact ? 18 : 26, [153, 168, 178], 34, true);
    }
  } else {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (hashNoise(x, y, 97) > 0.9975) setOverlayPixel(data, width, height, x, y, [226, 232, 231], 14);
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

function makeArchMesh(group, geometry, material, y, z, towardBoard, name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(0, y, z);
  mesh.rotation.y = towardBoard < 0 ? Math.PI : 0;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}

function boxDimensions(mesh) {
  const params = mesh?.geometry?.parameters;
  if (mesh?.geometry?.type !== 'BoxGeometry' || !params) return null;
  return [Number(params.width), Number(params.height), Number(params.depth)];
}

function closeTo(value, expected, tolerance = 0.035) {
  return Number.isFinite(value) && Math.abs(value - expected) <= tolerance;
}

function matchesBox(mesh, expected) {
  const dims = boxDimensions(mesh);
  return Boolean(dims) && dims.every((value, index) => closeTo(value, expected[index]));
}

function retireLegacyWindow(group, { wallZ, towardBoard }) {
  const legacyX = towardBoard * 4.2;
  let retired = 0;

  group.traverse?.((object) => {
    if (!object?.isMesh || object.name?.startsWith?.('war-room-weather-window')) return;
    const x = Number(object.position?.x);
    const y = Number(object.position?.y);
    const z = Number(object.position?.z);
    const color = object.material?.color?.getHex?.();
    if (![x, y, z].every(Number.isFinite)) return;

    const zOffset = (z - wallZ) / towardBoard;
    if (Math.abs(x - legacyX) > 2.45 || y < 1.55 || y > 5.08 || zOffset < 0.24 || zOffset > 0.5) return;

    const oldBackdrop = color === 0x0a2334 && matchesBox(object, [4.3, 3.1, 0.16]);
    const oldHorizontalFrame = color === 0x2a160d && matchesBox(object, [4.55, 0.15, 0.35]);
    const oldVerticalFrame = color === 0x2a160d && matchesBox(object, [0.15, 3.3, 0.35]);
    const oldVerticalMullion = color === 0x1f2f3a && matchesBox(object, [0.11, 3.05, 0.28]);
    const oldTransom = color === 0x1f2f3a && matchesBox(object, [4.3, 0.1, 0.28]);
    const oldTower = color === 0x09131b && object.geometry?.type === 'BoxGeometry' && closeTo(object.geometry.parameters?.width, 0.4);
    const oldMoon = color === 0xb9d9f0 && object.geometry?.type === 'SphereGeometry' && closeTo(object.geometry.parameters?.radius, 0.28);

    if (!(oldBackdrop || oldHorizontalFrame || oldVerticalFrame || oldVerticalMullion || oldTransom || oldTower || oldMoon)) return;
    object.visible = false;
    object.userData ||= {};
    object.userData.warRoomLegacyWindowRetired = WAR_ROOM_NIGHT_WINDOW_VERSION;
    retired += 1;
  });

  group.userData.warRoomLegacyWindowRetiredCount = retired;
  return retired;
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
      texture.offset.y = -((now * 0.000052) % 1);
      texture.offset.x = (now * 0.000006) % 1;
    } else if (weather === 'snow') {
      texture.offset.y = -((now * 0.000014) % 1);
      texture.offset.x = Math.sin(now * 0.00018) * 0.04;
    } else {
      texture.offset.x = (now * 0.000004) % 1;
    }
  };
}

function installWeatherWindow(group, {
  wallZ,
  towardBoard,
  weather,
  compact = false,
}) {
  const side = Math.sign(towardBoard) || 1;
  const window = new THREE.Group();
  window.name = 'war-room-weather-window';
  window.position.x = side * WINDOW_X;
  window.userData.warRoomWeatherWindow = WAR_ROOM_NIGHT_WINDOW_VERSION;
  window.userData.weather = weather;
  window.userData.side = side > 0 ? 'right' : 'left';
  window.userData.compact = compact;

  const frontZ = wallZ + towardBoard * 1.18;
  const frameZ = frontZ + towardBoard * 0.105;
  const curveSegments = compact ? 12 : 28;
  const innerGeometry = new THREE.ShapeGeometry(createArchShape(WINDOW_WIDTH, WINDOW_HEIGHT), curveSegments);
  const outerGeometry = new THREE.ShapeGeometry(createArchShape(WINDOW_WIDTH + 0.42, WINDOW_HEIGHT + 0.45), curveSegments);

  const recessMaterial = new THREE.MeshBasicMaterial({ color: 0x100d0c, side: THREE.DoubleSide, toneMapped: false });
  const recess = makeArchMesh(
    window,
    outerGeometry,
    recessMaterial,
    WINDOW_CENTER_Y + 0.01,
    frontZ,
    towardBoard,
    'war-room-weather-window-recess',
  );
  recess.renderOrder = 0;

  const skyMaterial = new THREE.MeshBasicMaterial({
    map: createWeatherSkyTexture(weather, compact),
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const sky = makeArchMesh(
    window,
    innerGeometry,
    skyMaterial,
    WINDOW_CENTER_Y,
    frontZ + towardBoard * 0.04,
    towardBoard,
    'war-room-weather-window-sky',
  );
  sky.userData.weather = weather;
  sky.renderOrder = 1;

  const overlayMaterial = new THREE.MeshBasicMaterial({
    map: createWeatherOverlayTexture(weather, compact),
    transparent: true,
    opacity: weather === 'rain' ? 0.9 : weather === 'snow' ? 0.86 : 0.64,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const precipitation = makeArchMesh(
    window,
    innerGeometry.clone(),
    overlayMaterial,
    WINDOW_CENTER_Y,
    frontZ + towardBoard * 0.058,
    towardBoard,
    'war-room-weather-window-precipitation',
  );
  precipitation.renderOrder = 3;
  precipitation.userData.weather = weather;
  attachWeatherMotion(precipitation, weather);

  if (!compact) {
    const glassMaterial = physical(0xc8d8df, {
      roughness: weather === 'rain' ? 0.32 : 0.5,
      clearcoat: 0.78,
      clearcoatRoughness: 0.16,
      specularIntensity: 0.78,
      opacity: 0.085,
      depthWrite: false,
    });
    const glass = makeArchMesh(
      window,
      innerGeometry.clone(),
      glassMaterial,
      WINDOW_CENTER_Y,
      frontZ + towardBoard * 0.073,
      towardBoard,
      'war-room-weather-window-glass',
    );
    glass.renderOrder = 4;
  }

  const timber = physical(0x321d12, {
    roughness: 0.46,
    clearcoat: 0.3,
    clearcoatRoughness: 0.28,
    specularIntensity: 0.46,
  });
  const innerTrim = physical(0x78562d, {
    metalness: 0.34,
    roughness: 0.35,
    clearcoat: 0.3,
    clearcoatRoughness: 0.24,
    specularIntensity: 0.5,
  });
  const outerStone = physical(0x4a4035, {
    roughness: 0.78,
    clearcoat: 0.04,
    clearcoatRoughness: 0.65,
    specularIntensity: 0.2,
  });

  const radius = WINDOW_WIDTH / 2;
  const halfHeight = WINDOW_HEIGHT / 2;
  const shoulderY = WINDOW_CENTER_Y + halfHeight - radius;
  const bottomY = WINDOW_CENTER_Y - halfHeight;
  const straightHeight = shoulderY - bottomY;
  const frameDepth = compact ? 0.1 : 0.14;

  // Deep jambs and a restrained stone reveal make the window read as an
  // architectural opening instead of a glowing rectangle pasted on the wall.
  for (const sideSign of [-1, 1]) {
    addBox(
      window,
      [0.22, straightHeight + 0.22, 0.18],
      outerStone,
      [sideSign * (radius + 0.16), bottomY + straightHeight / 2, frameZ - towardBoard * 0.025],
      `war-room-weather-window-stone-jamb-${sideSign < 0 ? 'left' : 'right'}`,
    );
    addBox(
      window,
      [0.105, straightHeight + 0.14, frameDepth],
      timber,
      [sideSign * (radius + 0.045), bottomY + straightHeight / 2, frameZ],
      `war-room-weather-window-jamb-${sideSign < 0 ? 'left' : 'right'}`,
    );
  }

  addBox(
    window,
    [WINDOW_WIDTH + 0.5, 0.2, 0.28],
    outerStone,
    [0, bottomY - 0.13, frameZ - towardBoard * 0.03],
    'war-room-weather-window-stone-sill',
  );
  addBox(
    window,
    [WINDOW_WIDTH + 0.25, 0.11, 0.2],
    timber,
    [0, bottomY - 0.03, frameZ],
    'war-room-weather-window-sill',
  );

  const outerArch = new THREE.Mesh(
    new THREE.TorusGeometry(radius + 0.16, compact ? 0.12 : 0.145, compact ? 6 : 10, compact ? 24 : 48, Math.PI),
    outerStone,
  );
  outerArch.name = 'war-room-weather-window-stone-arch';
  outerArch.position.set(0, shoulderY, frameZ - towardBoard * 0.03);
  outerArch.castShadow = !compact;
  outerArch.receiveShadow = true;
  window.add(outerArch);

  const archTrim = new THREE.Mesh(
    new THREE.TorusGeometry(radius + 0.045, compact ? 0.055 : 0.065, 8, compact ? 28 : 48, Math.PI),
    timber,
  );
  archTrim.name = 'war-room-weather-window-arch-trim';
  archTrim.position.set(0, shoulderY, frameZ);
  archTrim.castShadow = !compact;
  archTrim.receiveShadow = true;
  window.add(archTrim);

  // Tall vertical mullion + two restrained horizontals: closer to the mock and
  // less "office window" than the old single cruciform cross.
  addBox(
    window,
    [0.07, WINDOW_HEIGHT - 0.25, 0.09],
    innerTrim,
    [0, WINDOW_CENTER_Y - 0.03, frameZ + towardBoard * 0.025],
    'war-room-weather-window-mullion',
  );
  for (const y of [bottomY + straightHeight * 0.42, shoulderY - 0.2]) {
    addBox(
      window,
      [WINDOW_WIDTH - 0.18, 0.06, 0.09],
      innerTrim,
      [0, y, frameZ + towardBoard * 0.025],
      'war-room-weather-window-transom',
    );
  }

  group.add(window);
  return window;
}

export function installWarRoomNightWindowDepth(group, {
  wallZ,
  towardBoard,
  coarsePointer = false,
  weather = null,
} = {}) {
  if (!group || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return 0;
  if (group.userData.warRoomNightWindowDepth === WAR_ROOM_NIGHT_WINDOW_VERSION) return 0;

  const condition = normalizeWarRoomWeather(weather || group.userData.warRoomWeather);
  const side = Math.sign(towardBoard) || 1;

  retireLegacyWindow(group, { wallZ, towardBoard });

  const fireplace = group.getObjectByName?.('war-room-fireplace');
  if (fireplace) {
    fireplace.position.x = side * FIREPLACE_X;
    fireplace.userData.warRoomWeatherWindowLayout = WAR_ROOM_NIGHT_WINDOW_VERSION;
  }

  const window = installWeatherWindow(group, {
    wallZ,
    towardBoard,
    weather: condition,
    compact: coarsePointer,
  });

  group.userData.warRoomNightWindowDepth = WAR_ROOM_NIGHT_WINDOW_VERSION;
  group.userData.warRoomWeather = condition;
  group.userData.warRoomWeatherWindowSide = side > 0 ? 'right' : 'left';
  group.userData.warRoomWeatherWindowCompact = Boolean(coarsePointer);
  group.userData.warRoomWeatherWindowMeshCount = window.children.filter((child) => child.isMesh).length;
  group.userData.warRoomNightWindowMeshCount = group.userData.warRoomWeatherWindowMeshCount;
  group.userData.warRoomNightWindowTextureCount = 2;
  return group.userData.warRoomWeatherWindowMeshCount;
}
