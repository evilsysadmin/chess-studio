import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import tournamentCupPayload from '../assets/home3d/tournament-cup-v1.glb.b64?raw';

export const HOME_CASTLE_TOURNAMENT_ASSET_ID = 'blender-glb:tournament-cup-v1';

const TOURNAMENT_SOURCE_MESHES = Object.freeze([
  'cup_base',
  'cup_plinth',
  'cup_stem',
  'cup_bowl',
  'cup_rim',
  'cup_handle_left',
  'cup_handle_right',
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

export function decodeHomeCastleGlbPayload(payload, decode = globalThis.atob) {
  if (typeof decode !== 'function') throw new Error('Base64 decoder unavailable');
  const binary = decode(String(payload || '').trim());
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export function applyHomeCastleTournamentAsset(targetGroup, sourceRoot) {
  const targets = directTargetMeshes(targetGroup);
  if (targets.length < TOURNAMENT_SOURCE_MESHES.length) return false;

  const sourcesByName = sourceMeshesByName(sourceRoot);
  const sources = TOURNAMENT_SOURCE_MESHES.map((name) => sourcesByName.get(name));
  if (sources.some((source) => !source?.geometry)) return false;

  for (let index = 0; index < TOURNAMENT_SOURCE_MESHES.length; index += 1) {
    const target = targets[index];
    const source = sources[index];

    // Keep the live mesh/material objects. The base mesh owns the responsive
    // onBeforeRender driver and the runtime materials are tuned to the room.
    // Blender/GLB owns silhouette and local transforms only.
    target.geometry.copy(source.geometry);
    if (!target.geometry.getAttribute('normal')) {
      target.geometry.computeVertexNormals();
    }
    target.position.copy(source.position);
    target.quaternion.copy(source.quaternion);
    target.scale.copy(source.scale);
  }

  targetGroup.userData ||= {};
  targetGroup.userData.homeCastleAsset = HOME_CASTLE_TOURNAMENT_ASSET_ID;
  return true;
}

export function disposeHomeCastleAssetScene(root) {
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
        reject(new Error('Home tournament GLB has no scene'));
        return;
      }
      gltf.scene.updateMatrixWorld(true);
      resolve(gltf.scene);
    }, reject);
  });
}

export async function hydrateHomeCastleTournamentCup(
  targetGroup,
  {
    loader = new GLTFLoader(),
    payload = tournamentCupPayload,
    decode = globalThis.atob,
  } = {},
) {
  const buffer = decodeHomeCastleGlbPayload(payload, decode);
  const sourceRoot = await parseGlbScene(buffer, loader);

  try {
    return applyHomeCastleTournamentAsset(targetGroup, sourceRoot);
  } finally {
    // BufferGeometry.copy() clones source attributes. The Home keeps ownership
    // of its original resources, so the temporary parsed GLB can die now.
    disposeHomeCastleAssetScene(sourceRoot);
  }
}
