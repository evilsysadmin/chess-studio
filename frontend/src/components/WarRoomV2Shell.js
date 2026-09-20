import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export const WAR_ROOM_V2_STAGING_MODEL_URL =
  'https://assets.chess-studio.shadowops.dpdns.org/war-room/v2/staging/current.glb';
export const WAR_ROOM_V2_BOARD_ANCHOR_Y = 1.12;

export function warRoomV2ModelUrl({
  buildSha = import.meta.env.VITE_BUILD_SHA,
  baseUrl = WAR_ROOM_V2_STAGING_MODEL_URL,
} = {}) {
  const version = String(buildSha || '').trim();
  if (!version) return baseUrl;
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}build=${encodeURIComponent(version)}`;
}

export function configureWarRoomV2Loader(loader) {
  if (!loader?.setMeshoptDecoder) throw new TypeError('War Room v2 loader requires Meshopt support');
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

export function warRoomV2EnvMapIntensity(materialName = '') {
  const name = String(materialName || '').toLowerCase();
  if (name.includes('heraldic_brass')) return 0.96;
  if (name.includes('brass')) return 0.82;
  if (name.includes('armor')) return 0.76;
  if (name.includes('window')) return 0.56;
  if (name.includes('stone') || name.includes('wall_plaster')) return 0.16;
  if (name.includes('burgundy') || name.includes('leather') || name.includes('velvet') || name.includes('rug')) return 0.11;
  if (name.includes('walnut') || name.includes('wood') || name.includes('parquet')) return 0.26;
  return 0.23;
}

export function warRoomV2MaterialFinishProfile(materialName = '') {
  const name = String(materialName || '').toLowerCase();
  if (name.includes('canon_burgundy') || name.includes('burgundy')) {
    return Object.freeze({
      colorScale: [0.78, 0.56, 0.62],
      roughness: [0.84, 1],
      clearcoatMax: 0.02,
    });
  }
  if (name.includes('brass')) {
    return Object.freeze({
      colorScale: [0.92, 0.78, 0.58],
      roughness: [0.30, 0.46],
      clearcoatMax: 0.24,
    });
  }
  if (name.includes('armor')) {
    return Object.freeze({
      colorScale: [0.80, 0.86, 0.98],
      roughness: [0.34, 0.52],
      clearcoatMax: 0.18,
    });
  }
  if (name.includes('stone') || name.includes('wall_plaster')) {
    return Object.freeze({
      colorScale: [0.88, 0.91, 0.98],
      roughness: [0.76, 0.96],
      clearcoatMax: 0.05,
    });
  }
  if (name.includes('walnut') || name.includes('wood')) {
    return Object.freeze({
      colorScale: [0.90, 0.82, 0.76],
      roughness: [0.48, 0.70],
      clearcoatMax: 0.18,
    });
  }
  return null;
}

export function scheduleWarRoomV2AfterFirstPaint(task, scheduler = {}) {
  if (typeof task !== 'function') return () => {};

  const host = typeof globalThis !== 'undefined' ? globalThis : {};
  const requestFrame = scheduler.requestFrame || host.requestAnimationFrame?.bind(host);
  const cancelFrame = scheduler.cancelFrame || host.cancelAnimationFrame?.bind(host);
  const requestIdle = scheduler.requestIdle || host.requestIdleCallback?.bind(host);
  const cancelIdle = scheduler.cancelIdle || host.cancelIdleCallback?.bind(host);
  const setTimer = scheduler.setTimer || ((callback) => setTimeout(callback, 0));
  const clearTimer = scheduler.clearTimer || ((id) => clearTimeout(id));
  let cancelled = false;
  let frameId = 0;
  let idleId = 0;
  let timerId = 0;

  const run = () => {
    if (!cancelled) task();
  };
  const afterPaint = () => {
    if (cancelled) return;
    if (requestIdle) idleId = requestIdle(run, { timeout: 220 });
    else timerId = setTimer(run, 0);
  };

  if (requestFrame) frameId = requestFrame(afterPaint);
  else timerId = setTimer(afterPaint, 0);

  return () => {
    cancelled = true;
    if (frameId && cancelFrame) cancelFrame(frameId);
    if (idleId && cancelIdle) cancelIdle(idleId);
    if (timerId) clearTimer(timerId);
  };
}

export function warRoomV2PracticalLightProfile({ coarsePointer = false } = {}) {
  return {
    fire: {
      color: 0xff8a38,
      intensity: coarsePointer ? 1.42 : 2.30,
      distance: 10.8,
      decay: 2,
    },
    rightFire: {
      color: 0xff7f30,
      intensity: coarsePointer ? 0.88 : 1.68,
      distance: 9.2,
      decay: 2,
    },
    chandelier: {
      color: 0xffb457,
      intensity: coarsePointer ? 0 : 0.92,
      distance: 7.8,
      decay: 2,
    },
    moon: {
      color: 0x7ba6ff,
      intensity: coarsePointer ? 2.02 : 3.42,
      distance: 15.2,
      decay: 2,
    },
  };
}

export function warRoomV2RuntimeSurfaceKind(materialName = '') {
  const name = String(materialName || '').toLowerCase();
  if (
    name.includes('brass')
    || name.includes('armor')
    || name.includes('hearth_iron')
    || name.includes('red_metal')
  ) return 'metal';
  if (
    name.includes('burgundy')
    || name.includes('velvet')
    || name.includes('rug')
  ) return 'fabric';
  if (name.includes('leather')) return 'leather';
  if (name.includes('stone') || name.includes('wall_plaster') || name.includes('floor_underlay')) return 'stone';
  if (name.includes('walnut') || name.includes('wood')) return 'wood';
  return null;
}

export function warRoomV2StoneSurfaceProfile({ coarsePointer = false } = {}) {
  return coarsePointer
    ? Object.freeze({ enabled: true, size: 24, bumpScale: 0, albedoCompensation: 1.10 })
    : Object.freeze({ enabled: true, size: 32, bumpScale: 0.012, albedoCompensation: 1.10 });
}

export function warRoomV2WoodSurfaceProfile({ coarsePointer = false } = {}) {
  return coarsePointer
    ? Object.freeze({ enabled: true, size: 32, bumpScale: 0, albedoCompensation: 1.055 })
    : Object.freeze({ enabled: true, size: 48, bumpScale: 0.007, albedoCompensation: 1.055 });
}

export function warRoomV2MetalSurfaceProfile({ coarsePointer = false } = {}) {
  return coarsePointer
    ? Object.freeze({ enabled: true, size: 24, bumpScale: 0, albedoCompensation: 1.02 })
    : Object.freeze({ enabled: true, size: 48, bumpScale: 0.0045, albedoCompensation: 1.025 });
}

export function warRoomV2FabricSurfaceProfile({ coarsePointer = false } = {}) {
  return coarsePointer
    ? Object.freeze({ enabled: true, size: 24, bumpScale: 0, albedoCompensation: 1.035 })
    : Object.freeze({ enabled: true, size: 48, bumpScale: 0.006, albedoCompensation: 1.04 });
}

export function warRoomV2LeatherSurfaceProfile({ coarsePointer = false } = {}) {
  return coarsePointer
    ? Object.freeze({ enabled: true, size: 24, bumpScale: 0, albedoCompensation: 1.025 })
    : Object.freeze({ enabled: true, size: 48, bumpScale: 0.0075, albedoCompensation: 1.03 });
}

function nextSurfaceNoise(state) {
  const next = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return [next, ((next >>> 8) & 0xffff) / 0xffff];
}

function createWarRoomV2StoneTexture({ mode = 'albedo', size = 32 } = {}) {
  const data = new Uint8Array(size * size * 4);
  let state = mode === 'albedo' ? 0x4b1d : 0x8e37;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let noise;
      [state, noise] = nextSurfaceNoise(state);
      const u = x / Math.max(1, size - 1);
      const v = y / Math.max(1, size - 1);
      const broad = Math.sin((u * 1.45 + v * 0.72) * Math.PI * 2) * 16
        + Math.cos((u * 0.58 - v * 1.18) * Math.PI * 2) * 11;
      const mineral = Math.sin((u - v) * Math.PI * 4.2) * 5;
      const random = (noise - 0.5) * (mode === 'albedo' ? 8 : 18);
      const base = mode === 'albedo' ? 228 : 236;
      const signal = mode === 'albedo' ? broad + mineral + random : broad * 0.65 + mineral * 1.8 + random;
      const value = THREE.MathUtils.clamp(
        Math.round(base + signal),
        mode === 'albedo' ? 198 : 204,
        255,
      );
      const index = (y * size + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `war-room-v2-stone-${mode}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(mode === 'albedo' ? 0.86 : 1.8, mode === 'albedo' ? 0.78 : 1.6);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = mode === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createWarRoomV2FabricTexture({ mode = 'albedo', size = 48 } = {}) {
  const data = new Uint8Array(size * size * 4);
  let state = mode === 'albedo' ? 0x91af : 0x5d23;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let noise;
      [state, noise] = nextSurfaceNoise(state);
      const u = x / Math.max(1, size - 1);
      const v = y / Math.max(1, size - 1);
      const warp = Math.abs(Math.sin(u * Math.PI * 2 * 21));
      const weft = Math.abs(Math.sin(v * Math.PI * 2 * 24));
      const fold = Math.sin((u * 1.2 + v * 0.55) * Math.PI * 2) * 3.2;
      const random = (noise - 0.5) * (mode === 'albedo' ? 2.4 : 12);
      const base = mode === 'albedo' ? 244 : 224;
      const signal = mode === 'albedo'
        ? (warp + weft - 1) * 2.0 + fold + random
        : (warp + weft - 1) * 13 + fold * 0.7 + random;
      const value = THREE.MathUtils.clamp(
        Math.round(base + signal),
        mode === 'albedo' ? 226 : 184,
        255,
      );
      const index = (y * size + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `war-room-v2-fabric-${mode}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(mode === 'albedo' ? 4.2 : 5.6, mode === 'albedo' ? 4.8 : 6.4);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = mode === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createWarRoomV2LeatherTexture({ mode = 'albedo', size = 48 } = {}) {
  const data = new Uint8Array(size * size * 4);
  let state = mode === 'albedo' ? 0x3ca7 : 0xe119;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let noise;
      [state, noise] = nextSurfaceNoise(state);
      const u = x / Math.max(1, size - 1);
      const v = y / Math.max(1, size - 1);
      const pores = Math.sin((u * 29 + v * 37 + Math.sin(v * Math.PI * 8) * 0.45) * Math.PI * 2);
      const cloud = Math.sin((u * 2.4 - v * 3.1) * Math.PI * 2);
      const random = (noise - 0.5) * (mode === 'albedo' ? 3 : 17);
      const base = mode === 'albedo' ? 246 : 226;
      const signal = mode === 'albedo'
        ? pores * 1.3 + cloud * 3.0 + random
        : pores * 7.5 + cloud * 5.2 + random;
      const value = THREE.MathUtils.clamp(
        Math.round(base + signal),
        mode === 'albedo' ? 226 : 184,
        255,
      );
      const index = (y * size + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `war-room-v2-leather-${mode}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(mode === 'albedo' ? 2.8 : 4.2, mode === 'albedo' ? 2.8 : 4.2);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = mode === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createWarRoomV2MetalTexture({ mode = 'albedo', size = 48 } = {}) {
  const data = new Uint8Array(size * size * 4);
  let state = mode === 'albedo' ? 0xb347 : 0xc821;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let noise;
      [state, noise] = nextSurfaceNoise(state);
      const u = x / Math.max(1, size - 1);
      const v = y / Math.max(1, size - 1);
      const brushed = Math.sin((v * 31.0 + Math.sin(u * Math.PI * 2) * 0.18) * Math.PI * 2) * 5.2;
      const broad = Math.sin((u * 1.8 + v * 0.22) * Math.PI * 2) * 2.8;
      const random = (noise - 0.5) * (mode === 'albedo' ? 2.6 : 16);
      const base = mode === 'albedo' ? 248 : 226;
      const signal = mode === 'albedo'
        ? brushed * 0.42 + broad + random
        : brushed * 1.15 + broad * 0.45 + random;
      const value = THREE.MathUtils.clamp(
        Math.round(base + signal),
        mode === 'albedo' ? 232 : 190,
        255,
      );
      const index = (y * size + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `war-room-v2-metal-${mode}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(mode === 'albedo' ? 1.25 : 1.8, mode === 'albedo' ? 5.4 : 7.2);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = mode === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createWarRoomV2WoodTexture({ mode = 'albedo', size = 48 } = {}) {
  const data = new Uint8Array(size * size * 4);
  let state = mode === 'albedo' ? 0x6f31 : 0xa23d;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let noise;
      [state, noise] = nextSurfaceNoise(state);
      const u = x / Math.max(1, size - 1);
      const v = y / Math.max(1, size - 1);
      const warp = Math.sin((v * 2.2 + Math.sin(v * Math.PI * 2) * 0.16) * Math.PI * 2) * 0.18;
      const grain = Math.sin((u * 8.4 + warp) * Math.PI * 2) * 8.5
        + Math.sin((u * 18.6 + v * 0.42) * Math.PI * 2) * 3.0;
      const broad = Math.sin((u * 1.35 + v * 0.18) * Math.PI * 2) * 4.0;
      const random = (noise - 0.5) * (mode === 'albedo' ? 3.5 : 16);
      const base = mode === 'albedo' ? 241 : 232;
      const signal = mode === 'albedo' ? grain + broad + random : grain * 0.48 + broad * 0.35 + random;
      const value = THREE.MathUtils.clamp(
        Math.round(base + signal),
        mode === 'albedo' ? 220 : 202,
        255,
      );
      const index = (y * size + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `war-room-v2-wood-${mode}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(mode === 'albedo' ? 2.4 : 3.2, mode === 'albedo' ? 0.82 : 1.1);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = mode === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function installRuntimeWoodSurface(material, sharedTextures, { coarsePointer = false } = {}) {
  if (warRoomV2RuntimeSurfaceKind(material?.name) !== 'wood') return false;
  const profile = warRoomV2WoodSurfaceProfile({ coarsePointer });
  if (!profile.enabled) return false;

  sharedTextures.albedo ||= createWarRoomV2WoodTexture({ mode: 'albedo', size: profile.size });

  if (!material.map) {
    material.map = sharedTextures.albedo;
    material.color.multiplyScalar(profile.albedoCompensation);
  }
  if (profile.bumpScale > 0) {
    sharedTextures.micro ||= createWarRoomV2WoodTexture({ mode: 'micro', size: profile.size });
    if (!material.roughnessMap) material.roughnessMap = sharedTextures.micro;
    if (!material.bumpMap) material.bumpMap = sharedTextures.micro;
  }
  material.bumpScale = profile.bumpScale;
  material.userData ||= {};
  material.userData.warRoomV2RuntimeSurface = 'walnut-grain-v1';
  material.needsUpdate = true;
  return true;
}

function installRuntimeFabricSurface(material, sharedTextures, { coarsePointer = false } = {}) {
  if (warRoomV2RuntimeSurfaceKind(material?.name) !== 'fabric') return false;
  const profile = warRoomV2FabricSurfaceProfile({ coarsePointer });
  if (!profile.enabled) return false;

  sharedTextures.albedo ||= createWarRoomV2FabricTexture({ mode: 'albedo', size: profile.size });
  if (!material.map) {
    material.map = sharedTextures.albedo;
    material.color.multiplyScalar(profile.albedoCompensation);
  }
  if (profile.bumpScale > 0) {
    sharedTextures.micro ||= createWarRoomV2FabricTexture({ mode: 'micro', size: profile.size });
    if (!material.roughnessMap) material.roughnessMap = sharedTextures.micro;
    if (!material.bumpMap) material.bumpMap = sharedTextures.micro;
  }
  material.bumpScale = profile.bumpScale;
  material.userData ||= {};
  material.userData.warRoomV2RuntimeSurface = 'woven-fabric-v1';
  material.needsUpdate = true;
  return true;
}

function installRuntimeLeatherSurface(material, sharedTextures, { coarsePointer = false } = {}) {
  if (warRoomV2RuntimeSurfaceKind(material?.name) !== 'leather') return false;
  const profile = warRoomV2LeatherSurfaceProfile({ coarsePointer });
  if (!profile.enabled) return false;

  sharedTextures.albedo ||= createWarRoomV2LeatherTexture({ mode: 'albedo', size: profile.size });
  if (!material.map) {
    material.map = sharedTextures.albedo;
    material.color.multiplyScalar(profile.albedoCompensation);
  }
  if (profile.bumpScale > 0) {
    sharedTextures.micro ||= createWarRoomV2LeatherTexture({ mode: 'micro', size: profile.size });
    if (!material.roughnessMap) material.roughnessMap = sharedTextures.micro;
    if (!material.bumpMap) material.bumpMap = sharedTextures.micro;
  }
  material.bumpScale = profile.bumpScale;
  material.userData ||= {};
  material.userData.warRoomV2RuntimeSurface = 'aged-leather-v1';
  material.needsUpdate = true;
  return true;
}

function installRuntimeMetalSurface(material, sharedTextures, { coarsePointer = false } = {}) {
  if (warRoomV2RuntimeSurfaceKind(material?.name) !== 'metal') return false;
  const profile = warRoomV2MetalSurfaceProfile({ coarsePointer });
  if (!profile.enabled) return false;

  sharedTextures.albedo ||= createWarRoomV2MetalTexture({ mode: 'albedo', size: profile.size });

  if (!material.map) {
    material.map = sharedTextures.albedo;
    material.color.multiplyScalar(profile.albedoCompensation);
  }
  if (profile.bumpScale > 0) {
    sharedTextures.micro ||= createWarRoomV2MetalTexture({ mode: 'micro', size: profile.size });
    if (!material.roughnessMap) material.roughnessMap = sharedTextures.micro;
    if (!material.bumpMap) material.bumpMap = sharedTextures.micro;
  }
  material.bumpScale = profile.bumpScale;
  material.userData ||= {};
  material.userData.warRoomV2RuntimeSurface = 'brushed-metal-v1';
  material.needsUpdate = true;
  return true;
}

function installRuntimeStoneSurface(material, sharedTextures, { coarsePointer = false } = {}) {
  if (warRoomV2RuntimeSurfaceKind(material?.name) !== 'stone') return false;
  const profile = warRoomV2StoneSurfaceProfile({ coarsePointer });
  if (!profile.enabled) return false;

  sharedTextures.albedo ||= createWarRoomV2StoneTexture({ mode: 'albedo', size: profile.size });

  if (!material.map) {
    material.map = sharedTextures.albedo;
    // The albedo map is intentionally darker than white so broad mineral
    // mottling survives ACES/8-bit output. Compensate its average loss here so
    // the authored Blender value stays the visual baseline instead of the whole
    // room simply becoming darker.
    material.color.multiplyScalar(profile.albedoCompensation);
  }
  if (profile.bumpScale > 0) {
    sharedTextures.micro ||= createWarRoomV2StoneTexture({ mode: 'micro', size: profile.size });
    if (!material.roughnessMap) material.roughnessMap = sharedTextures.micro;
    if (!material.bumpMap) material.bumpMap = sharedTextures.micro;
  }
  material.bumpScale = profile.bumpScale;
  material.userData ||= {};
  material.userData.warRoomV2RuntimeSurface = 'stone-meso-v2';
  material.needsUpdate = true;
  return true;
}

function installAuthoredPracticalLights(root, { coarsePointer = false } = {}) {
  const profile = warRoomV2PracticalLightProfile({ coarsePointer });
  const entries = [
    ['WR_ANCHOR_fireplace_practical', 'war-room-v2-fire-practical', profile.fire],
    ['WR_ANCHOR_right_fireplace_practical', 'war-room-v2-right-fire-practical', profile.rightFire],
    ['WR_ANCHOR_chandelier_practical', 'war-room-v2-chandelier-practical', profile.chandelier],
    ['WR_ANCHOR_window_moonlight', 'war-room-v2-moon-practical', profile.moon],
  ];

  let installed = 0;
  for (const [anchorName, lightName, spec] of entries) {
    if (!spec || spec.intensity <= 0) continue;
    const authoredAnchor = root.getObjectByName(anchorName);
    if (!authoredAnchor) continue;
    const practical = new THREE.PointLight(spec.color, spec.intensity, spec.distance, spec.decay);
    practical.name = lightName;
    practical.castShadow = false;
    practical.userData.warRoomV2Practical = anchorName;
    authoredAnchor.add(practical);
    installed += 1;
  }
  root.userData.warRoomV2PracticalLights = installed;
  return installed;
}

function tuneRuntimeMaterial(material) {
  if (!material?.isMeshStandardMaterial) return;
  material.envMapIntensity = warRoomV2EnvMapIntensity(material.name);
  const finish = warRoomV2MaterialFinishProfile(material.name);
  if (finish) {
    const [r, g, b] = finish.colorScale;
    material.color?.multiply?.(new THREE.Color(r, g, b));
    if (Number.isFinite(material.roughness)) {
      material.roughness = THREE.MathUtils.clamp(
        material.roughness,
        finish.roughness[0],
        finish.roughness[1],
      );
    }
    if (Number.isFinite(material.clearcoat)) {
      material.clearcoat = Math.min(material.clearcoat, finish.clearcoatMax);
    }
  }
  material.userData ||= {};
  material.userData.warRoomV2Finish = 'cinematic-gothic-v3';
  material.needsUpdate = true;
}

function disposeShell(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root?.traverse?.((node) => {
    if (node.geometry) geometries.add(node.geometry);
    const rows = Array.isArray(node.material) ? node.material : [node.material];
    rows.forEach((material) => {
      if (!material) return;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
    });
  });
  textures.forEach((texture) => texture.dispose?.());
  materials.forEach((material) => material.dispose?.());
  geometries.forEach((geometry) => geometry.dispose?.());
}

export async function installWarRoomV2Shell(
  scene,
  {
    whiteSide = true,
    coarsePointer = false,
    url = warRoomV2ModelUrl(),
    onRefine,
  } = {},
) {
  if (!scene?.add) throw new Error('War Room v2 requires a Three.js scene');
  const loader = configureWarRoomV2Loader(new GLTFLoader());
  const gltf = await loader.loadAsync(url);
  const root = gltf?.scene;
  if (!root) throw new Error('War Room v2 GLB has no scene');

  root.name = 'war-room-v2-blender-shell';
  // Blender exports Z-up to glTF Y-up. Its preview board top is Y=1.12 after
  // conversion, while the live Three board uses Y=0 as its tactical datum.
  root.position.set(0, -WAR_ROOM_V2_BOARD_ANCHOR_Y, 0);
  root.rotation.y = whiteSide ? 0 : Math.PI;
  const tunedMaterials = new Set();
  const runtimeStoneTextures = {};
  const runtimeWoodTextures = {};
  const runtimeMetalTextures = {};
  const runtimeFabricTextures = {};
  const runtimeLeatherTextures = {};
  let runtimeStoneMaterials = 0;
  let runtimeWoodMaterials = 0;
  let runtimeMetalMaterials = 0;
  let runtimeFabricMaterials = 0;
  let runtimeLeatherMaterials = 0;
  const deferredShadowMeshes = [];
  root.traverse((node) => {
    if (!node.isMesh) return;
    // First paint prioritizes getting the room on screen. Static shell shadows
    // are restored immediately afterwards during browser idle time, preserving
    // the final desktop image without making shader/shadow warm-up block entry.
    node.castShadow = false;
    if (!coarsePointer) deferredShadowMeshes.push(node);
    node.receiveShadow = true;
    node.frustumCulled = true;
    const rows = Array.isArray(node.material) ? node.material : [node.material];
    rows.forEach((material) => {
      if (!material || tunedMaterials.has(material)) return;
      tunedMaterials.add(material);
      tuneRuntimeMaterial(material);
      if (installRuntimeStoneSurface(material, runtimeStoneTextures, { coarsePointer })) runtimeStoneMaterials += 1;
      if (installRuntimeWoodSurface(material, runtimeWoodTextures, { coarsePointer })) runtimeWoodMaterials += 1;
      if (installRuntimeMetalSurface(material, runtimeMetalTextures, { coarsePointer })) runtimeMetalMaterials += 1;
      if (installRuntimeFabricSurface(material, runtimeFabricTextures, { coarsePointer })) runtimeFabricMaterials += 1;
      if (installRuntimeLeatherSurface(material, runtimeLeatherTextures, { coarsePointer })) runtimeLeatherMaterials += 1;
    });
  });
  const practicalLights = installAuthoredPracticalLights(root, { coarsePointer });
  root.userData.warRoomVariant = 'v2';
  root.userData.warRoomRuntimeFinish = 'gltf-pbr-cinematic-gothic-v11';
  root.userData.warRoomV2PracticalLights = practicalLights;
  root.userData.warRoomV2RuntimeStoneMaterials = runtimeStoneMaterials;
  root.userData.warRoomV2RuntimeStoneTextures = Object.keys(runtimeStoneTextures).length;
  root.userData.warRoomV2RuntimeWoodMaterials = runtimeWoodMaterials;
  root.userData.warRoomV2RuntimeWoodTextures = Object.keys(runtimeWoodTextures).length;
  root.userData.warRoomV2RuntimeMetalMaterials = runtimeMetalMaterials;
  root.userData.warRoomV2RuntimeMetalTextures = Object.keys(runtimeMetalTextures).length;
  root.userData.warRoomV2RuntimeFabricMaterials = runtimeFabricMaterials;
  root.userData.warRoomV2RuntimeFabricTextures = Object.keys(runtimeFabricTextures).length;
  root.userData.warRoomV2RuntimeLeatherMaterials = runtimeLeatherMaterials;
  root.userData.warRoomV2RuntimeLeatherTextures = Object.keys(runtimeLeatherTextures).length;
  root.userData.warRoomV2ShadowWarmup = coarsePointer ? 'disabled-lite' : 'deferred-after-first-paint';
  root.userData.warRoomV2ShadowCasterCount = 0;
  scene.add(root);

  const cancelShadowWarmup = coarsePointer ? () => {} : scheduleWarRoomV2AfterFirstPaint(() => {
    if (!root.parent) return;
    deferredShadowMeshes.forEach((node) => { node.castShadow = true; });
    root.userData.warRoomV2ShadowWarmup = 'ready';
    root.userData.warRoomV2ShadowCasterCount = deferredShadowMeshes.length;
    onRefine?.();
  });

  return () => {
    cancelShadowWarmup();
    root.removeFromParent();
    disposeShell(root);
  };
}
