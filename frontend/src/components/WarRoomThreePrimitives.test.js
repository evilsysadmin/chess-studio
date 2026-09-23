import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addWarRoomMesh } from './WarRoomThreePrimitives.js';

describe('War Room procedural Three primitives', () => {
  it('adds a named shadow-casting mesh with the requested transform', () => {
    const parent = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 2, 3);
    const material = new THREE.MeshBasicMaterial();
    const mesh = addWarRoomMesh(
      parent,
      geometry,
      material,
      [1, 2, 3],
      [0.1, 0.2, 0.3],
      'war-room-test-mesh',
    );

    expect(parent.children).toEqual([mesh]);
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
    expect([mesh.rotation.x, mesh.rotation.y, mesh.rotation.z]).toEqual([0.1, 0.2, 0.3]);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(mesh.name).toBe('war-room-test-mesh');

    geometry.dispose();
    material.dispose();
  });
});
