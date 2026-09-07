import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { applyWarRoomMaterialGrade } from './WarRoom3DMotion.js';

function material(role, color = 0xd8c7aa) {
  return {
    color: new THREE.Color(color),
    envMapIntensity: 0.72,
    roughness: 0.34,
    clearcoat: 0.48,
    clearcoatRoughness: 0.24,
    specularIntensity: 0.58,
    sheen: 0.04,
    sheenRoughness: 0.5,
    userData: { surfaceRole: role },
  };
}

describe('War Room material grade traversal budget', () => {
  it('finds the board once, then never walks unrelated room decor again', () => {
    const lightTile = { isMesh: true, material: material('board-light', 0xd9cfba) };
    const ivory = { isMesh: true, material: material('ivory') };
    const unrelated = { isMesh: true, material: material('decor-wood', 0x24170f) };

    const scene = { userData: {} };
    const boardRoot = {
      parent: scene,
      traverse: vi.fn((callback) => {
        callback(lightTile);
        callback(ivory);
      }),
    };
    lightTile.parent = boardRoot;
    ivory.parent = boardRoot;

    scene.traverse = vi.fn((callback) => {
      callback(unrelated);
      callback(lightTile);
    });

    const first = applyWarRoomMaterialGrade(scene);
    expect(first).toMatchObject({ ivory: 1, lightTile: 1 });
    expect(scene.traverse).toHaveBeenCalledTimes(1);
    expect(boardRoot.traverse).toHaveBeenCalledTimes(1);
    expect(scene.userData.warRoomMaterialGradeTraversal).toBe('board-root-v1');

    scene.traverse.mockClear();
    boardRoot.traverse.mockClear();
    const second = applyWarRoomMaterialGrade(scene);

    expect(second).toMatchObject({ adjusted: 0, ivory: 1, lightTile: 1 });
    expect(scene.traverse).not.toHaveBeenCalled();
    expect(boardRoot.traverse).toHaveBeenCalledTimes(1);
    expect(unrelated.material.userData.warRoomSurfaceGrade).toBeUndefined();
  });

  it('falls back safely when no canonical board-light material exists', () => {
    const ebony = { isMesh: true, material: material('ebony', 0x262a30) };
    const scene = {
      userData: {},
      traverse: vi.fn((callback) => callback(ebony)),
    };

    expect(applyWarRoomMaterialGrade(scene)).toMatchObject({ adjusted: 0, ivory: 0, lightTile: 0 });
    expect(scene.userData.warRoomMaterialGradeTraversal).toBe('scene-fallback');
  });
});
