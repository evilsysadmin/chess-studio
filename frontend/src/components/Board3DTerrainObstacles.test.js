import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { updateBoard3DTerrainObstacles } from './Board3DTerrainObstacles.js';

describe('War Room terrain hint geometry', () => {
  it('preserves obstacle placement, shape and shadow contract', () => {
    const group = new THREE.Group();
    updateBoard3DTerrainObstacles(group, ['a1', 'h8']);
    expect(group.children).toHaveLength(2);
    const [a1, h8] = group.children;
    expect(a1.userData.terrainBlocked).toBe('a1');
    expect(a1.position.toArray()).toEqual([-3.5, 0.19, 3.5]);
    expect(h8.userData.terrainBlocked).toBe('h8');
    expect(h8.position.toArray()).toEqual([3.5, 0.19, -3.5]);
    expect(a1.geometry.parameters).toMatchObject({ width: 0.62, height: 0.24, depth: 0.62 });
    expect(a1.rotation.y).toBeCloseTo(Math.PI / 4);
    expect(a1.castShadow).toBe(true);
    expect(a1.receiveShadow).toBe(true);
    expect(a1.material.color.getHex()).toBe(0x4f5558);
    updateBoard3DTerrainObstacles(group, []);
    expect(group.children).toHaveLength(0);
  });

  it('replaces old hint obstacles without retaining stale squares', () => {
    const group = new THREE.Group();
    updateBoard3DTerrainObstacles(group, ['e4', 'd5']);
    const previous = [...group.children];
    updateBoard3DTerrainObstacles(group, ['b2']);
    expect(group.children).toHaveLength(1);
    expect(group.children[0].userData.terrainBlocked).toBe('b2');
    expect(group.children[0]).not.toBe(previous[0]);
    expect(group.children[0]).not.toBe(previous[1]);
    updateBoard3DTerrainObstacles(group, []);
    expect(group.children).toHaveLength(0);
  });
});
