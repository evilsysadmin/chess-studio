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
  'war-room-premium-frame-outer-bar',
  'war-room-premium-frame-inner-bar',
  'war-room-sofa-burgundy-arm',
  'war-room-sofa-carved-arm-rail',
  'war-room-command-desk-pedestal',
  'war-room-command-desk-drawer',
  'war-room-command-chair-back-post',
  'war-room-command-chair-leg',
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

function sceneRoot(object) {
  let current = object;
  while (current?.parent) current = current.parent;
  return current;
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

function matchesLateLegacyPractical(light) {
  if (!light?.isPointLight || light.name) return false;
  const distance = Number(light.distance || 0);
  const y = Number(light.position?.y || 0);
  const x = Math.abs(Number(light.position?.x || 0));

  const rearSconce = Math.abs(distance - 7.2) < 0.05
    && Math.abs(y - 4.17) < 0.08
    && Math.abs(x - 3.18) < 0.08;
  const bankerLamp = Math.abs(distance - 5.6) < 0.05
    && Math.abs(y - 2.5) < 0.08;
  return rearSconce || bankerLamp;
}

function lightCensus(root) {
  const census = { total: 0, point: 0, spot: 0, directional: 0, hemisphere: 0 };
  root?.traverse?.((object) => {
    if (!object?.isLight) return;
    census.total += 1;
    if (object.isPointLight) census.point += 1;
    else if (object.isSpotLight) census.spot += 1;
    else if (object.isDirectionalLight) census.directional += 1;
    else if (object.isHemisphereLight) census.hemisphere += 1;
  });
  return census;
}

export function retireWarRoomLatePracticalLights(root) {
  const premium = root?.name === 'premium-war-room-layer'
    ? root
    : root?.getObjectByName?.('premium-war-room-layer');
  if (!premium) return 0;

  const retired = premium.children.filter(matchesLateLegacyPractical);
  for (const light of retired) {
    light.visible = false;
    light.userData ||= {};
    light.userData.warRoomPerformanceLight = 'late-practical-emissive-owned-retired';
    premium.remove(light);
  }

  premium.userData ||= {};
  premium.userData.warRoomLatePracticalLightsRetired = retired.length;
  premium.userData.warRoomLatePracticalLightBudget = 'rear-sconces-banker-v1';
  premium.userData.warRoomFinalLightCensus = lightCensus(premium);
  return retired.length;
}

function armLatePracticalLightRetirement(root) {
  if (!root || root.userData?.warRoomLatePracticalLightRetirementArmed) return 0;
  const driver = root.getObjectByName?.('war-room-castle-floor-slab')
    || root.getObjectByName?.('war-room-castle-wall-left');
  if (!driver) return 0;

  const previous = driver.onAfterRender;
  let completed = false;
  driver.onAfterRender = (...args) => {
    previous?.(...args);
    if (completed) return;
    completed = true;
    const liveRoot = sceneRoot(driver) || root;
    retireWarRoomLatePracticalLights(liveRoot);
    driver.userData.warRoomLatePracticalLightRetirementCompleted = true;
  };
  driver.userData.warRoomLatePracticalLightRetirement = 'first-frame-v1';
  root.userData.warRoomLatePracticalLightRetirementArmed = true;
  return 1;
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
  const retiredLights = [];
  const retiredTargets = new Set();

  root.traverse((object) => {
    if (object?.isPointLight) {
      if (DESKTOP_POINT_LIGHT_KEEP_NAMES.has(object.name)) {
        stats.pointLightsKept += 1;
        object.userData ||= {};
        object.userData.warRoomPerformanceLight = 'kept-real-light';
      } else {
        object.visible = false;
        object.userData ||= {};
        object.userData.warRoomPerformanceLight = 'emissive-only-retired';
        stats.pointLightsCulled += 1;
        retiredLights.push(object);
      }
    } else if (object?.isSpotLight) {
      object.visible = false;
      object.userData ||= {};
      object.userData.warRoomPerformanceLight = 'global-key-covered-retired';
      stats.spotLightsCulled += 1;
      retiredLights.push(object);
      if (object.target?.parent) retiredTargets.add(object.target);
    }

    if (object?.isMesh && object.castShadow && !belongsToChessPiece(object)) {
      object.castShadow = false;
      object.userData ||= {};
      object.userData.warRoomStaticShadowCasterRetired = true;
      stats.staticShadowCastersRetired += 1;
    }
  });

  for (const light of retiredLights) light.parent?.remove(light);
  for (const target of retiredTargets) target.parent?.remove(target);
  armLatePracticalLightRetirement(root);

  root.userData ||= {};
  root.userData.warRoomPerformanceBudget = 'desktop-hard-cut-v4-late-practical-retirement';
  root.userData.warRoomPointLightsKept = stats.pointLightsKept;
  root.userData.warRoomPointLightsCulled = stats.pointLightsCulled;
  root.userData.warRoomSpotLightsCulled = stats.spotLightsCulled;
  root.userData.warRoomDetachedLights = retiredLights.length;
  root.userData.warRoomDetachedLightTargets = retiredTargets.size;
  root.userData.warRoomStaticShadowCastersRetired = stats.staticShadowCastersRetired;
  return stats;
}

export function warRoomDesktopPointLightKeepNames() {
  return new Set(DESKTOP_POINT_LIGHT_KEEP_NAMES);
}
