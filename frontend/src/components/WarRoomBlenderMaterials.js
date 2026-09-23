import * as THREE from 'three';

export function warRoomBlenderEnvMapIntensity(materialName = '') {
  const name = String(materialName || '').toLowerCase();
  if (name.includes('brass')) return 0.82;
  if (name.includes('armor')) return 0.76;
  if (name.includes('window')) return 0.56;
  if (name.includes('stone') || name.includes('wall_plaster')) return 0.16;
  if (name.includes('burgundy') || name.includes('leather') || name.includes('velvet') || name.includes('rug')) return 0.11;
  if (name.includes('walnut') || name.includes('wood') || name.includes('parquet')) return 0.26;
  return 0.23;
}

export function warRoomBlenderMaterialFinishProfile(materialName = '') {
  const name = String(materialName || '').toLowerCase();
  if (name.includes('canon_burgundy') || name.includes('burgundy')) {
    return Object.freeze({
      colorScale: [0.78, 0.56, 0.62],
      roughness: [0.84, 1],
      clearcoatMax: 0.02,
    });
  }
  if (name.includes('heraldic_brass')) {
    return Object.freeze({
      colorScale: [1.00, 0.96, 0.78],
      roughness: [0.22, 0.34],
      clearcoatMax: 0.26,
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
  if (name.includes('wall_plaster')) {
    return Object.freeze({
      colorScale: [0.96, 0.96, 1.00],
      roughness: [0.76, 0.96],
      clearcoatMax: 0.05,
    });
  }
  if (name.includes('stone')) {
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

export function warRoomBlenderRuntimeSurfaceKind(materialName = '') {
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

export function warRoomBlenderStoneSurfaceProfile({ coarsePointer = false } = {}) {
  return coarsePointer
    ? Object.freeze({ enabled: true, size: 24, bumpScale: 0, albedoCompensation: 1.10 })
    : Object.freeze({ enabled: true, size: 32, bumpScale: 0.012, albedoCompensation: 1.10 });
}

export function warRoomBlenderWoodSurfaceProfile({ coarsePointer = false } = {}) {
  return coarsePointer
    ? Object.freeze({ enabled: true, size: 32, bumpScale: 0, albedoCompensation: 1.055 })
    : Object.freeze({ enabled: true, size: 48, bumpScale: 0.007, albedoCompensation: 1.055 });
}

export function warRoomBlenderMetalSurfaceProfile({ coarsePointer = false } = {}) {
  return coarsePointer
    ? Object.freeze({ enabled: true, size: 24, bumpScale: 0, albedoCompensation: 1.02 })
    : Object.freeze({ enabled: true, size: 48, bumpScale: 0.0045, albedoCompensation: 1.025 });
}

export function warRoomBlenderFabricSurfaceProfile({ coarsePointer = false } = {}) {
  return coarsePointer
    ? Object.freeze({ enabled: true, size: 24, bumpScale: 0, albedoCompensation: 1.035 })
    : Object.freeze({ enabled: true, size: 48, bumpScale: 0.006, albedoCompensation: 1.04 });
}

export function warRoomBlenderLeatherSurfaceProfile({ coarsePointer = false } = {}) {
  return coarsePointer
    ? Object.freeze({ enabled: true, size: 24, bumpScale: 0, albedoCompensation: 1.025 })
    : Object.freeze({ enabled: true, size: 48, bumpScale: 0.0075, albedoCompensation: 1.03 });
}

function nextSurfaceNoise(state) {
  const next = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return [next, ((next >>> 8) & 0xffff) / 0xffff];
}

function createWarRoomBlenderStoneTexture({ mode = 'albedo', size = 32 } = {}) {
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
  texture.name = `war-room-blender-stone-${mode}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(mode === 'albedo' ? 0.86 : 1.8, mode === 'albedo' ? 0.78 : 1.6);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = mode === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createWarRoomBlenderFabricTexture({ mode = 'albedo', size = 48 } = {}) {
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
  texture.name = `war-room-blender-fabric-${mode}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(mode === 'albedo' ? 4.2 : 5.6, mode === 'albedo' ? 4.8 : 6.4);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = mode === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createWarRoomBlenderLeatherTexture({ mode = 'albedo', size = 48 } = {}) {
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
  texture.name = `war-room-blender-leather-${mode}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(mode === 'albedo' ? 2.8 : 4.2, mode === 'albedo' ? 2.8 : 4.2);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = mode === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createWarRoomBlenderMetalTexture({ mode = 'albedo', size = 48 } = {}) {
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
  texture.name = `war-room-blender-metal-${mode}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(mode === 'albedo' ? 1.25 : 1.8, mode === 'albedo' ? 5.4 : 7.2);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = mode === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createWarRoomBlenderWoodTexture({ mode = 'albedo', size = 48 } = {}) {
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
  texture.name = `war-room-blender-wood-${mode}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(mode === 'albedo' ? 2.4 : 3.2, mode === 'albedo' ? 0.82 : 1.1);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = mode === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function installRuntimeWoodSurface(material, sharedTextures, { coarsePointer = false } = {}) {
  if (warRoomBlenderRuntimeSurfaceKind(material?.name) !== 'wood') return false;
  const profile = warRoomBlenderWoodSurfaceProfile({ coarsePointer });
  if (!profile.enabled) return false;

  sharedTextures.albedo ||= createWarRoomBlenderWoodTexture({ mode: 'albedo', size: profile.size });

  if (!material.map) {
    material.map = sharedTextures.albedo;
    material.color.multiplyScalar(profile.albedoCompensation);
  }
  if (profile.bumpScale > 0) {
    sharedTextures.micro ||= createWarRoomBlenderWoodTexture({ mode: 'micro', size: profile.size });
    if (!material.roughnessMap) material.roughnessMap = sharedTextures.micro;
    if (!material.bumpMap) material.bumpMap = sharedTextures.micro;
  }
  material.bumpScale = profile.bumpScale;
  material.userData ||= {};
  material.userData.warRoomBlenderRuntimeSurface = 'walnut-grain-v1';
  material.needsUpdate = true;
  return true;
}

export function installRuntimeFabricSurface(material, sharedTextures, { coarsePointer = false } = {}) {
  if (warRoomBlenderRuntimeSurfaceKind(material?.name) !== 'fabric') return false;
  const profile = warRoomBlenderFabricSurfaceProfile({ coarsePointer });
  if (!profile.enabled) return false;

  sharedTextures.albedo ||= createWarRoomBlenderFabricTexture({ mode: 'albedo', size: profile.size });
  if (!material.map) {
    material.map = sharedTextures.albedo;
    material.color.multiplyScalar(profile.albedoCompensation);
  }
  if (profile.bumpScale > 0) {
    sharedTextures.micro ||= createWarRoomBlenderFabricTexture({ mode: 'micro', size: profile.size });
    if (!material.roughnessMap) material.roughnessMap = sharedTextures.micro;
    if (!material.bumpMap) material.bumpMap = sharedTextures.micro;
  }
  material.bumpScale = profile.bumpScale;
  material.userData ||= {};
  material.userData.warRoomBlenderRuntimeSurface = 'woven-fabric-v1';
  material.needsUpdate = true;
  return true;
}

export function installRuntimeLeatherSurface(material, sharedTextures, { coarsePointer = false } = {}) {
  if (warRoomBlenderRuntimeSurfaceKind(material?.name) !== 'leather') return false;
  const profile = warRoomBlenderLeatherSurfaceProfile({ coarsePointer });
  if (!profile.enabled) return false;

  sharedTextures.albedo ||= createWarRoomBlenderLeatherTexture({ mode: 'albedo', size: profile.size });
  if (!material.map) {
    material.map = sharedTextures.albedo;
    material.color.multiplyScalar(profile.albedoCompensation);
  }
  if (profile.bumpScale > 0) {
    sharedTextures.micro ||= createWarRoomBlenderLeatherTexture({ mode: 'micro', size: profile.size });
    if (!material.roughnessMap) material.roughnessMap = sharedTextures.micro;
    if (!material.bumpMap) material.bumpMap = sharedTextures.micro;
  }
  material.bumpScale = profile.bumpScale;
  material.userData ||= {};
  material.userData.warRoomBlenderRuntimeSurface = 'aged-leather-v1';
  material.needsUpdate = true;
  return true;
}

export function installRuntimeMetalSurface(material, sharedTextures, { coarsePointer = false } = {}) {
  if (warRoomBlenderRuntimeSurfaceKind(material?.name) !== 'metal') return false;
  const profile = warRoomBlenderMetalSurfaceProfile({ coarsePointer });
  if (!profile.enabled) return false;

  sharedTextures.albedo ||= createWarRoomBlenderMetalTexture({ mode: 'albedo', size: profile.size });

  if (!material.map) {
    material.map = sharedTextures.albedo;
    material.color.multiplyScalar(profile.albedoCompensation);
  }
  if (profile.bumpScale > 0) {
    sharedTextures.micro ||= createWarRoomBlenderMetalTexture({ mode: 'micro', size: profile.size });
    if (!material.roughnessMap) material.roughnessMap = sharedTextures.micro;
    if (!material.bumpMap) material.bumpMap = sharedTextures.micro;
  }
  material.bumpScale = profile.bumpScale;
  material.userData ||= {};
  material.userData.warRoomBlenderRuntimeSurface = 'brushed-metal-v1';
  material.needsUpdate = true;
  return true;
}

export function installRuntimeStoneSurface(material, sharedTextures, { coarsePointer = false } = {}) {
  if (warRoomBlenderRuntimeSurfaceKind(material?.name) !== 'stone') return false;
  const profile = warRoomBlenderStoneSurfaceProfile({ coarsePointer });
  if (!profile.enabled) return false;

  sharedTextures.albedo ||= createWarRoomBlenderStoneTexture({ mode: 'albedo', size: profile.size });

  if (!material.map) {
    material.map = sharedTextures.albedo;
    // The albedo map is intentionally darker than white so broad mineral
    // mottling survives ACES/8-bit output. Compensate its average loss here so
    // the authored Blender value stays the visual baseline instead of the whole
    // room simply becoming darker.
    material.color.multiplyScalar(profile.albedoCompensation);
  }
  if (profile.bumpScale > 0) {
    sharedTextures.micro ||= createWarRoomBlenderStoneTexture({ mode: 'micro', size: profile.size });
    if (!material.roughnessMap) material.roughnessMap = sharedTextures.micro;
    if (!material.bumpMap) material.bumpMap = sharedTextures.micro;
  }
  material.bumpScale = profile.bumpScale;
  material.userData ||= {};
  material.userData.warRoomBlenderRuntimeSurface = 'stone-meso-v2';
  material.needsUpdate = true;
  return true;
}

export function tuneRuntimeMaterial(material) {
  if (!material?.isMeshStandardMaterial) return;
  material.envMapIntensity = warRoomBlenderEnvMapIntensity(material.name);
  const finish = warRoomBlenderMaterialFinishProfile(material.name);
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
  material.userData.warRoomBlenderFinish = 'cinematic-gothic-v3';
  material.needsUpdate = true;
}

