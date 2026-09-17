import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import playRookPayload from '../assets/home3d/play-rook-v1.glb.gz.b64?raw';

export const HOME_CASTLE_PLAY_ASSET_ID = 'blender-glb:play-rook-v1';

const PLAY_SOURCE_MESHES = Object.freeze([
  'play_base',
  'play_foot',
  'play_body',
  'play_collar',
  'play_crown',
  'play_merlon_0',
  'play_merlon_1',
  'play_merlon_2',
  'play_merlon_3',
]);

function directTargetMeshes(group) {
  return (group?.children || []).filter((child) => child?.isMesh);
}

function sourceMeshesByName(root) {
  const meshes = new Map();
  root?.traverse?.((node) => {
    if (node?.isMesh && node.name) meshes.set(node.name, node);
  });
  return meshes;
}

export function decodeHomeCastlePlayGlbPayload(payload, decode = globalThis.atob) {
  if (typeof decode !== 'function') throw new Error('Base64 decoder unavailable');
  const binary = decode(String(payload || '').trim());
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export function applyHomeCastlePlayAsset(targetGroup, sourceRoot) {
  const targets = directTargetMeshes(targetGroup);
  if (targets.length < PLAY_SOURCE_MESHES.length) return false;

  const sourcesByName = sourceMeshesByName(sourceRoot);
  const sources = PLAY_SOURCE_MESHES.map((name) => sourcesByName.get(name));
  if (sources.some((source) => !source?.geometry)) return false;

  for (let index = 0; index < PLAY_SOURCE_MESHES.length; index += 1) {
    const target = targets[index];
    const source = sources[index];

    // Keep the live transform hierarchy, materials and responsive scale driver.
    // The GLB only owns authored silhouette/topology.
    target.geometry.copy(source.geometry);
    if (!target.geometry.getAttribute('normal')) {
      target.geometry.computeVertexNormals();
    }
  }

  targetGroup.userData ||= {};
  targetGroup.userData.homeCastleAsset = HOME_CASTLE_PLAY_ASSET_ID;
  return true;
}

export function disposeHomeCastlePlayAssetScene(root) {
  const geometries = new Set();
  const materials = new Set();

  root?.traverse?.((node) => {
    if (node?.geometry) geometries.add(node.geometry);
    const nodeMaterials = Array.isArray(node?.material)
      ? node.material
      : [node?.material];
    for (const material of nodeMaterials) {
      if (material) materials.add(material);
    }
  });

  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
}

async function gunzipPlayPayload(bytes) {
  if (typeof globalThis.DecompressionStream !== 'function') {
    throw new Error('gzip decompression unavailable');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

function parseGlbScene(buffer, loader) {
  return new Promise((resolve, reject) => {
    loader.parse(buffer, '', (gltf) => {
      if (!gltf?.scene) {
        reject(new Error('Home Play GLB has no scene'));
        return;
      }
      gltf.scene.updateMatrixWorld(true);
      resolve(gltf.scene);
    }, reject);
  });
}

export async function hydrateHomeCastlePlayRook(
  targetGroup,
  {
    loader = new GLTFLoader(),
    payload = playRookPayload,
    decode = globalThis.atob,
    decompress = gunzipPlayPayload,
  } = {},
) {
  const compressed = decodeHomeCastlePlayGlbPayload(payload, decode);
  const buffer = await decompress(compressed);
  const sourceRoot = await parseGlbScene(buffer, loader);

  try {
    return applyHomeCastlePlayAsset(targetGroup, sourceRoot);
  } finally {
    disposeHomeCastlePlayAssetScene(sourceRoot);
  }
}
