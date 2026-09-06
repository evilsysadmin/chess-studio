import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PAWN_SLUG_STATIC_INSTANCE_VERSION,
  createPawnSlugStaticInstanceBatch,
} from './pawnSlugStaticInstances.js';

describe('Pawn Slug static instance batches', () => {
  it('packs repeated meshes into one InstancedMesh with stable transforms', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x334455 });
    const batch = createPawnSlugStaticInstanceBatch({
      name: 'test-batch',
      geometry,
      material,
      instances: [
        { x: 1, y: 2, z: 3, ry: 0.4, scale: 0.5 },
        { x: -2, y: 1, z: 0, sx: 2, sy: 3, sz: 4 },
      ],
    });

    expect(batch).toBeInstanceOf(THREE.InstancedMesh);
    expect(batch.count).toBe(2);
    expect(batch.userData.pawnSlugStaticInstances).toBe(PAWN_SLUG_STATIC_INSTANCE_VERSION);
    expect(batch.castShadow).toBe(true);
    expect(batch.receiveShadow).toBe(true);

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    batch.getMatrixAt(0, matrix);
    matrix.decompose(position, quaternion, scale);
    expect(position.toArray()).toEqual([1, 2, 3]);
    expect(scale.x).toBeCloseTo(0.5);
    expect(scale.y).toBeCloseTo(0.5);
    expect(scale.z).toBeCloseTo(0.5);

    batch.getMatrixAt(1, matrix);
    matrix.decompose(position, quaternion, scale);
    expect(position.toArray()).toEqual([-2, 1, 0]);
    expect(scale.toArray()).toEqual([2, 3, 4]);

    geometry.dispose();
    material.dispose();
  });

  it('returns null for an empty batch instead of allocating a draw object', () => {
    expect(createPawnSlugStaticInstanceBatch({
      geometry: new THREE.BoxGeometry(1, 1, 1),
      material: new THREE.MeshBasicMaterial(),
      instances: [],
    })).toBeNull();
  });
});
