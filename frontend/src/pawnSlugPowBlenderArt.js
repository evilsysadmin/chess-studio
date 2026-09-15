import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import powSquadPayload from './assets/pawnSlug/pow_squad_v2_glb_gzip.b64?raw';
import {
  PAWN_SLUG_POW_ART_META as FALLBACK_META,
  animatePawnSlugPowModel as animateFallbackPow,
  createPawnSlugPowModel as createFallbackPow,
  pawnSlugPowRescueRise,
} from './pawnSlugPowArt.js';

const POSES = Object.freeze(['bound', 'kneeling', 'caged']);
const POW_BLENDER_RUNTIME_SCALE = 0.78;
let templatePromise = null;

function decodeBase64(payload) {
  const decode = globalThis.atob;
  if (typeof decode !== 'function') throw new Error('Base64 decoder unavailable');
  const binary = decode(String(payload || '').trim());
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function payloadToArrayBuffer(payload) {
  if (typeof globalThis.DecompressionStream !== 'function') {
    throw new Error('gzip decompression unavailable');
  }
  const compressed = decodeBase64(payload);
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

function loadTemplate() {
  if (templatePromise) return templatePromise;
  templatePromise = payloadToArrayBuffer(powSquadPayload).then((buffer) => new Promise((resolve, reject) => {
    new GLTFLoader().parse(buffer, '', (gltf) => {
      const scene = gltf?.scene;
      if (!scene) {
        reject(new Error('Pawn Slug POW GLB has no scene'));
        return;
      }
      scene.updateMatrixWorld(true);
      resolve(scene);
    }, reject);
  }));
  return templatePromise;
}

function cloneMeshInWorld(node) {
  const material = Array.isArray(node.material)
    ? node.material.map((entry) => entry.clone())
    : node.material?.clone?.() || node.material;
  const clone = new THREE.Mesh(node.geometry?.clone?.() || node.geometry, material);
  clone.name = node.name;
  clone.matrix.copy(node.matrixWorld);
  clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
  clone.castShadow = true;
  clone.receiveShadow = true;
  return clone;
}

function splitPoseVisual(scene, pose) {
  const safePose = POSES.includes(pose) ? pose : 'bound';
  const body = new THREE.Group();
  const cage = new THREE.Group();
  const chains = new THREE.Group();
  body.name = 'pawn-slug-pow-blender-body';
  cage.name = 'pawn-slug-pow-blender-cage';
  chains.name = 'pawn-slug-pow-blender-chains';

  scene.updateMatrixWorld(true);
  scene.traverse((node) => {
    if (!node.isMesh || !String(node.name || '').startsWith(`${safePose}__`)) return;
    const clone = cloneMeshInWorld(node);
    if (node.name.includes('__cage__')) cage.add(clone);
    else if (node.name.includes('__chains__')) chains.add(clone);
    else body.add(clone);
  });

  if (!body.children.length) throw new Error(`Pawn Slug POW pose missing from GLB: ${safePose}`);
  const root = new THREE.Group();
  root.name = 'pawn-slug-pow-blender-visual';
  root.add(body, cage, chains);
  cage.visible = cage.children.length > 0;
  chains.visible = chains.children.length > 0;
  return { root, body, cage, chains };
}

function hideFallbackGeometry(root) {
  for (const name of ['pawn-slug-pow-body', 'pawn-slug-pow-cage', 'pawn-slug-pow-chains']) {
    const node = root.getObjectByName(name);
    if (node) node.visible = false;
  }
}

function installBlenderVisual(root, pose) {
  root.userData.pawnSlugArtSource = 'procedural-fallback-loading';
  loadTemplate()
    .then((template) => {
      const visual = splitPoseVisual(template, pose);
      visual.root.scale.setScalar(POW_BLENDER_RUNTIME_SCALE);
      hideFallbackGeometry(root);
      root.add(visual.root);
      root.userData.pawnSlugBlenderVisual = visual;
      root.userData.pawnSlugArtSource = 'blender-glb-v2';
    })
    .catch(() => {
      root.userData.pawnSlugArtSource = 'procedural-fallback';
    });
}

export function createPawnSlugPowModel(pow, options = {}) {
  const root = createFallbackPow(pow, options);
  installBlenderVisual(root, pow?.pose || 'bound');
  return root;
}

export function animatePawnSlugPowModel(model, time = 0, options = {}) {
  animateFallbackPow(model, time, options);
  const visual = model?.userData?.pawnSlugBlenderVisual;
  if (!visual) return;

  const rescued = Boolean(options.rescued);
  const reducedMotion = Boolean(options.reducedMotion);
  visual.cage.visible = !rescued && visual.cage.children.length > 0;
  visual.chains.visible = !rescued && visual.chains.children.length > 0;
  if (reducedMotion) return;

  const startedAt = model.userData.rescueVisualStartedAt;
  const rescueAge = rescued && Number.isFinite(startedAt)
    ? Math.max(0, Number(time) - startedAt)
    : Number.POSITIVE_INFINITY;
  if (rescued) {
    visual.body.position.y = pawnSlugPowRescueRise(rescueAge);
    visual.body.rotation.z *= 0.85;
  } else {
    visual.body.position.y = Math.max(0, Math.sin((Number(time) || 0) * 2.4 + model.id * 0.13) * 0.012);
  }
}

export { pawnSlugPowRescueRise };

export const PAWN_SLUG_POW_ART_META = Object.freeze({
  ...FALLBACK_META,
  style: 'blender-authored-premium-military-arcade-prisoner-v4',
  primaryArt: 'embedded-glb-gzip',
  sourceOfTruth: 'scripts/blender/build_pawn_slug_pows_v2.py',
  fallbackArt: FALLBACK_META.style,
  glbPoses: POSES,
  glbVersion: 'blender-glb-v2',
  runtimeScale: POW_BLENDER_RUNTIME_SCALE,
  runtimeUpgrade: 'async-fallback-first',
  payloadCompression: 'gzip',
  dynamicLights: 0,
});
