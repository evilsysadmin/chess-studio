import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './Board3DSurfaces.css';

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

function surfaceSignal(kind, x, y, size, noise) {
  if (kind === 'wood') {
    const grain = Math.sin((x / size) * Math.PI * 12 + Math.sin(y * 0.34) * 1.05) * 15;
    const growth = Math.sin((x + y * 0.18) * 0.32) * 7;
    return grain + growth + (noise - 0.5) * 24;
  }
  if (kind === 'leather') {
    const pores = Math.sin(x * 1.8 + y * 1.3) * 4 + Math.cos(x * 0.9 - y * 1.6) * 5;
    const pebble = Math.abs(Math.sin((x + noise * 5) * 1.45) * Math.cos((y - noise * 3) * 1.22)) * 15;
    return pores + pebble + (noise - 0.5) * 30;
  }
  if (kind === 'fabric') {
    const warp = Math.sin(x * Math.PI * 0.92) * 8;
    const weft = Math.cos(y * Math.PI * 0.86) * 8;
    const diagonal = Math.sin((x + y) * 0.72) * 3;
    return warp + weft + diagonal + (noise - 0.5) * 15;
  }
  if (kind === 'metal') {
    const brushed = Math.sin(y * 2.6 + Math.sin(x * 0.18) * 0.6) * 5;
    return brushed + (noise - 0.5) * 18;
  }
  if (kind === 'ivory') {
    return Math.sin(x * 1.7 + y * 2.1) * 3 + Math.sin((x + y * 0.7) * 0.9) * 4 + (noise - 0.5) * 22;
  }
  return Math.sin((x + y * 0.7) * 0.9) * 4 + Math.sin(x * 0.65 - y * 0.8) * 5 + (noise - 0.5) * 28;
}

export function createMicroSurfaceMap({ seed = 1, kind = 'piece', coarsePointer = false } = {}) {
  const size = coarsePointer ? 16 : 32;
  const data = new Uint8Array(size * size * 4);
  let state = (Number(seed) || 1) >>> 0;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let noise;
      [state, noise] = nextNoise(state);
      const signal = surfaceSignal(kind, x, y, size, noise);
      const base = kind === 'metal' ? 220 : kind === 'fabric' ? 198 : 205;
      const value = THREE.MathUtils.clamp(Math.round(base + signal), 142, 248);
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
  const repeat = {
    wood: [2.2, 5.2],
    leather: [5.5, 5.5],
    fabric: [7.5, 7.5],
    metal: [2.2, 8.5],
    ivory: [3.2, 3.6],
    piece: [3.2, 3.6],
  }[kind] || [3.2, 3.6];
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
  const surfaceColor = new THREE.Color(color);
  if (side === 'w' && !accent) surfaceColor.lerp(new THREE.Color(0xcdbd9f), 0.14);
  const ivoryRoughness = Math.min(0.94, baseRoughness * (micro ? 1.3 : 1.12));

  const material = new THREE.MeshPhysicalMaterial({
    color: surfaceColor,
    metalness: baseMetalness,
    roughness: side === 'w' && !accent ? ivoryRoughness : (micro ? Math.min(0.92, baseRoughness * 1.18) : baseRoughness),
    roughnessMap: micro,
    bumpMap: micro,
    bumpScale: micro ? (side === 'w' ? 0.006 : 0.009) : 0,
    emissive: skin.emissive,
    emissiveIntensity: accent ? skin.emissiveIntensity * 1.25 : skin.emissiveIntensity,
    clearcoat: accent ? 0.9 : side === 'w' ? 0.52 : 0.74,
    clearcoatRoughness: accent ? 0.08 : side === 'w' ? 0.24 : 0.13,
    sheen: accent ? 0.2 : side === 'w' ? 0.07 : 0.14,
    sheenRoughness: side === 'w' ? 0.5 : 0.32,
    ior: side === 'w' ? 1.46 : 1.58,
    specularIntensity: accent ? 1 : side === 'w' ? 0.56 : 0.86,
    specularColor: side === 'w' ? new THREE.Color(0xf1d9b4) : new THREE.Color(0xa5b0bb),
    envMapIntensity: accent ? 1.2 : side === 'w' ? 0.62 : 0.94,
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

export function makePremiumDecorMaterial({
  color,
  kind = 'wood',
  coarsePointer = false,
  seed = 1,
  metalness,
  roughness,
  clearcoat,
  clearcoatRoughness,
  sheen,
  sheenRoughness,
  sheenColor,
  envMapIntensity,
  specularIntensity,
  emissive = 0x000000,
  emissiveIntensity = 0,
  opacity = 1,
} = {}) {
  const micro = coarsePointer ? null : createMicroSurfaceMap({ seed, kind, coarsePointer });
  const defaults = {
    wood: { metalness: 0.03, roughness: 0.48, clearcoat: 0.56, clearcoatRoughness: 0.16, sheen: 0.08, bump: 0.012, env: 0.8, specular: 0.7 },
    leather: { metalness: 0.01, roughness: 0.62, clearcoat: 0.18, clearcoatRoughness: 0.32, sheen: 0.28, bump: 0.018, env: 0.58, specular: 0.55 },
    fabric: { metalness: 0, roughness: 0.88, clearcoat: 0.02, clearcoatRoughness: 0.7, sheen: 0.55, bump: 0.01, env: 0.36, specular: 0.35 },
    metal: { metalness: 0.88, roughness: 0.27, clearcoat: 0.45, clearcoatRoughness: 0.12, sheen: 0.04, bump: 0.003, env: 1.05, specular: 0.96 },
  }[kind] || { metalness: 0.05, roughness: 0.58, clearcoat: 0.2, clearcoatRoughness: 0.2, sheen: 0.08, bump: 0.008, env: 0.7, specular: 0.7 };

  const material = new THREE.MeshPhysicalMaterial({
    color,
    metalness: metalness ?? defaults.metalness,
    roughness: roughness ?? defaults.roughness,
    roughnessMap: micro,
    bumpMap: micro,
    bumpScale: micro ? defaults.bump : 0,
    clearcoat: clearcoat ?? defaults.clearcoat,
    clearcoatRoughness: clearcoatRoughness ?? defaults.clearcoatRoughness,
    sheen: sheen ?? defaults.sheen,
    sheenRoughness: sheenRoughness ?? (kind === 'fabric' ? 0.78 : 0.48),
    sheenColor: new THREE.Color(sheenColor ?? color),
    ior: kind === 'metal' ? 1.8 : 1.48,
    specularIntensity: specularIntensity ?? defaults.specular,
    envMapIntensity: envMapIntensity ?? defaults.env,
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
  scene.environmentIntensity = 0.66;
  scene.userData.premiumIbl = true;
  pmrem.dispose();

  return () => {
    if (scene.environment === target.texture) scene.environment = null;
    target.dispose();
    disposeEnvironmentScene(room);
  };
}
