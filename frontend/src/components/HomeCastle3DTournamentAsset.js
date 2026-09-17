import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import tournamentCupPayload from '../assets/home3d/tournament-cup-v1.glb.b64?raw';
import { loadHomeCastleR2Scene } from './HomeCastle3DR2Asset.js';

export const HOME_CASTLE_TOURNAMENT_ASSET_ID = 'blender-glb:tournament-cup-v1';
export const HOME_CASTLE_TOURNAMENT_R2_LOGICAL_ID = 'home.tournament.trophy.runtime';

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

function normalizedSourceMatrices(sourceRoot, sources) {
  sourceRoot?.updateMatrixWorld?.(true);

  const bounds = new THREE.Box3();
  const meshBounds = new THREE.Box3();
  let hasBounds = false;

  for (const source of sources) {
    if (!source?.geometry) continue;
    source.geometry.computeBoundingBox?.();
    const geometryBounds = source.geometry.boundingBox;
    if (!geometryBounds) continue;

    meshBounds.copy(geometryBounds).applyMatrix4(source.matrixWorld);
    if (!hasBounds) {
      bounds.copy(meshBounds);
      hasBounds = true;
    } else {
      bounds.union(meshBounds);
    }
  }

  if (!hasBounds || bounds.isEmpty()) {
    return sources.map((source) => source.matrixWorld.clone());
  }

  const center = bounds.getCenter(new THREE.Vector3());
  const normalize = new THREE.Matrix4().makeTranslation(
    -center.x,
    -bounds.min.y,
    -center.z,
  );

  return sources.map((source) => normalize.clone().multiply(source.matrixWorld));
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

  const normalizedMatrices = normalizedSourceMatrices(sourceRoot, sources);

  for (let index = 0; index < TOURNAMENT_SOURCE_MESHES.length; index += 1) {
    const target = targets[index];
    const source = sources[index];

    // Keep the live mesh/material objects. The base mesh owns the responsive
    // onBeforeRender driver and the runtime materials are tuned to the room.
    // Blender owns silhouette and relative transforms, but not scene placement:
    // normalize the authored GLB around its own footprint so the Home anchor is
    // the single source of truth for where the trophy lives in the Great Hall.
    target.geometry.copy(source.geometry);
    if (!target.geometry.getAttribute('normal')) {
      target.geometry.computeVertexNormals();
    }
    normalizedMatrices[index].decompose(
      target.position,
      target.quaternion,
      target.scale,
    );
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
    assetUrl,
  } = {},
) {
  const remoteRoot = await loadHomeCastleR2Scene({
    logicalId: HOME_CASTLE_TOURNAMENT_R2_LOGICAL_ID,
    loader,
    assetUrl,
  });
  if (remoteRoot) {
    try {
      if (applyHomeCastleTournamentAsset(targetGroup, remoteRoot)) return true;
    } finally {
      disposeHomeCastleAssetScene(remoteRoot);
    }
  }

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
