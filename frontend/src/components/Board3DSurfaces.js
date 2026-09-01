import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const PREMIUM_SURFACE_VERSION = 'premium-v3';

export function getCameraFramingProfile(aspect) {
  const safeAspect = Math.max(0.35, Number(aspect) || 1);
  const wide = safeAspect >= 1.42;
  return wide
    ? {
        halfSpan: 4.72,
        padding: 1.035,
        minDistance: 12.1,
        maxDistance: 21,
        targetY: 0.34,
        targetZ: 0.28,
        cameraY: 7.05,
        cameraZ: 10.15,
      }
    : {
        halfSpan: 5.2,
        padding: 1.12,
        minDistance: 13.4,
        maxDistance: 24,
        targetY: 0.48,
        targetZ: 0.34,
        cameraY: 8.1,
        cameraZ: 10.2,
      };
}

function nextNoise(state) {
  const next = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return [next, ((next >>> 8) & 0xffff) / 0xffff];
}

function surfaceWave(kind, x, y, size) {
  if (kind === 'wood') {
    return Math.sin((x / size) * Math.PI * 10 + Math.sin(y * 0.42) * 0.8) * 13
      + Math.sin((x / size) * Math.PI * 22 + y * 0.17) * 4;
  }
  if (kind === 'leather') {
    return Math.sin(x * 1.35 + y * 0.83) * 5
      + Math.sin(x * 2.8 - y * 1.9) * 2.5;
  }
  if (kind === 'brass') {
    return Math.sin(y * 3.6) * 2.2
      + Math.sin(y * 7.8 + x * 0.13) * 1.2;
  }
  if (kind === 'fabric') {
    return Math.sin(x * Math.PI * 0.7) * 4.2
      + Math.sin(y * Math.PI * 0.7) * 4.2;
  }
  if (kind === 'lacquer') {
    return Math.sin((x + y) * 0.72) * 2.2;
  }
  return Math.sin((x + y * 0.7) * 0.9) * 4;
}

function surfacePores(kind, x, y) {
  if (kind === 'ivory') return Math.sin(x * 1.7 + y * 2.1) * 3;
  if (kind === 'leather') return Math.sin(x * 3.4) * Math.cos(y * 2.9) * 4.4;
  if (kind === 'fabric') return Math.sin((x - y) * 2.1) * 2.8;
  if (kind === 'brass') return Math.sin(x * 0.18 + y * 5.8) * 1.6;
  return Math.sin(x * 0.65 - y * 0.8) * 5;
}

function textureRepeat(kind) {
  if (kind === 'wood') return [2.4, 4.6];
  if (kind === 'leather') return [5.6, 5.6];
  if (kind === 'brass') return [3.4, 8.2];
  if (kind === 'fabric') return [6.4, 6.4];
  if (kind === 'lacquer') return [4.2, 4.2];
  return [3.2, 3.6];
}

export function createMicroSurfaceMap({ seed = 1, kind = 'piece', coarsePointer = false } = {}) {
  const size = coarsePointer ? 16 : 32;
  const data = new Uint8Array(size * size * 4);
  let state = (Number(seed) || 1) >>> 0;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let noise;
      [state, noise] = nextNoise(state);
      const directional = surfaceWave(kind, x, y, size);
      const pores = surfacePores(kind, x, y);
      const noiseAmplitude = kind === 'brass' || kind === 'lacquer' ? 18 : 34;
      const value = THREE.MathUtils.clamp(
        Math.round(205 + (noise - 0.5) * noiseAmplitude + directional + pores),
        148,
        246,
      );
      const index = (y * size + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  const repeat = textureRepeat(kind);
  texture.repeat.set(...repeat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  texture.userData.surfaceKind = kind;
  return texture;
}

function materialSeed(color, side, accent) {
  const value = typeof color === 'number' ? color : new THREE.Color(color).getHex();
  return (value ^ (side === 'w' ? 0x5a17 : 0xa31d) ^ (accent ? 0x79b9 : 0x2d43)) >>> 0;
}

export function makePremiumPieceMaterial({ color, skin, side = 'w', accent = false, coarsePointer = false }) {
  const baseMetalness = Math.min(1, skin.metalness + (accent ? 0.2 : 0));
  const baseRoughness = Math.max(0.1, skin.roughness - (accent ? 0.15 : 0.04));
  const micro = accent || coarsePointer
    ? null
    : createMicroSurfaceMap({
        seed: materialSeed(color, side, accent),
        kind: side === 'w' ? 'ivory' : 'piece',
        coarsePointer,
      });

  const material = new THREE.MeshPhysicalMaterial({
    color,
    metalness: baseMetalness,
    roughness: micro ? Math.min(0.92, baseRoughness * 1.18) : baseRoughness,
    roughnessMap: micro,
    bumpMap: micro,
    bumpScale: micro ? (side === 'w' ? 0.006 : 0.009) : 0,
    emissive: skin.emissive,
    emissiveIntensity: accent ? skin.emissiveIntensity * 1.25 : skin.emissiveIntensity,
    clearcoat: accent ? 0.9 : side === 'w' ? 0.68 : 0.74,
    clearcoatRoughness: accent ? 0.08 : side === 'w' ? 0.16 : 0.13,
    sheen: accent ? 0.2 : side === 'w' ? 0.09 : 0.14,
    sheenRoughness: side === 'w' ? 0.42 : 0.32,
    ior: side === 'w' ? 1.48 : 1.58,
    specularIntensity: accent ? 1 : side === 'w' ? 0.74 : 0.86,
    specularColor: side === 'w' ? new THREE.Color(0xfff0cf) : new THREE.Color(0xa5b0bb),
    envMapIntensity: accent ? 1.2 : side === 'w' ? 0.82 : 0.94,
  });
  material.userData.surfaceVersion = PREMIUM_SURFACE_VERSION;
  material.userData.surfaceRole = accent ? 'metal-inlay' : side === 'w' ? 'ivory' : 'ebony';
  return material;
}

export function makePremiumTileMaterial({ color, light = false, coarsePointer = false, seed = 1 }) {
  const micro = coarsePointer ? null : createMicroSurfaceMap({ seed, kind: 'wood', coarsePointer });
  const material = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.015,
    roughness: micro ? (light ? 0.67 : 0.63) : (light ? 0.56 : 0.52),
    roughnessMap: micro,
    bumpMap: micro,
    bumpScale: micro ? (light ? 0.004 : 0.007) : 0,
    clearcoat: light ? 0.3 : 0.34,
    clearcoatRoughness: light ? 0.21 : 0.18,
    ior: 1.46,
    specularIntensity: light ? 0.56 : 0.64,
    envMapIntensity: 0.68,
  });
  material.userData.surfaceVersion = PREMIUM_SURFACE_VERSION;
  material.userData.surfaceRole = light ? 'board-light' : 'board-dark';
  return material;
}

const DECOR_PRESETS = Object.freeze({
  wood: {
    metalness: 0.035,
    roughness: 0.5,
    clearcoat: 0.56,
    clearcoatRoughness: 0.15,
    sheen: 0.08,
    sheenRoughness: 0.46,
    ior: 1.47,
    specularIntensity: 0.7,
    envMapIntensity: 0.86,
    bumpScale: 0.012,
  },
  leather: {
    metalness: 0.01,
    roughness: 0.61,
    clearcoat: 0.2,
    clearcoatRoughness: 0.28,
    sheen: 0.34,
    sheenRoughness: 0.72,
    ior: 1.45,
    specularIntensity: 0.48,
    envMapIntensity: 0.54,
    bumpScale: 0.018,
  },
  brass: {
    metalness: 0.9,
    roughness: 0.24,
    clearcoat: 0.72,
    clearcoatRoughness: 0.1,
    sheen: 0.06,
    sheenRoughness: 0.28,
    ior: 1.5,
    specularIntensity: 1,
    envMapIntensity: 1.28,
    bumpScale: 0.004,
  },
  fabric: {
    metalness: 0,
    roughness: 0.88,
    clearcoat: 0.025,
    clearcoatRoughness: 0.62,
    sheen: 0.5,
    sheenRoughness: 0.82,
    ior: 1.44,
    specularIntensity: 0.4,
    envMapIntensity: 0.46,
    bumpScale: 0.02,
  },
  lacquer: {
    metalness: 0.03,
    roughness: 0.32,
    clearcoat: 0.78,
    clearcoatRoughness: 0.09,
    sheen: 0.08,
    sheenRoughness: 0.28,
    ior: 1.52,
    specularIntensity: 0.88,
    envMapIntensity: 1.02,
    bumpScale: 0.004,
  },
});

export function makePremiumDecorMaterial({
  color,
  kind = 'wood',
  coarsePointer = false,
  seed = 1,
  emissive = 0x000000,
  emissiveIntensity = 0,
  opacity = 1,
  sheenColor = color,
  specularColor = 0xffffff,
  ...overrides
}) {
  const preset = DECOR_PRESETS[kind] || DECOR_PRESETS.wood;
  const micro = coarsePointer ? null : createMicroSurfaceMap({ seed, kind, coarsePointer });
  const values = { ...preset, ...overrides };
  const material = new THREE.MeshPhysicalMaterial({
    color,
    metalness: values.metalness,
    roughness: values.roughness,
    roughnessMap: micro,
    bumpMap: micro,
    bumpScale: micro ? values.bumpScale : 0,
    clearcoat: values.clearcoat,
    clearcoatRoughness: values.clearcoatRoughness,
    sheen: values.sheen,
    sheenRoughness: values.sheenRoughness,
    sheenColor: new THREE.Color(sheenColor),
    ior: values.ior,
    specularIntensity: values.specularIntensity,
    specularColor: new THREE.Color(specularColor),
    envMapIntensity: values.envMapIntensity,
    emissive,
    emissiveIntensity,
    transparent: opacity < 1,
    opacity,
  });
  material.userData.surfaceVersion = PREMIUM_SURFACE_VERSION;
  material.userData.surfaceRole = `decor-${kind}`;
  return material;
}

function disposeEnvironmentScene(scene) {
  scene?.traverse?.((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose?.();
  });
}

export function installPremiumEnvironment(renderer, scene, { coarsePointer = false } = {}) {
  if (coarsePointer || !renderer || !scene) return () => {};
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, 0.035);
  scene.environment = target.texture;
  scene.environmentIntensity = 0.78;
  scene.userData.premiumIbl = true;
  pmrem.dispose();

  return () => {
    if (scene.environment === target.texture) scene.environment = null;
    target.dispose();
    disposeEnvironmentScene(room);
  };
}
