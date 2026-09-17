import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import combatHeraldryPayload from '../assets/home3d/combat-heraldry-v1.glb.gz.b64?raw';
import { loadHomeCastleR2Scene } from './HomeCastle3DR2Asset.js';

export const HOME_CASTLE_COMBAT_ASSET_ID = 'blender-glb:combat-heraldry-v1';
export const HOME_CASTLE_COMBAT_R2_LOGICAL_ID = 'home.combat.heraldry.runtime';

const COMBAT_MESH_ROLES = Object.freeze([
  Object.freeze({ source: 'combat_mount', target: 'home-castle-combat-mount' }),
  Object.freeze({ source: 'combat_left_blade', target: 'home-castle-combat-left-blade' }),
  Object.freeze({ source: 'combat_left_guard', target: 'home-castle-combat-left-guard' }),
  Object.freeze({ source: 'combat_left_grip', target: 'home-castle-combat-left-grip' }),
  Object.freeze({ source: 'combat_right_blade', target: 'home-castle-combat-right-blade' }),
  Object.freeze({ source: 'combat_right_guard', target: 'home-castle-combat-right-guard' }),
  Object.freeze({ source: 'combat_right_grip', target: 'home-castle-combat-right-grip' }),
  Object.freeze({ source: 'combat_shield', target: 'home-castle-combat-shield' }),
  Object.freeze({ source: 'combat_boss', target: 'home-castle-combat-boss' }),
]);

function namedMeshes(root) {
  const meshes = new Map();
  root?.traverse?.((node) => {
    if (node?.isMesh && node.name) meshes.set(node.name, node);
  });
  return meshes;
}

export function decodeHomeCastleCombatGlbPayload(payload, decode = globalThis.atob) {
  if (typeof decode !== 'function') throw new Error('Base64 decoder unavailable');
  const binary = decode(String(payload || '').trim());
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function gunzipCombatPayload(bytes) {
  if (typeof globalThis.DecompressionStream !== 'function') {
    throw new Error('gzip decompression unavailable');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export function applyHomeCastleCombatAsset(targetGroup, sourceRoot) {
  const targets = namedMeshes(targetGroup);
  const sources = namedMeshes(sourceRoot);
  const resolved = COMBAT_MESH_ROLES.map(({ source, target }) => ({
    source: sources.get(source),
    target: targets.get(target),
  }));

  if (resolved.some(({ source, target }) => !source?.geometry || !target?.geometry)) {
    return false;
  }

  for (const { source, target } of resolved) {
    // Combat already owns a nested transform hierarchy for the crossed swords.
    // Keep those transforms and runtime materials; authored GLB owns silhouette.
    target.geometry.copy(source.geometry);
    if (!target.geometry.getAttribute('normal')) {
      target.geometry.computeVertexNormals();
    }
  }

  targetGroup.userData ||= {};
  targetGroup.userData.homeCastleAsset = HOME_CASTLE_COMBAT_ASSET_ID;
  return true;
}

export function disposeHomeCastleCombatAssetScene(root) {
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

function parseGlbScene(buffer, loader) {
  return new Promise((resolve, reject) => {
    loader.parse(buffer, '', (gltf) => {
      if (!gltf?.scene) {
        reject(new Error('Home Combat GLB has no scene'));
        return;
      }
      gltf.scene.updateMatrixWorld(true);
      resolve(gltf.scene);
    }, reject);
  });
}

export async function hydrateHomeCastleCombatHeraldry(
  targetGroup,
  {
    loader = new GLTFLoader(),
    payload = combatHeraldryPayload,
    decode = globalThis.atob,
    decompress = gunzipCombatPayload,
    assetUrl,
  } = {},
) {
  const remoteRoot = await loadHomeCastleR2Scene({
    logicalId: HOME_CASTLE_COMBAT_R2_LOGICAL_ID,
    loader,
    assetUrl,
  });
  if (remoteRoot) {
    try {
      if (applyHomeCastleCombatAsset(targetGroup, remoteRoot)) return true;
    } finally {
      disposeHomeCastleCombatAssetScene(remoteRoot);
    }
  }

  const compressed = decodeHomeCastleCombatGlbPayload(payload, decode);
  const buffer = await decompress(compressed);
  const sourceRoot = await parseGlbScene(buffer, loader);

  try {
    return applyHomeCastleCombatAsset(targetGroup, sourceRoot);
  } finally {
    disposeHomeCastleCombatAssetScene(sourceRoot);
  }
}
