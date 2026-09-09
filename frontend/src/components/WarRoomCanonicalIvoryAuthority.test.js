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
  it('keeps Board3DSurfaces-versioned ivory untouched while still grading light tiles', () => {
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
      envMapIntensity: 0.5,
      roughness: 0.68,
      clearcoat: 0.18,
      clearcoatRoughness: 0.38,
      specularIntensity: 0.4,
      userData: { surfaceRole: 'board-light' },
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

    expect(result).toMatchObject({ adjusted: 1, ivory: 1, canonicalIvory: 1, lightTile: 1 });
    expect(snapshotPbr(ivory)).toEqual(beforeIvory);
    expect(ivory.userData).toEqual({
      surfaceRole: 'ivory',
      surfaceVersion: 'premium-surfaces-test',
      microSurface: 'stable-scene-only',
    });
    expect(snapshotPbr(lightTile)).not.toEqual(beforeTile);
    expect(lightTile.userData.warRoomSurfaceGrade).toBe('muted-light-tile-v2');
    expect(scene.userData.warRoomCanonicalIvoryProtected).toBe(1);
  });
});
