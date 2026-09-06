import * as THREE from 'three';

const DESKTOP_POINT_LIGHT_KEEP_NAMES = new Set([
  'war-room-fire-light',
  'war-room-side-torch-light',
]);

const STATIC_INSTANCE_NAMES = new Set([
  'war-room-castle-floor-joint-longitudinal',
  'war-room-castle-floor-joint-transverse',
  'war-room-teutonic-mortar-course',
  'war-room-teutonic-wall-plinth',
  'war-room-hammerbeam-transverse',
  'war-room-hammerbeam-longitudinal',
  'war-room-command-carpet-brass-key',
  'war-room-continuous-stone-skirting',
]);

const STATIC_UNNAMED_PARENT_NAMES = new Set([
  'war-room-castle-side-walls',
]);

function belongsToChessPiece(object) {
  let current = object;
  while (current) {
    if (current.userData?.type && current.userData?.color && current.userData?.square) return true;
    current = current.parent;
  }
  return false;
}

function geometrySignature(geometry) {
  if (!geometry || geometry.type !== 'BoxGeometry') return null;
  const {
    width,
    height,
    depth,
    widthSegments = 1,
    heightSegments = 1,
    depthSegments = 1,
  } = geometry.parameters || {};
  if (![width, height, depth, widthSegments, heightSegments, depthSegments].every(Number.isFinite)) return null;
  return [width, height, depth, widthSegments, heightSegments, depthSegments].join(':');
}

function isStaticBatchCandidate(object) {
  if (!object?.isMesh || object.isInstancedMesh || !object.parent || Array.isArray(object.material)) return false;
  if (typeof object.onBeforeRender === 'function') return false;
  if (belongsToChessPiece(object)) return false;
  if (STATIC_INSTANCE_NAMES.has(object.name)) return true;
  return !object.name && STATIC_UNNAMED_PARENT_NAMES.has(object.parent.name);
}

function staticBatchKey(object) {
  const signature = geometrySignature(object.geometry);
  if (!signature || !object.material?.uuid || !object.parent?.uuid) return null;
  return [
    object.parent.uuid,
    object.name || '__unnamed__',
    object.material.uuid,
    signature,
    object.castShadow ? 1 : 0,
    object.receiveShadow ? 1 : 0,
    object.visible ? 1 : 0,
    object.renderOrder || 0,
  ].join('|');
}

export function batchWarRoomStaticDecor(root) {
  const result = {
    batches: 0,
    sourceMeshes: 0,
    drawCallsRetired: 0,
  };
  if (!root || typeof root.traverse !== 'function') return result;

  const buckets = new Map();
  root.traverse((object) => {
    if (!isStaticBatchCandidate(object)) return;
    const key = staticBatchKey(object);
    if (!key) return;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(object);
  });

  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const first = meshes[0];
    const parent = first.parent;
    if (!parent || meshes.some((mesh) => mesh.parent !== parent)) continue;

    const batch = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
    batch.name = first.name || 'war-room-static-instance-batch';
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    batch.visible = first.visible;
    batch.renderOrder = first.renderOrder;
    batch.layers.mask = first.layers.mask;
    batch.userData = {
      ...first.userData,
      warRoomStaticBatch: 'instanced-v1',
      warRoomStaticBatchSourceName: first.name || '',
      warRoomStaticBatchCount: meshes.length,
    };

    meshes.forEach((mesh, index) => {
      mesh.updateMatrix();
      batch.setMatrixAt(index, mesh.matrix);
    });
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
    batch.updateMatrix();
    batch.matrixAutoUpdate = false;

    meshes.forEach((mesh) => parent.remove(mesh));
    parent.add(batch);

    result.batches += 1;
    result.sourceMeshes += meshes.length;
    result.drawCallsRetired += meshes.length - 1;
  }

  root.userData ||= {};
  root.userData.warRoomStaticInstanceBatches = result.batches;
  root.userData.warRoomStaticInstanceSourceMeshes = result.sourceMeshes;
  root.userData.warRoomStaticDrawCallsRetired = result.drawCallsRetired;
  return result;
}

export function applyWarRoomPerformanceBudget(root, { coarsePointer = false } = {}) {
  const stats = {
    pointLightsKept: 0,
    pointLightsCulled: 0,
    spotLightsCulled: 0,
    staticShadowCastersRetired: 0,
  };
  if (!root || coarsePointer || typeof root.traverse !== 'function') return stats;

  batchWarRoomStaticDecor(root);

  root.traverse((object) => {
    if (object?.isPointLight) {
      if (DESKTOP_POINT_LIGHT_KEEP_NAMES.has(object.name)) {
        stats.pointLightsKept += 1;
        object.userData ||= {};
        object.userData.warRoomPerformanceLight = 'kept-real-light';
      } else {
        object.visible = false;
        object.userData ||= {};
        object.userData.warRoomPerformanceLight = 'emissive-only';
        stats.pointLightsCulled += 1;
      }
    } else if (object?.isSpotLight) {
      // The premium group historically stacked two museum spot keys on top of
      // torch/fire/global light. Their job is already covered by the bright
      // emissive torch halos and the global key, while every extra forward light
      // expands the PBR shader cost for the whole room.
      object.visible = false;
      object.userData ||= {};
      object.userData.warRoomPerformanceLight = 'global-key-covered';
      stats.spotLightsCulled += 1;
    }

    // Static decor used to participate in every directional shadow refresh even
    // though almost none of it moves. Keep real-time shadow casting for chess
    // pieces, which are built outside this premium-decor group. The room still
    // receives the key light and keeps all material/IBL depth.
    if (object?.isMesh && object.castShadow && !belongsToChessPiece(object)) {
      object.castShadow = false;
      object.userData ||= {};
      object.userData.warRoomStaticShadowCasterRetired = true;
      stats.staticShadowCastersRetired += 1;
    }
  });

  root.userData ||= {};
  root.userData.warRoomPerformanceBudget = 'desktop-hard-cut-v2-instancing';
  root.userData.warRoomPointLightsKept = stats.pointLightsKept;
  root.userData.warRoomPointLightsCulled = stats.pointLightsCulled;
  root.userData.warRoomSpotLightsCulled = stats.spotLightsCulled;
  root.userData.warRoomStaticShadowCastersRetired = stats.staticShadowCastersRetired;
  return stats;
}

export function warRoomDesktopPointLightKeepNames() {
  return new Set(DESKTOP_POINT_LIGHT_KEEP_NAMES);
}
