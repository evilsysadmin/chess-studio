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
      geometryFamilies: [{
        geometryType: 'BoxGeometry', meshNodes: 2, meshInstances: 5,
        uniqueGeometries: 1, potentialTriangles: 60, uniqueTriangles: 12,
      }],
    });
  });

  it('sorts geometry families by potential triangle cost and accounts for shared instances', () => {
    const root = new THREE.Group();
    const cheap = new THREE.BufferGeometry();
    cheap.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
    ], 3));
    const box = new THREE.BoxGeometry(1, 1, 1);
    root.add(new THREE.Mesh(cheap, new THREE.MeshBasicMaterial()));
    root.add(new THREE.Mesh(box, new THREE.MeshBasicMaterial()));
    root.add(new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial(), 3));
    const report = censusClassicWarRoomShell([root]);
    expect(report.geometryFamilies.map((row) => row.geometryType))
      .toEqual(['BoxGeometry', 'BufferGeometry']);
    expect(report.geometryFamilies[0]).toMatchObject({
      meshNodes: 2, meshInstances: 4, uniqueGeometries: 1,
      potentialTriangles: 48, uniqueTriangles: 12,
    });
    expect(report.geometryFamilies[1]).toMatchObject({
      meshNodes: 1, meshInstances: 1, uniqueGeometries: 1,
      potentialTriangles: 1, uniqueTriangles: 1,
    });
    expect(report.geometryFamilies.reduce((total, row) => total + row.potentialTriangles, 0))
      .toBe(report.potentialTriangles);
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
      geometryFamilies: [{
        geometryType: 'BufferGeometry', meshNodes: 1, meshInstances: 1,
        uniqueGeometries: 1, potentialTriangles: 2, uniqueTriangles: 2,
      }],
    });
  });
});
