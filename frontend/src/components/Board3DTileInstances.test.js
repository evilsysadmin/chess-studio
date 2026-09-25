import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { squarePosition } from './Board3DBoardMath.js';
import { buildBoard3DTileInstances, squareFromBoard3DIntersection } from './Board3DTileInstances.js';

describe('Board3D tile instances', () => {
  it('packs the 64 board squares into two shared-geometry batches', () => {
    const lightMaterial = new THREE.MeshBasicMaterial();
    const darkMaterial = new THREE.MeshBasicMaterial();
    const [lightTiles, darkTiles] = buildBoard3DTileInstances({
      lightTileMaterial: lightMaterial,
      darkTileMaterial: darkMaterial,
    });

    expect(lightTiles.isInstancedMesh).toBe(true);
    expect(darkTiles.isInstancedMesh).toBe(true);
    expect(lightTiles.count).toBe(32);
    expect(darkTiles.count).toBe(32);
    expect(lightTiles.geometry).toBe(darkTiles.geometry);

    const squares = [
      ...lightTiles.userData.board3DSquares,
      ...darkTiles.userData.board3DSquares,
    ];
    expect(squares).toHaveLength(64);
    expect(new Set(squares).size).toBe(64);
    expect(squares).toContain('a1');
    expect(squares).toContain('h8');

    const owner = lightTiles.userData.board3DSquares.includes('e2') ? lightTiles : darkTiles;
    const instanceId = owner.userData.board3DSquares.indexOf('e2');
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    owner.getMatrixAt(instanceId, matrix);
    position.setFromMatrixPosition(matrix);
    const expected = squarePosition('e2');
    expect(position.x).toBeCloseTo(expected.x, 6);
    expect(position.z).toBeCloseTo(expected.z, 6);
  });

  it('resolves instanced tile hits and keeps legacy child-square picking', () => {
    const lightMaterial = new THREE.MeshBasicMaterial();
    const darkMaterial = new THREE.MeshBasicMaterial();
    const [lightTiles, darkTiles] = buildBoard3DTileInstances({
      lightTileMaterial: lightMaterial,
      darkTileMaterial: darkMaterial,
    });
    const owner = lightTiles.userData.board3DSquares.includes('c4') ? lightTiles : darkTiles;
    const instanceId = owner.userData.board3DSquares.indexOf('c4');

    expect(squareFromBoard3DIntersection({ object: owner, instanceId })).toBe('c4');

    const parent = new THREE.Group();
    parent.userData.square = 'g7';
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    parent.add(child);
    expect(squareFromBoard3DIntersection({ object: child })).toBe('g7');
    expect(squareFromBoard3DIntersection(null)).toBeNull();
  });
});
