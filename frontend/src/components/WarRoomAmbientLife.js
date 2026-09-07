import { getEffectiveReducedMotion } from '../userPreferences.js';

export const WAR_ROOM_AMBIENT_LIFE_VERSION = 'curtain-fire-breath-v2-cached';

const WARM_EMISSIVE = 0x43130a;
const AMBIENT_LIFE_HOT_PATH_VERSION = 'direct-args-options-reuse-v1';
const ambientLifeStateCache = new WeakMap();

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function prepareFold(fold, index) {
  if (!fold.userData.warRoomAmbientLifeBase) {
    fold.userData.warRoomAmbientLifeBase = {
      rotationZ: fold.rotation.z,
      positionY: fold.position.y,
      scaleX: fold.scale.x,
    };
    fold.userData.warRoomAmbientLifePhase = index * 0.73 + (fold.position.x < 0 ? 0.9 : 0.15);
  }
  return fold.userData.warRoomAmbientLifeBase;
}

function prepareMaterial(material) {
  if (!material) return null;
  if (!material.userData.warRoomAmbientLifeBase) {
    material.userData.warRoomAmbientLifeBase = {
      emissive: material.emissive?.getHex?.() ?? 0,
      emissiveIntensity: material.emissiveIntensity ?? 0,
      sheen: material.sheen ?? 0,
    };
  }
  return material.userData.warRoomAmbientLifeBase;
}

function buildAmbientLifeState(root) {
  if (!root || typeof root.traverse !== 'function') return null;

  const foldEntries = [];
  const materialEntries = [];
  const seenMaterials = new Set();

  root.traverse((object) => {
    if (!object?.name?.includes?.('war-room-velvet-curtain-fold')) return;
    const index = foldEntries.length;
    const base = prepareFold(object, index);
    foldEntries.push({
      fold: object,
      base,
      phase: object.userData.warRoomAmbientLifePhase,
    });

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material || seenMaterials.has(material)) continue;
      seenMaterials.add(material);
      const materialBase = prepareMaterial(material);
      if (materialBase) materialEntries.push({ material, base: materialBase });
    }
  });

  const state = { foldEntries, materialEntries };
  // An empty cache would hide folds added later by a deferred scene build. Real War
  // Room installs already contain the curtains, so cache only once we have useful refs.
  if (foldEntries.length) ambientLifeStateCache.set(root, state);

  root.userData ||= {};
  root.userData.warRoomAmbientLifeVersion = WAR_ROOM_AMBIENT_LIFE_VERSION;
  root.userData.warRoomAmbientLifeFoldCount = foldEntries.length;
  root.userData.warRoomAmbientLifeMaterialCount = materialEntries.length;
  root.userData.warRoomAmbientLifeRefCache = foldEntries.length ? 'warm' : 'empty';
  return state;
}

function ambientLifeState(root) {
  return ambientLifeStateCache.get(root) || buildAmbientLifeState(root);
}

export function applyWarRoomAmbientLife(root, {
  now = nowMs(),
  reducedMotion = getEffectiveReducedMotion(),
} = {}) {
  const state = ambientLifeState(root);
  if (!state?.foldEntries?.length) return 0;

  const fireBreath = reducedMotion
    ? 0
    : Math.sin(now * 0.00115) * 0.55 + Math.sin(now * 0.00235 + 1.1) * 0.45;

  for (const { fold, base, phase } of state.foldEntries) {
    if (reducedMotion) {
      fold.rotation.z = base.rotationZ;
      fold.position.y = base.positionY;
      fold.scale.x = base.scaleX;
    } else {
      const drift = Math.sin(now * 0.00043 + phase);
      const settle = Math.sin(now * 0.00107 + phase * 0.61);
      fold.rotation.z = base.rotationZ + drift * 0.006 + settle * 0.0018;
      fold.position.y = base.positionY + drift * 0.0045;
      fold.scale.x = base.scaleX * (1 + settle * 0.0025);
    }
  }

  for (const { material, base } of state.materialEntries) {
    if (material.emissive?.setHex) material.emissive.setHex(base.emissive || WARM_EMISSIVE);
    material.emissiveIntensity = base.emissiveIntensity + 0.055 + fireBreath * 0.012;
    if (typeof material.sheen === 'number') {
      material.sheen = base.sheen + (reducedMotion ? 0.008 : 0.008 + fireBreath * 0.004);
    }
  }

  root.userData ||= {};
  root.userData.warRoomAmbientLifeVersion = WAR_ROOM_AMBIENT_LIFE_VERSION;
  return state.foldEntries.length;
}

export function installWarRoomAmbientLife(group, { coarsePointer = false } = {}) {
  if (!group || coarsePointer) return 0;
  // Continuous animation belongs on the floor/castle animation chain. Keeping
  // it off the side wall lets static room-layout work retire after first paint.
  const driver = group.getObjectByName?.('war-room-castle-floor-slab')
    || group.getObjectByName?.('war-room-castle-wall-left');
  if (!driver || driver.userData.warRoomAmbientLifeDriver) return 0;

  // Warm the refs once while the scene is being assembled. The old path walked
  // the complete War Room graph on every ambient heartbeat just to rediscover the
  // same curtain folds and materials.
  buildAmbientLifeState(group);

  driver.userData.warRoomAmbientLifeDriver = WAR_ROOM_AMBIENT_LIFE_VERSION;
  driver.userData.warRoomAmbientLifeHotPath = AMBIENT_LIFE_HOT_PATH_VERSION;
  const previous = driver.onBeforeRender;
  const renderOptions = { now: 0, reducedMotion: false };
  driver.onBeforeRender = (renderer, scene, camera, geometry, material, renderGroup) => {
    previous?.(renderer, scene, camera, geometry, material, renderGroup);
    renderOptions.now = nowMs();
    renderOptions.reducedMotion = getEffectiveReducedMotion();
    applyWarRoomAmbientLife(group, renderOptions);
  };

  group.userData.warRoomAmbientLifeDriver = WAR_ROOM_AMBIENT_LIFE_VERSION;
  group.userData.warRoomAmbientLifeAnchor = driver.name;
  group.userData.warRoomAmbientLifeHotPath = AMBIENT_LIFE_HOT_PATH_VERSION;
  return 1;
}
