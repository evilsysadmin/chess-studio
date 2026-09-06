import * as THREE from 'three';

export const PAWN_SLUG_STATIC_INSTANCE_VERSION = 'static-instance-batches-v1';

export function createPawnSlugStaticInstanceBatch({
  name,
  geometry,
  material,
  instances = [],
  castShadow = true,
  receiveShadow = true,
} = {}) {
  if (!geometry || !material || instances.length === 0) return null;

  const batch = new THREE.InstancedMesh(geometry, material, instances.length);
  batch.name = name || 'pawn-slug-static-instance-batch';
  batch.castShadow = castShadow;
  batch.receiveShadow = receiveShadow;
  batch.userData.pawnSlugStaticInstances = PAWN_SLUG_STATIC_INSTANCE_VERSION;
  batch.userData.pawnSlugInstanceCount = instances.length;

  const scratch = new THREE.Object3D();
  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index] || {};
    scratch.position.set(instance.x || 0, instance.y || 0, instance.z || 0);
    scratch.rotation.set(instance.rx || 0, instance.ry || 0, instance.rz || 0);
    const uniformScale = Number.isFinite(instance.scale) ? instance.scale : 1;
    scratch.scale.set(
      Number.isFinite(instance.sx) ? instance.sx : uniformScale,
      Number.isFinite(instance.sy) ? instance.sy : uniformScale,
      Number.isFinite(instance.sz) ? instance.sz : uniformScale,
    );
    scratch.updateMatrix();
    batch.setMatrixAt(index, scratch.matrix);
  }
  batch.instanceMatrix.needsUpdate = true;
  batch.computeBoundingSphere();
  return batch;
}
