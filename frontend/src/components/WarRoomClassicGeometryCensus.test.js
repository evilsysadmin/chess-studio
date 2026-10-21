import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { censusClassicWarRoomShell } from './WarRoomClassicGeometryCensus.js';

describe('classic War Room geometry census', () => {
  it('counts shared geometry once and multiplied instanced meshes as potential geometry', () => {
    const root = new THREE.Group();
    const box = new THREE.BoxGeometry(1, 1, 1); // 12 triangles
    root.add(new THREE.Mesh(box, new THREE.MeshBasicMaterial()));
    root.add(new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial(), 4));
    const report = censusClassicWarRoomShell([root, root]);
    expect(report).toEqual({
      meshNodes: 2,
      meshInstances: 5,
      uniqueGeometries: 1,
      potentialTriangles: 60,
      uniqueTriangles: 12,
    });
  });

  it('handles nonindexed geometries, non-mesh nodes and empty input', () => {
    expect(censusClassicWarRoomShell([null, {}]).potentialTriangles).toBe(0);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 1, 1, 0, 1, 0, 1, 1,
    ], 3)); // 2 triangles
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    group.add(new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()));
    expect(censusClassicWarRoomShell([group])).toMatchObject({
      meshNodes: 1, meshInstances: 1, uniqueGeometries: 1,
      potentialTriangles: 2, uniqueTriangles: 2,
    });
  });
});
