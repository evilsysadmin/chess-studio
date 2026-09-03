import { getEffectiveReducedMotion } from '../userPreferences.js';

export const WAR_ROOM_AMBIENT_LIFE_VERSION = 'curtain-fire-breath-v1';

const WARM_EMISSIVE = 0x43130a;

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function sceneRoot(object) {
  let current = object;
  while (current?.parent) current = current.parent;
  return current;
}

function curtainFolds(root) {
  const folds = [];
  root?.traverse?.((object) => {
    if (object?.name?.includes?.('war-room-velvet-curtain-fold')) folds.push(object);
  });
  return folds;
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

export function applyWarRoomAmbientLife(root, {
  now = nowMs(),
  reducedMotion = getEffectiveReducedMotion(),
} = {}) {
  const folds = curtainFolds(root);
  if (!folds.length) return 0;

  const seenMaterials = new Set();
  const fireBreath = reducedMotion
    ? 0
    : Math.sin(now * 0.00115) * 0.55 + Math.sin(now * 0.00235 + 1.1) * 0.45;

  folds.forEach((fold, index) => {
    const base = prepareFold(fold, index);
    const phase = fold.userData.warRoomAmbientLifePhase;
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

    const materials = Array.isArray(fold.material) ? fold.material : [fold.material];
    materials.forEach((material) => {
      if (!material || seenMaterials.has(material)) return;
      seenMaterials.add(material);
      const materialBase = prepareMaterial(material);
      if (!materialBase) return;

      if (material.emissive?.setHex) {
        material.emissive.setHex(materialBase.emissive || WARM_EMISSIVE);
      }
      material.emissiveIntensity = materialBase.emissiveIntensity + 0.055 + fireBreath * 0.012;
      if (typeof material.sheen === 'number') {
        material.sheen = materialBase.sheen + (reducedMotion ? 0.008 : 0.008 + fireBreath * 0.004);
      }
    });
  });

  if (!root.userData) root.userData = {};
  root.userData.warRoomAmbientLifeVersion = WAR_ROOM_AMBIENT_LIFE_VERSION;
  root.userData.warRoomAmbientLifeFoldCount = folds.length;
  root.userData.warRoomAmbientLifeMaterialCount = seenMaterials.size;
  return folds.length;
}

export function installWarRoomAmbientLife(group, { coarsePointer = false } = {}) {
  if (!group || coarsePointer) return 0;
  // Continuous animation belongs on the floor/castle animation chain. Keeping
  // it off the side wall lets static room-layout work retire after first paint.
  const driver = group.getObjectByName?.('war-room-castle-floor-slab')
    || group.getObjectByName?.('war-room-castle-wall-left');
  if (!driver || driver.userData.warRoomAmbientLifeDriver) return 0;

  driver.userData.warRoomAmbientLifeDriver = WAR_ROOM_AMBIENT_LIFE_VERSION;
  const previous = driver.onBeforeRender;
  driver.onBeforeRender = (...args) => {
    previous?.(...args);
    applyWarRoomAmbientLife(sceneRoot(driver), {
      now: nowMs(),
      reducedMotion: getEffectiveReducedMotion(),
    });
  };

  group.userData.warRoomAmbientLifeDriver = WAR_ROOM_AMBIENT_LIFE_VERSION;
  group.userData.warRoomAmbientLifeAnchor = driver.name;
  return 1;
}
