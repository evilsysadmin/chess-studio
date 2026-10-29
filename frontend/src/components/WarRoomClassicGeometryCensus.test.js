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
      ownerFamilies: [{
        owner: 'root-1', meshNodes: 2, meshInstances: 5,
        uniqueGeometries: 1, potentialTriangles: 60, uniqueTriangles: 12,
      }],
      ownerGeometryFamilies: [{
        owner: 'root-1', geometryType: 'BoxGeometry',
        meshNodes: 2, meshInstances: 5, uniqueGeometries: 1,
        potentialTriangles: 60, uniqueTriangles: 12,
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

  it('attributes owner cost without counting overlapping roots or shared geometries twice', () => {
    const room = new THREE.Group();
    const table = new THREE.Group();
    const common = new THREE.BoxGeometry(1, 1, 1);
    room.add(new THREE.Mesh(common, new THREE.MeshBasicMaterial()));
    table.add(new THREE.InstancedMesh(common, new THREE.MeshBasicMaterial(), 3));
    const report = censusClassicWarRoomShell([room, table, room], {
      ownerLabels: ['room-structure', 'table-base', 'duplicate-room'],
    });
    expect(report.meshNodes).toBe(2);
    expect(report.uniqueGeometries).toBe(1);
    expect(report.potentialTriangles).toBe(48);
    expect(report.ownerFamilies).toEqual([
      { owner: 'table-base', meshNodes: 1, meshInstances: 3,
        uniqueGeometries: 0, potentialTriangles: 36, uniqueTriangles: 0 },
      { owner: 'room-structure', meshNodes: 1, meshInstances: 1,
        uniqueGeometries: 1, potentialTriangles: 12, uniqueTriangles: 12 },
    ]);
    expect(report.ownerGeometryFamilies).toEqual([
      { owner: 'table-base', geometryType: 'BoxGeometry',
        meshNodes: 1, meshInstances: 3, uniqueGeometries: 0,
        potentialTriangles: 36, uniqueTriangles: 0 },
      { owner: 'room-structure', geometryType: 'BoxGeometry',
        meshNodes: 1, meshInstances: 1, uniqueGeometries: 1,
        potentialTriangles: 12, uniqueTriangles: 12 },
    ]);
    for (const field of ['meshNodes', 'meshInstances', 'uniqueGeometries',
      'potentialTriangles', 'uniqueTriangles']) {
      expect(report.ownerFamilies.reduce((sum, owner) => sum + owner[field], 0))
        .toBe(report[field]);
      expect(report.ownerGeometryFamilies.reduce((sum, row) => sum + row[field], 0))
        .toBe(report[field]);
    }
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
      ownerFamilies: [{
        owner: 'root-1', meshNodes: 1, meshInstances: 1,
        uniqueGeometries: 1, potentialTriangles: 2, uniqueTriangles: 2,
      }],
      ownerGeometryFamilies: [{
        owner: 'root-1', geometryType: 'BufferGeometry',
        meshNodes: 1, meshInstances: 1, uniqueGeometries: 1,
        potentialTriangles: 2, uniqueTriangles: 2,
      }],
    });
  });
});
