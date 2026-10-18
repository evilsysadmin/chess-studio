// Freeze authored Home GLB transforms only after fire/Klaus rigs have been
// assembled. This prevents Object3D.updateMatrix() from dirtying every static
// ancestor (and forcing redundant matrixWorld propagation) on each room draw.
// Moving flame nodes and the whole animated Klaus subtree retain Three's
// normal automatic updates. Matthias, lights and particles live outside the GLB.
export function freezeHomeBlenderStaticTransforms(root, movingRoots = []) {
  if (typeof root?.traverse !== 'function') return 0;
  const moving = new Set(movingRoots.filter(Boolean));
  let frozen = 0;
  root.traverse((object) => {
    // Traverse does not support pruning, so check every ancestor to protect
    // dynamically parented meshes (Klaus head/ears as well as the rig itself).
    for (let parent = object; parent; parent = parent.parent) {
      if (moving.has(parent)) return;
      if (parent === root) break;
    }
    if (object.matrixAutoUpdate === false) return;
    // Prime the current local TRS matrix exactly as Three's automatic update
    // would have done on the next render. Do not touch world transforms.
    object.updateMatrix();
    object.matrixAutoUpdate = false;
    frozen += 1;
  });
  return frozen;
}
