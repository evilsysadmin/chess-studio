import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './Board3DSurfaces.css';

export const PREMIUM_SURFACE_VERSION = 'premium-v2';

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

export function createMicroSurfaceMap({ seed = 1, kind = 'piece', coarsePointer = false } = {}) {
  const size = coarsePointer ? 16 : 32;
  const data = new Uint8Array(size * size * 4);
  let state = (Number(seed) || 1) >>> 0;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let noise;
      [state, noise] = nextNoise(state);
      const directional = kind === 'wood'
        ? Math.sin((x / size) * Math.PI * 10 + Math.sin(y * 0.42) * 0.8) * 13
        : Math.sin((x + y * 0.7) * 0.9) * 4;
      const pores = kind === 'ivory'
        ? Math.sin(x * 1.7 + y * 2.1) * 3
        : Math.sin(x * 0.65 - y * 0.8) * 5;
      const value = THREE.MathUtils.clamp(Math.round(205 + (noise - 0.5) * 34 + directional + pores), 148, 246);
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
  texture.repeat.set(kind === 'wood' ? 2.4 : 3.2, kind === 'wood' ? 4.6 : 3.6);
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
