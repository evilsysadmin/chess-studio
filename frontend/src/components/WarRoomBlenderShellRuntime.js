import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
  installRuntimeFabricSurface,
  installRuntimeLeatherSurface,
  installRuntimeMetalSurface,
  installRuntimeStoneSurface,
  installRuntimeWoodSurface,
  tuneRuntimeMaterial,
  warRoomBlenderEnvMapIntensity,
  warRoomBlenderFabricSurfaceProfile,
  warRoomBlenderLeatherSurfaceProfile,
  warRoomBlenderMaterialFinishProfile,
  warRoomBlenderMetalSurfaceProfile,
  warRoomBlenderRuntimeSurfaceKind,
  warRoomBlenderStoneSurfaceProfile,
  warRoomBlenderWoodSurfaceProfile,
} from './WarRoomBlenderMaterials.js';

export {
  warRoomBlenderEnvMapIntensity,
  warRoomBlenderFabricSurfaceProfile,
  warRoomBlenderLeatherSurfaceProfile,
  warRoomBlenderMaterialFinishProfile,
  warRoomBlenderMetalSurfaceProfile,
  warRoomBlenderRuntimeSurfaceKind,
  warRoomBlenderStoneSurfaceProfile,
  warRoomBlenderWoodSurfaceProfile,
};


export const WAR_ROOM_BLENDER_BOARD_ANCHOR_Y = 1.12;

export function warRoomBlenderModelUrl({
  buildSha = import.meta.env.VITE_BUILD_SHA,
  baseUrl = '',
} = {}) {
  if (!baseUrl) throw new TypeError('War Room Blender shell requires a model URL');
  const version = String(buildSha || '').trim();
  if (!version) return baseUrl;
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}build=${encodeURIComponent(version)}`;
}

export function configureWarRoomBlenderLoader(loader) {
  if (!loader?.setMeshoptDecoder) throw new TypeError('War Room Blender loader requires Meshopt support');
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

export function scheduleWarRoomAfterFirstPaint(task, scheduler = {}) {
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

export function warRoomBlenderPracticalLightProfile({ coarsePointer = false } = {}) {
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

function installAuthoredPracticalLights(root, { coarsePointer = false } = {}) {
  const profile = warRoomBlenderPracticalLightProfile({ coarsePointer });
  const entries = [
    ['WR_ANCHOR_fireplace_practical', 'war-room-blender-fire-practical', profile.fire],
    ['WR_ANCHOR_right_fireplace_practical', 'war-room-blender-right-fire-practical', profile.rightFire],
    ['WR_ANCHOR_chandelier_practical', 'war-room-blender-chandelier-practical', profile.chandelier],
    ['WR_ANCHOR_window_moonlight', 'war-room-blender-moon-practical', profile.moon],
  ];

  let installed = 0;
  for (const [anchorName, lightName, spec] of entries) {
    if (!spec || spec.intensity <= 0) continue;
    const authoredAnchor = root.getObjectByName(anchorName);
    if (!authoredAnchor) continue;
    const practical = new THREE.PointLight(spec.color, spec.intensity, spec.distance, spec.decay);
    practical.name = lightName;
    practical.castShadow = false;
    practical.userData.warRoomBlenderPractical = anchorName;
    authoredAnchor.add(practical);
    installed += 1;
  }
  root.userData.warRoomBlenderPracticalLights = installed;
  return installed;
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

export function createWarRoomBlenderVariantShell({
  variant,
  runtimeModelUrl,
  rootName,
  runtimeFinish,
  boardAnchorY = WAR_ROOM_BLENDER_BOARD_ANCHOR_Y,
  installRuntimeEffects,
} = {}) {
  if (!variant || !runtimeModelUrl || !rootName || !runtimeFinish) {
    throw new TypeError('War Room Blender variant requires id, model URL, root name and finish');
  }

  const modelUrl = ({ buildSha = import.meta.env.VITE_BUILD_SHA, baseUrl = runtimeModelUrl } = {}) => (
    warRoomBlenderModelUrl({ buildSha, baseUrl })
  );

  const install = (scene, options = {}) => installWarRoomBlenderShell(scene, {
    ...options,
    url: options.url || modelUrl(),
    variant,
    rootName,
    runtimeFinish,
    boardAnchorY: options.boardAnchorY ?? boardAnchorY,
    installRuntimeEffects: options.installRuntimeEffects ?? installRuntimeEffects,
  });

  return Object.freeze({ modelUrl, install });
}

export async function installWarRoomBlenderShell(
  scene,
  {
    whiteSide = true,
    coarsePointer = false,
    url,
    onRefine,
    variant = 'blender',
    rootName = `war-room-${variant}-blender-shell`,
    runtimeFinish = 'gltf-pbr-runtime',
    boardAnchorY = WAR_ROOM_BLENDER_BOARD_ANCHOR_Y,
    installRuntimeEffects,
  } = {},
) {
  if (!scene?.add) throw new Error(`War Room ${variant} requires a Three.js scene`);
  if (!url) throw new Error(`War Room ${variant} requires a GLB URL`);
  const loader = configureWarRoomBlenderLoader(new GLTFLoader());
  const gltf = await loader.loadAsync(url);
  const root = gltf?.scene;
  if (!root) throw new Error(`War Room ${variant} GLB has no scene`);

  root.name = rootName;
  // Blender exports Z-up to glTF Y-up. Its preview board top is Y=1.12 after
  // conversion, while the live Three board uses Y=0 as its tactical datum.
  root.position.set(0, -boardAnchorY, 0);
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
  root.userData.warRoomVariant = variant;
  root.userData.warRoomRuntimeFinish = runtimeFinish;
  root.userData.warRoomBlenderPracticalLights = practicalLights;
  root.userData.warRoomBlenderRuntimeStoneMaterials = runtimeStoneMaterials;
  root.userData.warRoomBlenderRuntimeStoneTextures = Object.keys(runtimeStoneTextures).length;
  root.userData.warRoomBlenderRuntimeWoodMaterials = runtimeWoodMaterials;
  root.userData.warRoomBlenderRuntimeWoodTextures = Object.keys(runtimeWoodTextures).length;
  root.userData.warRoomBlenderRuntimeMetalMaterials = runtimeMetalMaterials;
  root.userData.warRoomBlenderRuntimeMetalTextures = Object.keys(runtimeMetalTextures).length;
  root.userData.warRoomBlenderRuntimeFabricMaterials = runtimeFabricMaterials;
  root.userData.warRoomBlenderRuntimeFabricTextures = Object.keys(runtimeFabricTextures).length;
  root.userData.warRoomBlenderRuntimeLeatherMaterials = runtimeLeatherMaterials;
  root.userData.warRoomBlenderRuntimeLeatherTextures = Object.keys(runtimeLeatherTextures).length;
  root.userData.warRoomBlenderShadowWarmup = coarsePointer ? 'disabled-lite' : 'deferred-after-first-paint';
  root.userData.warRoomBlenderShadowCasterCount = 0;
  const disposeRuntimeEffects = installRuntimeEffects?.(root, { coarsePointer }) || (() => {});
  scene.add(root);

  const cancelShadowWarmup = coarsePointer ? () => {} : scheduleWarRoomAfterFirstPaint(() => {
    if (!root.parent) return;
    deferredShadowMeshes.forEach((node) => { node.castShadow = true; });
    root.userData.warRoomBlenderShadowWarmup = 'ready';
    root.userData.warRoomBlenderShadowCasterCount = deferredShadowMeshes.length;
    onRefine?.();
  });

  return () => {
    cancelShadowWarmup();
    disposeRuntimeEffects();
    root.removeFromParent();
    disposeShell(root);
  };
}
