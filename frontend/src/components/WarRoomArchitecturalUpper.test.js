import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installWarRoomArchitecturalUpper } from './WarRoomArchitecturalUpper.js';
import { addPremiumWarRoomPaintings } from './WarRoomPremiumPaintings.js';

function meshes(root) {
  const result = [];
  root.traverse((object) => {
    if (object.isMesh) result.push(object);
  });
  return result;
}

function namedCount(root, name) {
  let count = 0;
  root.traverse((object) => {
    if (object.name === name) count += 1;
  });
  return count;
}

function lightCount(root) {
  let count = 0;
  root.traverse((object) => {
    if (object.isLight) count += 1;
  });
  return count;
}

function dispose(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      material.dispose?.();
    }
  });
}

describe('War Room architectural upper framing', () => {
  it('suggests a 19-mesh hammerbeam roof only in the far camera-clear zone', () => {
    const group = new THREE.Group();
    const wallZ = -7.6;
    const towardBoard = 1;
    const added = installWarRoomArchitecturalUpper(group, {
      wallZ,
      towardBoard,
      coarsePointer: false,
    });

    expect(added).toBe(19);
    expect(group.userData.warRoomUpperArchitecture).toBe('hammerbeam-v6');
    expect(group.userData.warRoomUpperArchitectureMeshBudget).toBe(19);
    expect(group.userData.warRoomUpperArchitectureMaxOffsetFromWall).toBeLessThan(3.5);

    const layer = group.getObjectByName('war-room-upper-architecture');
    expect(layer).toBeInstanceOf(THREE.Group);
    expect(layer.userData.warRoomUpperArchitectureZone).toBe('far-third-camera-clear');
    expect(namedCount(layer, 'war-room-hammerbeam-transverse')).toBe(3);
    expect(namedCount(layer, 'war-room-hammerbeam-brace')).toBe(6);
    expect(namedCount(layer, 'war-room-hammerbeam-corbel')).toBe(6);
    expect(namedCount(layer, 'war-room-hammerbeam-longitudinal')).toBe(4);

    const roofMeshes = meshes(layer);
    expect(roofMeshes).toHaveLength(19);
    expect(lightCount(layer)).toBe(0);
    for (const mesh of roofMeshes) {
      expect(mesh.castShadow).toBe(false);
      expect(mesh.receiveShadow).toBe(false);
      expect(mesh.position.y).toBeGreaterThan(4.7);
      const offsetFromWall = Math.abs(mesh.position.z - wallZ);
      expect(offsetFromWall).toBeLessThan(3.2);
    }

    expect(installWarRoomArchitecturalUpper(group, {
      wallZ,
      towardBoard,
      coarsePointer: false,
    })).toBe(0);
    expect(meshes(layer)).toHaveLength(19);

    dispose(group);
  });

  it('adds no upper architecture on coarse/mobile profiles', () => {
    const group = new THREE.Group();
    expect(installWarRoomArchitecturalUpper(group, {
      wallZ: -7.6,
      towardBoard: 1,
      coarsePointer: true,
    })).toBe(0);
    expect(group.children).toHaveLength(0);
    expect(group.userData.warRoomUpperArchitecture).toBeUndefined();
  });

  it('is installed through the existing premium museum pass on desktop', () => {
    const group = new THREE.Group();
    expect(addPremiumWarRoomPaintings(group, {
      wallZ: -7.6,
      towardBoard: 1,
      coarsePointer: false,
    })).toBe(2);

    const upper = group.getObjectByName('war-room-upper-architecture');
    expect(upper).toBeTruthy();
    expect(group.userData.warRoomUpperArchitecture).toBe('hammerbeam-v6');
    expect(group.userData.warRoomUpperArchitectureMeshBudget).toBe(19);
    expect(group.userData.warRoomPracticalLightCount).toBe(2);

    dispose(group);
  });
});
