import { disposeObject } from './Board3DPieces.js';

// Shared scene ownership helpers; keep Board3DCore focused on React/WebGL.
export function clearObjectGroup(group) {
  if (!group) return;
  for (const child of [...group.children]) {
    group.remove(child);
    disposeObject(child);
  }
}

export function makeObjectTranslucent(group, opacity) {
  group?.traverse?.((object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!material) return;
      material.transparent = true;
      material.opacity = opacity;
      material.depthWrite = false;
    });
  });
}
