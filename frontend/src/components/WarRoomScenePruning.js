export const WAR_ROOM_CANONICAL_PRUNE_VERSION = 'canonical-scene-prune-v1';

const RETIRED_OBJECT_NAMES = new Set([
  'war-room-side-console-left',
  'war-room-side-console-right',
  'war-room-armor-guard-left',
  'war-room-armor-guard-right',
  'war-room-armor-alcove-left',
  'war-room-armor-alcove-right',
  'war-room-gallery-picture-rail',
  'war-room-gallery-picture-rail-brass-line',
  'war-room-hammerbeam-side-tie',
  'war-room-hammerbeam-corbel',
  'war-room-hammerbeam-brace',
  'war-room-armor-alcove-pointed-arch',
  'war-room-teutonic-mortar-joint',
  'war-table-field-folio',
  'war-table-map-pencil',
  'war-table-command-chronometer',
  'matthias-command-relic',
]);

function sceneRoot(object) {
  let current = object;
  while (current?.parent) current = current.parent;
  return current || object || null;
}

function retiredByContract(object) {
  if (!object) return false;
  if (RETIRED_OBJECT_NAMES.has(object.name)) return true;

  const data = object.userData || {};
  return data.replacedByGothicArmor === true
    || data.relocatedToRoomDecor === true
    || String(data.warRoomFurniturePlacement || '').startsWith('retired-')
    || Boolean(data.warRoomJointRetired)
    || Boolean(data.warRoomApprovedMockWall)
    || String(data.warRoomBraceStyle || '').startsWith('retired-')
    || String(data.warRoomCurtainPelmet || '').startsWith('retired-');
}

function collectRetiredRoots(root) {
  const retired = [];

  const visit = (object) => {
    for (const child of [...(object?.children || [])]) {
      if (retiredByContract(child)) {
        retired.push(child);
        continue;
      }
      visit(child);
    }
  };

  visit(root);
  return retired;
}

function materialTextures(material, textures) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture) textures.add(value);
  }
}

function collectResources(root) {
  const resources = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
  };

  root?.traverse?.((object) => {
    if (object.geometry) resources.geometries.add(object.geometry);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      resources.materials.add(material);
      materialTextures(material, resources.textures);
    }
    if (object.userData?.ownedTexture?.isTexture) resources.textures.add(object.userData.ownedTexture);
  });

  return resources;
}

function countNodes(root) {
  let count = 0;
  root?.traverse?.(() => { count += 1; });
  return count;
}

export function pruneWarRoomRetiredSceneObjects(anchor) {
  const root = sceneRoot(anchor);
  if (!root?.traverse || root.userData?.warRoomCanonicalPruneVersion === WAR_ROOM_CANONICAL_PRUNE_VERSION) {
    return {
      removedRoots: 0,
      removedNodes: 0,
      disposedGeometries: 0,
      disposedMaterials: 0,
      disposedTextures: 0,
    };
  }

  const retiredRoots = collectRetiredRoots(root);
  const removed = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
  };
  let removedNodes = 0;

  for (const object of retiredRoots) {
    removedNodes += countNodes(object);
    const resources = collectResources(object);
    resources.geometries.forEach((item) => removed.geometries.add(item));
    resources.materials.forEach((item) => removed.materials.add(item));
    resources.textures.forEach((item) => removed.textures.add(item));
    object.parent?.remove?.(object);
  }

  const live = collectResources(root);
  let disposedGeometries = 0;
  let disposedMaterials = 0;
  let disposedTextures = 0;

  for (const geometry of removed.geometries) {
    if (live.geometries.has(geometry)) continue;
    geometry.dispose?.();
    disposedGeometries += 1;
  }
  for (const material of removed.materials) {
    if (live.materials.has(material)) continue;
    material.dispose?.();
    disposedMaterials += 1;
  }
  for (const texture of removed.textures) {
    if (live.textures.has(texture)) continue;
    texture.dispose?.();
    disposedTextures += 1;
  }

  if (!root.userData) root.userData = {};
  root.userData.warRoomCanonicalPruneVersion = WAR_ROOM_CANONICAL_PRUNE_VERSION;
  root.userData.warRoomCanonicalPrunedRoots = retiredRoots.length;
  root.userData.warRoomCanonicalPrunedNodes = removedNodes;
  root.userData.warRoomCanonicalPrunedGeometries = disposedGeometries;
  root.userData.warRoomCanonicalPrunedMaterials = disposedMaterials;
  root.userData.warRoomCanonicalPrunedTextures = disposedTextures;

  return {
    removedRoots: retiredRoots.length,
    removedNodes,
    disposedGeometries,
    disposedMaterials,
    disposedTextures,
  };
}
