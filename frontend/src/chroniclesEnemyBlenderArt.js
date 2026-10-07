import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  chroniclesTacticsPartyIdleName,
  chroniclesTacticsPartyRootName,
  configureChroniclesTacticsPartyVisual,
} from './chroniclesOfMatthiasPartyBlenderArt.js';

export const CHRONICLES_ENEMY_AUTHORED_ART_VERSION = 'chronicles-enemy-authored-v1';
export const CHRONICLES_ENEMY_PARTY_MODEL_PATH = 'models/chronicles-tactics-party.glb';
export const CHRONICLES_ENEMY_MATTHIAS_MODEL_PATH = 'models/matthias-home-canonical.glb';

const PARTY_MODEL_URL = `${import.meta.env.BASE_URL}${CHRONICLES_ENEMY_PARTY_MODEL_PATH}`;
const MATTHIAS_MODEL_URL = `${import.meta.env.BASE_URL}${CHRONICLES_ENEMY_MATTHIAS_MODEL_PATH}`;

const SOURCE_BY_VISUAL = Object.freeze({
  'corrupted-pawn': Object.freeze({ asset: 'matthias', memberId: null, scale: 0.72, tint: 0x1d1717, tintStrength: 0.72 }),
  'gate-jailer': Object.freeze({ asset: 'party', memberId: 'rook', scale: 1.02, tint: 0x161a1d, tintStrength: 0.62 }),
  'spectral-bishop': Object.freeze({ asset: 'party', memberId: 'bishop', scale: 0.96, tint: 0x6f9c91, tintStrength: 0.5, spectral: true }),
  'scavenger-knight': Object.freeze({ asset: 'party', memberId: 'knight', scale: 0.98, tint: 0x33251f, tintStrength: 0.48 }),
});

let partyLoadPromise = null;
let matthiasLoadPromise = null;

function loadModel(url, cacheName) {
  const loader = new GLTFLoader();
  if (cacheName === 'party') {
    partyLoadPromise ||= loader.loadAsync(url).catch((error) => {
      partyLoadPromise = null;
      throw error;
    });
    return partyLoadPromise;
  }
  matthiasLoadPromise ||= loader.loadAsync(url).catch((error) => {
    matthiasLoadPromise = null;
    throw error;
  });
  return matthiasLoadPromise;
}

export function chroniclesEnemyAuthoredSource(visualType) {
  const source = SOURCE_BY_VISUAL[visualType];
  return source ? { ...source } : null;
}

function cloneMaterial(material) {
  if (!material) return material;
  if (Array.isArray(material)) return material.map(cloneMaterial);
  return material.clone();
}

function themeMaterial(material, visualType, spec) {
  const entries = Array.isArray(material) ? material : [material];
  const tint = new THREE.Color(spec.tint);
  entries.forEach((entry) => {
    if (!entry) return;
    if (entry.color?.isColor) entry.color.lerp(tint, spec.tintStrength);
    if ('roughness' in entry) entry.roughness = Math.min(0.92, Math.max(0.32, Number(entry.roughness) || 0.58));
    if ('metalness' in entry && visualType !== 'spectral-bishop') {
      entry.metalness = Math.max(0.18, Number(entry.metalness) || 0);
    }
    if (visualType === 'corrupted-pawn') {
      if (entry.emissive?.isColor) entry.emissive.lerp(new THREE.Color(0x71100c), 0.7);
      if ('emissiveIntensity' in entry) entry.emissiveIntensity = Math.max(0.12, Number(entry.emissiveIntensity) || 0);
    } else if (visualType === 'gate-jailer') {
      if (entry.emissive?.isColor) entry.emissive.lerp(new THREE.Color(0x4b160c), 0.4);
      if ('emissiveIntensity' in entry) entry.emissiveIntensity = Math.max(0.08, Number(entry.emissiveIntensity) || 0);
    } else if (visualType === 'spectral-bishop') {
      if (entry.emissive?.isColor) entry.emissive.lerp(new THREE.Color(0x39c9a4), 0.82);
      if ('emissiveIntensity' in entry) entry.emissiveIntensity = Math.max(0.55, Number(entry.emissiveIntensity) || 0);
      entry.transparent = true;
      entry.opacity = Math.min(0.82, Number(entry.opacity) || 1);
      entry.depthWrite = false;
    } else if (visualType === 'scavenger-knight') {
      if (entry.emissive?.isColor) entry.emissive.lerp(new THREE.Color(0x7a2715), 0.38);
      if ('emissiveIntensity' in entry) entry.emissiveIntensity = Math.max(0.08, Number(entry.emissiveIntensity) || 0);
    }
    entry.needsUpdate = true;
  });
}

function cloneAuthoredVisual(source, visualType, spec, { coarsePointer = false } = {}) {
  const visual = source.clone(true);
  visual.name = `chronicles-enemy-authored-${visualType}`;

  visual.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry = node.geometry?.clone?.() || node.geometry;
    node.material = cloneMaterial(node.material);
    themeMaterial(node.material, visualType, spec);
    node.castShadow = !coarsePointer;
    node.receiveShadow = true;
    node.frustumCulled = true;
  });

  if (spec.asset === 'party') {
    configureChroniclesTacticsPartyVisual(visual, { coarsePointer });
    visual.scale.multiplyScalar(spec.scale);
  } else {
    visual.position.set(0, 0, 0);
    visual.rotation.set(0, 0, 0);
    visual.scale.setScalar(spec.scale);
  }
  return visual;
}

function firstRenderable(root) {
  let first = null;
  root?.traverse?.((node) => {
    if (!first && node?.isMesh) first = node;
  });
  return first;
}

function disposeAuthoredVisual(root) {
  root?.traverse?.((node) => {
    if (!node.isMesh) return;
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => material?.dispose?.());
  });
}

function installIdleAnimation(visual, animations, clipName, { reducedMotion = false } = {}) {
  const clip = animations?.find((entry) => entry.name === clipName)
    || animations?.find((entry) => /idle/i.test(entry.name))
    || animations?.[0]
    || null;
  if (!clip) return () => {};

  const mixer = new THREE.AnimationMixer(visual);
  mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
  if (reducedMotion) {
    mixer.setTime(Math.max(0, clip.duration * 0.34));
    return () => mixer.stopAllAction();
  }

  const sentinel = firstRenderable(visual);
  if (!sentinel) return () => mixer.stopAllAction();
  const prior = sentinel.onBeforeRender;
  sentinel.onBeforeRender = (...args) => {
    prior?.apply(sentinel, args);
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    mixer.setTime(now % Math.max(0.01, clip.duration));
  };
  return () => {
    sentinel.onBeforeRender = prior || (() => {});
    mixer.stopAllAction();
  };
}

export function applyChroniclesEnemyAuthoredVisual(
  fallbackRoot,
  visualType,
  source,
  {
    animations = [],
    clipName = null,
    coarsePointer = false,
    reducedMotion = false,
  } = {},
) {
  const spec = chroniclesEnemyAuthoredSource(visualType);
  if (!fallbackRoot || !source || !spec) return () => {};

  const fallbackChildren = [...fallbackRoot.children];
  const visual = cloneAuthoredVisual(source, visualType, spec, { coarsePointer });
  fallbackChildren.forEach((child) => { child.visible = false; });
  fallbackRoot.add(visual);
  fallbackRoot.userData.chroniclesEnemyArtSource = CHRONICLES_ENEMY_AUTHORED_ART_VERSION;
  fallbackRoot.userData.chroniclesEnemyArtVisualType = visualType;

  const cancelIdle = installIdleAnimation(
    visual,
    animations,
    clipName || (spec.memberId ? chroniclesTacticsPartyIdleName(spec.memberId) : 'Idle'),
    { reducedMotion },
  );

  return () => {
    cancelIdle();
    visual.removeFromParent();
    disposeAuthoredVisual(visual);
    fallbackChildren.forEach((child) => { child.visible = true; });
    fallbackRoot.userData.chroniclesEnemyArtSource = 'procedural-fallback';
  };
}

export function installChroniclesEnemyAuthoredArt(
  fallbackRoot,
  visualType,
  { coarsePointer = false, reducedMotion = false } = {},
) {
  const spec = chroniclesEnemyAuthoredSource(visualType);
  if (!fallbackRoot || !spec) return () => {};

  let cancelled = false;
  let cancelVisual = null;
  fallbackRoot.userData.chroniclesEnemyArtSource = 'procedural-fallback-loading';

  const load = spec.asset === 'party'
    ? loadModel(PARTY_MODEL_URL, 'party')
    : loadModel(MATTHIAS_MODEL_URL, 'matthias');

  void load.then((gltf) => {
    if (cancelled || !gltf?.scene) return;
    const source = spec.asset === 'party'
      ? gltf.scene.getObjectByName(chroniclesTacticsPartyRootName(spec.memberId))
      : gltf.scene;
    if (!source) {
      fallbackRoot.userData.chroniclesEnemyArtSource = 'procedural-fallback';
      return;
    }
    cancelVisual = applyChroniclesEnemyAuthoredVisual(
      fallbackRoot,
      visualType,
      source,
      {
        animations: gltf.animations || [],
        coarsePointer,
        reducedMotion,
      },
    );
  }).catch(() => {
    if (!cancelled) fallbackRoot.userData.chroniclesEnemyArtSource = 'procedural-fallback';
  });

  return () => {
    cancelled = true;
    cancelVisual?.();
  };
}
