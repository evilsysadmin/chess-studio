import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyWarRoomMaterialGrade } from './WarRoom3DMotion.js';

function snapshotPbr(material) {
  return {
    color: material.color.getHex(),
    envMapIntensity: material.envMapIntensity,
    roughness: material.roughness,
    clearcoat: material.clearcoat,
    clearcoatRoughness: material.clearcoatRoughness,
    specularIntensity: material.specularIntensity,
    sheen: material.sheen,
    sheenRoughness: material.sheenRoughness,
  };
}

describe('War Room canonical ivory authority', () => {
  it('keeps versioned ivory untouched while giving current light tiles a luminous satin lift', () => {
    const ivory = {
      color: new THREE.Color(0xf1dfbd),
      envMapIntensity: 0.28,
      roughness: 0.74,
      clearcoat: 0.2,
      clearcoatRoughness: 0.44,
      specularIntensity: 0.24,
      sheen: 0.025,
      sheenRoughness: 0.68,
      userData: {
        surfaceRole: 'ivory',
        surfaceVersion: 'premium-surfaces-test',
        microSurface: 'stable-scene-only',
      },
    };
    const lightTile = {
      color: new THREE.Color(0xeee2c9),
      envMapIntensity: 0.03,
      roughness: 0.78,
      clearcoat: 0.1,
      clearcoatRoughness: 0.48,
      specularIntensity: 0.3,
      userData: {
        surfaceRole: 'board-light',
        surfaceVersion: 'premium-surfaces-test',
      },
    };

    const scene = { userData: {} };
    const boardRoot = {
      parent: scene,
      traverse(callback) {
        callback(lightTileMesh);
        callback(ivoryMesh);
      },
    };
    const lightTileMesh = { isMesh: true, material: lightTile, parent: boardRoot };
    const ivoryMesh = { isMesh: true, material: ivory, parent: boardRoot };
    scene.traverse = (callback) => callback(lightTileMesh);

    const beforeIvory = snapshotPbr(ivory);
    const beforeTile = snapshotPbr(lightTile);
    const result = applyWarRoomMaterialGrade(scene);

    expect(result).toMatchObject({
      adjusted: 1,
      ivory: 1,
      canonicalIvory: 1,
      lightTile: 1,
      canonicalLightTile: 1,
    });
    expect(snapshotPbr(ivory)).toEqual(beforeIvory);
    expect(ivory.userData).toEqual({
      surfaceRole: 'ivory',
      surfaceVersion: 'premium-surfaces-test',
      microSurface: 'stable-scene-only',
    });

    const afterTile = snapshotPbr(lightTile);
    expect(afterTile.color).toBe(beforeTile.color);
    expect(afterTile).toMatchObject({
      envMapIntensity: 0.08,
      roughness: 0.7,
      clearcoat: 0.18,
      clearcoatRoughness: 0.36,
      specularIntensity: 0.38,
    });
    expect(lightTile.userData).toMatchObject({
      surfaceRole: 'board-light',
      surfaceVersion: 'premium-surfaces-test',
      warRoomSurfaceGrade: 'luminous-light-tile-v1',
      warRoomIblGrade: 'luminous-satin-v1',
    });
    expect(scene.userData).toMatchObject({
      warRoomCanonicalIvoryProtected: 1,
      warRoomCanonicalLightTile: 1,
      warRoomSurfaceGrade: 'luminous-satin-v1',
    });
  });
});
