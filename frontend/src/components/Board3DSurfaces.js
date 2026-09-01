import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './Board3DSurfaces.css';

export const PREMIUM_SURFACE_VERSION = 'premium-v6';

const SURFACE_ROLES_TO_PRESERVE = new Set([
  'ivory',
  'ebony',
  'metal-inlay',
  'board-light',
  'board-dark',
]);

const KNOWN_WOOD_COLORS = new Set([
  0x3a2114, 0x160c08, 0x5a321c, 0x482217, 0x25140d,
  0x2a160d, 0x130b07, 0x34251f, 0x302016, 0x100b08,
]);
const KNOWN_BURGUNDY_COLORS = new Set([0x5b2028, 0x2e1015, 0x5d2926]);

export function getCameraFramingProfile(aspect) {
  const safeAspect = Math.max(0.35, Number(aspect) || 1);
  const wide = safeAspect >= 1.42;
  return wide
    ? {
        // El tablero sigue siendo protagonista, pero dejamos respirar la sala:
        // crest, cortinas, estanterías y decoración deben entrar completos.
        halfSpan: 5.38,
        padding: 1.07,
        minDistance: 13.2,
        maxDistance: 22.6,
        targetY: 1.08,
        targetZ: -0.16,
        cameraY: 7.35,
        cameraZ: 10.6,
      }
    : {
        halfSpan: 5.78,
        padding: 1.13,
        minDistance: 14.5,
        maxDistance: 25.6,
        targetY: 0.92,
        targetZ: -0.08,
        cameraY: 8.2,
        cameraZ: 10.72,
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
  const ivory = side === 'w' && !accent;
  const micro = accent || coarsePointer
    ? null
    : createMicroSurfaceMap({
        seed: materialSeed(color, side, accent),
        kind: side === 'w' ? 'ivory' : 'piece',
        coarsePointer,
      });
  const surfaceColor = new THREE.Color(color);
  // Marfil mate y envejecido. La referencia visual pide beige real, no blanco
  // porcelana: bajamos luminancia y hacemos que el volumen venga de sombras.
  if (ivory) surfaceColor.lerp(new THREE.Color(0x927858), 0.62);
  const ivoryRoughness = Math.min(0.98, Math.max(0.78, baseRoughness * (micro ? 1.68 : 1.48)));

  const material = new THREE.MeshPhysicalMaterial({
    color: surfaceColor,
    metalness: ivory ? Math.min(baseMetalness, 0.006) : baseMetalness,
    roughness: ivory ? ivoryRoughness : (micro ? Math.min(0.92, baseRoughness * 1.18) : baseRoughness),
    roughnessMap: micro,
    bumpMap: micro,
    bumpScale: micro ? (side === 'w' ? 0.006 : 0.009) : 0,
    emissive: skin.emissive,
    emissiveIntensity: accent ? skin.emissiveIntensity * 1.25 : skin.emissiveIntensity,
    clearcoat: accent ? 0.9 : ivory ? 0.08 : 0.74,
    clearcoatRoughness: accent ? 0.08 : ivory ? 0.66 : 0.13,
    sheen: accent ? 0.2 : ivory ? 0.008 : 0.14,
    sheenRoughness: ivory ? 0.82 : 0.32,
    ior: ivory ? 1.38 : 1.58,
    specularIntensity: accent ? 1 : ivory ? 0.12 : 0.86,
    specularColor: ivory ? new THREE.Color(0xa58b66) : new THREE.Color(0xa5b0bb),
    envMapIntensity: accent ? 1.2 : ivory ? 0.13 : 0.94,
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
    // Madera oscura como el mueble de la referencia: veta legible, reflejo
    // ancho y débil, sin el brillo de barniz que estaba encendiendo cajones.
    wood: { metalness: 0.015, roughness: 0.68, clearcoat: 0.12, clearcoatRoughness: 0.38, sheen: 0.025, bump: 0.012, env: 0.38, specular: 0.32 },
    leather: { metalness: 0.01, roughness: 0.62, clearcoat: 0.18, clearcoatRoughness: 0.32, sheen: 0.28, bump: 0.018, env: 0.52, specular: 0.5 },
    fabric: { metalness: 0, roughness: 0.88, clearcoat: 0.02, clearcoatRoughness: 0.7, sheen: 0.55, bump: 0.01, env: 0.32, specular: 0.32 },
    metal: { metalness: 0.88, roughness: 0.29, clearcoat: 0.42, clearcoatRoughness: 0.13, sheen: 0.04, bump: 0.003, env: 0.9, specular: 0.88 },
  }[kind] || { metalness: 0.05, roughness: 0.62, clearcoat: 0.16, clearcoatRoughness: 0.28, sheen: 0.06, bump: 0.008, env: 0.52, specular: 0.5 };

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

function classifyDecorSurface(material) {
  if (!material?.isMeshPhysicalMaterial || !material.color) return null;
  const existingRole = material.userData?.surfaceRole;
  if (SURFACE_ROLES_TO_PRESERVE.has(existingRole) || String(existingRole || '').startsWith('decor-')) return null;

  if ((material.metalness ?? 0) >= 0.55) return 'metal';

  const hex = material.color.getHex();
  if (KNOWN_BURGUNDY_COLORS.has(hex)) {
    return (material.roughness ?? 0.5) >= 0.76 ? 'fabric' : 'leather';
  }
  if (KNOWN_WOOD_COLORS.has(hex)) return 'wood';

  const hsl = {};
  material.color.getHSL(hsl);
  if ((material.metalness ?? 0) < 0.25 && hsl.h >= 0.015 && hsl.h <= 0.13 && hsl.s >= 0.18 && hsl.l <= 0.38) {
    return 'wood';
  }
  return null;
}

function tuneExistingDecorMaterial(material, kind, coarsePointer, seed) {
  const micro = coarsePointer ? null : createMicroSurfaceMap({ seed, kind, coarsePointer });
  if (kind === 'wood') {
    material.color.multiplyScalar(0.78);
    material.metalness = Math.min(material.metalness ?? 0.03, 0.035);
    material.roughness = THREE.MathUtils.clamp((material.roughness ?? 0.5) * 1.18, 0.62, 0.82);
    material.clearcoat = Math.min(material.clearcoat ?? 0.3, 0.16);
    material.clearcoatRoughness = Math.max(material.clearcoatRoughness ?? 0.2, 0.38);
    material.envMapIntensity = Math.min(material.envMapIntensity ?? 1, 0.38);
    material.specularIntensity = Math.min(material.specularIntensity ?? 1, 0.34);
  } else if (kind === 'leather') {
    material.metalness = Math.min(material.metalness ?? 0.01, 0.04);
    material.roughness = THREE.MathUtils.clamp(material.roughness ?? 0.6, 0.58, 0.76);
    material.clearcoat = Math.min(material.clearcoat ?? 0.2, 0.2);
    material.clearcoatRoughness = Math.max(material.clearcoatRoughness ?? 0.3, 0.34);
    material.sheen = Math.max(material.sheen ?? 0, 0.22);
    material.envMapIntensity = Math.min(material.envMapIntensity ?? 1, 0.5);
  } else if (kind === 'fabric') {
    material.metalness = 0;
    material.roughness = Math.max(material.roughness ?? 0.85, 0.86);
    material.clearcoat = Math.min(material.clearcoat ?? 0.02, 0.03);
    material.sheen = Math.max(material.sheen ?? 0, 0.45);
    material.sheenRoughness = Math.max(material.sheenRoughness ?? 0.7, 0.74);
    material.envMapIntensity = Math.min(material.envMapIntensity ?? 1, 0.34);
  } else if (kind === 'metal') {
    material.metalness = Math.max(material.metalness ?? 0.8, 0.78);
    material.roughness = THREE.MathUtils.clamp(material.roughness ?? 0.26, 0.22, 0.38);
    material.clearcoat = Math.max(material.clearcoat ?? 0.3, 0.32);
    material.envMapIntensity = Math.min(Math.max(material.envMapIntensity ?? 0.82, 0.78), 0.92);
  }

  if (micro && !material.roughnessMap && !material.bumpMap) {
    material.roughnessMap = micro;
    material.bumpMap = micro;
    material.bumpScale = { wood: 0.011, leather: 0.016, fabric: 0.009, metal: 0.0025 }[kind] ?? 0.008;
  }
  material.userData.surfaceVersion = PREMIUM_SURFACE_VERSION;
  material.userData.surfaceRole = `decor-${kind}`;
  material.needsUpdate = true;
}

export function applyPremiumDecorSurfacePass(root, { coarsePointer = false } = {}) {
  const seen = new Set();
  const stats = { wood: 0, leather: 0, fabric: 0, metal: 0, total: 0 };
  let index = 0;

  root?.traverse?.((object) => {
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material || seen.has(material)) continue;
      seen.add(material);
      const kind = classifyDecorSurface(material);
      if (!kind) continue;
      const hex = material.color?.getHex?.() ?? 0;
      const seed = (hex ^ Math.imul(index + 1, 2654435761)) >>> 0;
      tuneExistingDecorMaterial(material, kind, coarsePointer, seed);
      stats[kind] += 1;
      stats.total += 1;
      index += 1;
    }
  });

  if (root?.userData) {
    root.userData.premiumDecorSurfacePass = PREMIUM_SURFACE_VERSION;
    root.userData.premiumDecorSurfaceStats = stats;
  }
  return stats;
}

function disposeEnvironmentScene(scene) {
  scene?.traverse?.((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose?.();
  });
}

export function installPremiumEnvironment(renderer, scene, { coarsePointer = false } = {}) {
  if (!renderer || !scene) return () => {};
  let cancelled = false;
  const runDecorPass = () => {
    if (!cancelled) applyPremiumDecorSurfacePass(scene, { coarsePointer });
  };
  if (typeof queueMicrotask === 'function') queueMicrotask(runDecorPass);
  else Promise.resolve().then(runDecorPass);

  if (coarsePointer) {
    return () => { cancelled = true; };
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, 0.035);
  scene.environment = target.texture;
  scene.environmentIntensity = 0.46;
  scene.userData.premiumIbl = true;
  pmrem.dispose();

  return () => {
    cancelled = true;
    if (scene.environment === target.texture) scene.environment = null;
    target.dispose();
    disposeEnvironmentScene(room);
  };
}
