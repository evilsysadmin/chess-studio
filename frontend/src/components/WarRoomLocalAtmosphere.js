import * as THREE from 'three';

export const WAR_ROOM_LOCAL_ATMOSPHERE_VERSION = 'browser-local-atmosphere-v1';
export const WAR_ROOM_LOCAL_DAY_PHASES = Object.freeze(['night', 'dawn', 'day', 'dusk']);
export const WAR_ROOM_LOCAL_WEATHER_STATES = Object.freeze(['rain', 'cloudy', 'snow', 'sunny']);

const REFRESH_MS = 30_000;

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function mixRgb(a, b, amount) {
  const t = clamp01(amount);
  return [
    clampByte(a[0] + (b[0] - a[0]) * t),
    clampByte(a[1] + (b[1] - a[1]) * t),
    clampByte(a[2] + (b[2] - a[2]) * t),
  ];
}

function mixPalette(a, b, amount) {
  return {
    top: mixRgb(a.top, b.top, amount),
    low: mixRgb(a.low, b.low, amount),
    ridge: mixRgb(a.ridge, b.ridge, amount),
    cloud: mixRgb(a.cloud, b.cloud, amount),
  };
}

function hashNoise(x, y, seed) {
  const value = Math.sin((x * 12.9898 + y * 78.233 + seed * 41.137) * 0.913) * 43758.5453;
  return value - Math.floor(value);
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function resolveWarRoomLocalDayPhase(date = new Date()) {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour < 6.5 || hour >= 21.5) return 'night';
  if (hour < 8) return 'dawn';
  if (hour < 18.5) return 'day';
  return 'dusk';
}

function seasonalWeatherWeights(month) {
  if (month === 11 || month <= 1) {
    return { rain: 0.29, cloudy: 0.34, snow: 0.19, sunny: 0.18 };
  }
  if (month <= 4) {
    return { rain: 0.28, cloudy: 0.32, snow: 0.03, sunny: 0.37 };
  }
  if (month <= 7) {
    return { rain: 0.12, cloudy: 0.22, snow: 0, sunny: 0.66 };
  }
  return { rain: 0.31, cloudy: 0.37, snow: 0.03, sunny: 0.29 };
}

export function resolveWarRoomDailyWeather(date = new Date()) {
  const weights = seasonalWeatherWeights(date.getMonth());
  const roll = hashString(`war-room-weather:${localDateKey(date)}`);
  let cursor = 0;
  for (const weather of WAR_ROOM_LOCAL_WEATHER_STATES) {
    cursor += weights[weather];
    if (roll <= cursor) return weather;
  }
  return 'sunny';
}

export function resolveWarRoomLocalAtmosphere(date = new Date()) {
  const phase = resolveWarRoomLocalDayPhase(date);
  const weather = resolveWarRoomDailyWeather(date);
  return {
    phase,
    weather,
    dateKey: localDateKey(date),
    hour: date.getHours(),
    minute: date.getMinutes(),
    key: `${localDateKey(date)}:${phase}:${weather}`,
  };
}

function dayPalette(weather) {
  switch (weather) {
    case 'sunny':
      return { top: [70, 132, 190], low: [226, 190, 126], ridge: [48, 62, 53], cloud: [226, 224, 211] };
    case 'cloudy':
      return { top: [72, 88, 103], low: [148, 154, 160], ridge: [43, 51, 52], cloud: [165, 174, 182] };
    case 'snow':
      return { top: [101, 126, 148], low: [196, 207, 214], ridge: [74, 88, 90], cloud: [205, 215, 221] };
    case 'rain':
    default:
      return { top: [44, 67, 91], low: [104, 123, 139], ridge: [30, 43, 45], cloud: [111, 127, 141] };
  }
}

function paletteFor(weather, phase) {
  const day = dayPalette(weather);
  const night = {
    top: [10, 19, 38],
    low: [29, 44, 68],
    ridge: weather === 'snow' ? [61, 70, 78] : [10, 18, 22],
    cloud: [50, 61, 78],
  };
  if (phase === 'night') return night;
  if (phase === 'dawn') {
    return mixPalette(day, {
      top: [67, 75, 112],
      low: [225, 142, 91],
      ridge: [41, 45, 44],
      cloud: [186, 154, 143],
    }, 0.48);
  }
  if (phase === 'dusk') {
    return mixPalette(day, {
      top: [55, 62, 101],
      low: [220, 119, 68],
      ridge: [35, 39, 39],
      cloud: [163, 128, 127],
    }, 0.55);
  }
  return day;
}

function setPixel(data, width, height, x, y, rgb, alpha = 1) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || px >= width || py < 0 || py >= height) return;
  const index = (py * width + px) * 4;
  const mix = clamp01(alpha);
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
      if (overlay) setOverlayPixel(data, width, height, x, y, rgb, localAlpha * 255);
      else setPixel(data, width, height, x, y, rgb, localAlpha);
    }
  }
}

function createSkyTexture(weather, phase, compact) {
  const width = compact ? 112 : 176;
  const height = compact ? 128 : 160;
  const data = new Uint8Array(width * height * 4);
  const palette = paletteFor(weather, phase);

  for (let y = 0; y < height; y += 1) {
    const t = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const grain = (hashNoise(x, y, 17) - 0.5) * (phase === 'night' ? 4 : 7);
      const cloudBand = weather === 'sunny'
        ? 0
        : (Math.sin(x * 0.052 + y * 0.018) + Math.sin(x * 0.023 - y * 0.035 + 1.7)) * 4;
      const index = (y * width + x) * 4;
      data[index] = clampByte(palette.top[0] + (palette.low[0] - palette.top[0]) * t + grain + cloudBand);
      data[index + 1] = clampByte(palette.top[1] + (palette.low[1] - palette.top[1]) * t + grain + cloudBand);
      data[index + 2] = clampByte(palette.top[2] + (palette.low[2] - palette.top[2]) * t + grain + cloudBand * 1.1);
      data[index + 3] = 255;
    }
  }

  if (phase === 'night') {
    for (let y = 4; y < Math.floor(height * 0.58); y += 1) {
      for (let x = 3; x < width - 3; x += 1) {
        if (hashNoise(x, y, 119) > 0.994) {
          setPixel(data, width, height, x, y, [205, 220, 233], 0.72);
        }
      }
    }
    if (weather !== 'rain') {
      fillDisc(data, width, height, width * 0.72, height * 0.18, compact ? 5.5 : 8.5, [218, 226, 216], weather === 'cloudy' ? 0.5 : 0.9);
      fillDisc(data, width, height, width * 0.69, height * 0.16, compact ? 5 : 8, palette.top, 1);
    }
  } else if (weather === 'sunny') {
    const sunY = phase === 'day' ? height * 0.18 : height * 0.42;
    fillDisc(data, width, height, width * 0.72, sunY, compact ? 7 : 10, [251, 219, 145], 0.96);
    fillDisc(data, width, height, width * 0.72, sunY, compact ? 12 : 17, [237, 176, 98], 0.14);
  }

  if (weather !== 'sunny') {
    const cloudCount = compact ? 6 : 9;
    for (let cloud = 0; cloud < cloudCount; cloud += 1) {
      const cx = 3 + cloud * (width / Math.max(1, cloudCount - 1));
      const cy = height * (0.14 + (cloud % 3) * 0.055);
      fillDisc(data, width, height, cx, cy, compact ? 15 : 22, palette.cloud, weather === 'cloudy' ? 0.3 : 0.22);
    }
  }

  for (let x = 0; x < width; x += 1) {
    const ridge = height * 0.68
      + Math.sin(x * 0.091) * (compact ? 4 : 6)
      + Math.sin(x * 0.034 + 1.7) * (compact ? 7 : 10)
      + Math.sin(x * 0.19 + 0.4) * 2.5;
    for (let y = Math.max(0, Math.floor(ridge)); y < height; y += 1) {
      const depth = (y - ridge) / Math.max(1, height - ridge);
      const snowLift = weather === 'snow' && y < ridge + 5 ? 72 : 0;
      const index = (y * width + x) * 4;
      data[index] = clampByte(palette.ridge[0] + depth * 10 + snowLift);
      data[index + 1] = clampByte(palette.ridge[1] + depth * 10 + snowLift);
      data[index + 2] = clampByte(palette.ridge[2] + depth * 9 + snowLift);
      data[index + 3] = 255;
    }
  }

  const fortressX = Math.floor(width * 0.63);
  const fortressY = Math.floor(height * 0.56);
  const fortress = phase === 'night' ? [18, 24, 29] : weather === 'snow' ? [79, 84, 85] : [31, 37, 38];
  for (let y = fortressY; y < fortressY + Math.floor(height * 0.12); y += 1) {
    for (let x = fortressX; x < fortressX + Math.floor(width * 0.15); x += 1) {
      setPixel(data, width, height, x, y, fortress, 0.96);
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `war-room-local-sky-${phase}-${weather}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.userData.warRoomWeatherWindow = weather;
  texture.userData.warRoomDayPhase = phase;
  texture.userData.resolution = [width, height];
  return texture;
}

function createOverlayTexture(weather, phase, compact) {
  const width = compact ? 112 : 176;
  const height = compact ? 128 : 160;
  const data = new Uint8Array(width * height * 4);
  const pale = weather === 'snow' ? [235, 243, 247] : phase === 'night' ? [134, 171, 204] : [174, 208, 226];

  if (weather === 'rain') {
    const count = compact ? 66 : 116;
    for (let streak = 0; streak < count; streak += 1) {
      const x = Math.floor(hashNoise(streak, 7, 41) * width);
      const y = Math.floor(hashNoise(streak, 11, 67) * height);
      const length = (compact ? 10 : 13) + Math.floor(hashNoise(streak, 19, 13) * (compact ? 18 : 25));
      const alpha = phase === 'night' ? 145 : 118;
      for (let step = 0; step < length; step += 1) {
        setOverlayPixel(data, width, height, x - step * 0.24, y + step, pale, alpha * (1 - step / (length * 1.35)));
      }
    }
  } else if (weather === 'snow') {
    const count = compact ? 48 : 80;
    for (let flake = 0; flake < count; flake += 1) {
      const x = hashNoise(flake, 13, 29) * width;
      const y = hashNoise(flake, 17, 71) * height;
      const radius = 0.9 + hashNoise(flake, 31, 47) * (compact ? 1.6 : 2.2);
      fillDisc(data, width, height, x, y, radius, pale, 0.65, true);
    }
  } else if (weather === 'cloudy') {
    for (let band = 0; band < (compact ? 5 : 8); band += 1) {
      const cx = 4 + band * (width / 7);
      fillDisc(data, width, height, cx, height * (0.36 + (band % 2) * 0.08), compact ? 17 : 24, pale, 0.11, true);
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `war-room-local-overlay-${phase}-${weather}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.userData.warRoomWeatherWindow = weather;
  texture.userData.warRoomDayPhase = phase;
  texture.userData.warRoomWeatherLayer = 'precipitation';
  texture.userData.resolution = [width, height];
  return texture;
}

function replaceTexture(material, texture) {
  const old = material?.map;
  if (!material) return;
  material.map = texture;
  material.color?.setHex?.(0xffffff);
  material.depthTest = false;
  material.depthWrite = false;
  material.toneMapped = false;
  material.needsUpdate = true;
  if (old && old !== texture) old.dispose?.();
}

function makeWindowLayersVisible(window) {
  const sky = window.getObjectByName?.('war-room-weather-window-sky');
  const precipitation = window.getObjectByName?.('war-room-weather-window-precipitation');
  const glass = window.getObjectByName?.('war-room-weather-window-glass');
  const mullion = window.getObjectByName?.('war-room-weather-window-mullion');
  const transoms = window.children.filter((child) => child.name === 'war-room-weather-window-transom');

  for (const [object, order] of [[sky, 50], [precipitation, 51], [glass, 52], [mullion, 60], ...transoms.map((object) => [object, 60])]) {
    if (!object) continue;
    object.visible = true;
    object.frustumCulled = false;
    object.renderOrder = Math.max(order, Number(object.renderOrder || 0));
    if (object.material) {
      object.material.depthTest = false;
      object.material.depthWrite = false;
      object.material.needsUpdate = true;
    }
  }

  return { sky, precipitation, glass };
}

export function applyWarRoomLocalAtmosphere(root, { date = new Date(), force = false } = {}) {
  const window = root?.getObjectByName?.('war-room-weather-window');
  if (!window) return 0;

  const atmosphere = resolveWarRoomLocalAtmosphere(date);
  const { sky, precipitation } = makeWindowLayersVisible(window);
  if (!sky?.material || !precipitation?.material) return 0;

  const compact = Boolean(window.userData?.compact);
  if (force || window.userData.warRoomLocalAtmosphereKey !== atmosphere.key) {
    replaceTexture(sky.material, createSkyTexture(atmosphere.weather, atmosphere.phase, compact));
    replaceTexture(precipitation.material, createOverlayTexture(atmosphere.weather, atmosphere.phase, compact));
    precipitation.material.transparent = true;
    precipitation.material.opacity = atmosphere.weather === 'rain'
      ? 0.92
      : atmosphere.weather === 'snow'
        ? 0.88
        : atmosphere.weather === 'cloudy'
          ? 0.58
          : 0;
    precipitation.material.needsUpdate = true;

    window.userData.weather = atmosphere.weather;
    window.userData.warRoomDayPhase = atmosphere.phase;
    window.userData.warRoomLocalAtmosphere = WAR_ROOM_LOCAL_ATMOSPHERE_VERSION;
    window.userData.warRoomLocalAtmosphereKey = atmosphere.key;
    window.userData.warRoomLocalDate = atmosphere.dateKey;
    root.userData.warRoomWeather = atmosphere.weather;
    root.userData.warRoomDayPhase = atmosphere.phase;
    root.userData.warRoomLocalAtmosphere = WAR_ROOM_LOCAL_ATMOSPHERE_VERSION;
  }

  if (!sky.userData.warRoomLocalAtmosphereDriver) {
    let lastCheck = 0;
    const original = sky.onBeforeRender;
    sky.onBeforeRender = (...args) => {
      original?.(...args);
      const nowMs = typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
      if (nowMs - lastCheck < REFRESH_MS) return;
      lastCheck = nowMs;
      applyWarRoomLocalAtmosphere(root, { date: new Date() });
    };
    sky.userData.warRoomLocalAtmosphereDriver = WAR_ROOM_LOCAL_ATMOSPHERE_VERSION;
  }

  return 1;
}
