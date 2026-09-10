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
  it('keeps the expanded desktop ceiling zone open with no hammerbeams', () => {
    const group = new THREE.Group();
    const wallZ = -7.6;
    const towardBoard = 1;
    const added = installWarRoomArchitecturalUpper(group, {
      wallZ,
      towardBoard,
      coarsePointer: false,
    });

    expect(added).toBe(0);
    expect(group.userData.warRoomUpperArchitecture).toBe('open-ceiling-v9-canonical');
    expect(group.userData.warRoomUpperArchitectureMeshBudget).toBe(0);
    expect(group.userData.warRoomRetiredUpperMeshesOmitted).toBe(19);
    expect(group.userData.warRoomUpperArchitectureMaxOffsetFromWall).toBe(0);
    expect(group.userData.warRoomCeilingBeamsRemoved).toBe(true);
    expect(group.userData.warRoomMonogramFree).toBe(true);

    const layer = group.getObjectByName('war-room-upper-architecture');
    expect(layer).toBeInstanceOf(THREE.Group);
    expect(layer.userData.warRoomUpperArchitectureZone).toBe('open-ceiling-camera-clear');
    expect(layer.userData.warRoomCeilingBeamsRemoved).toBe(true);
    expect(namedCount(layer, 'war-room-hammerbeam-transverse')).toBe(0);
    expect(namedCount(layer, 'war-room-hammerbeam-brace')).toBe(0);
    expect(namedCount(layer, 'war-room-hammerbeam-side-tie')).toBe(0);
    expect(namedCount(layer, 'war-room-hammerbeam-corbel')).toBe(0);
    expect(namedCount(layer, 'war-room-hammerbeam-longitudinal')).toBe(0);
    expect(meshes(layer)).toHaveLength(0);

    expect(installWarRoomArchitecturalUpper(group, {
      wallZ,
      towardBoard,
      coarsePointer: false,
    })).toBe(0);
    expect(meshes(layer)).toHaveLength(0);

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

  it('keeps museum paintings while retiring all ceiling beams', () => {
    const group = new THREE.Group();
    expect(addPremiumWarRoomPaintings(group, {
      wallZ: -7.6,
      towardBoard: 1,
      coarsePointer: false,
    })).toBe(2);

    const upper = group.getObjectByName('war-room-upper-architecture');
    expect(upper).toBeTruthy();
    expect(group.userData.warRoomUpperArchitecture).toBe('open-ceiling-v9-canonical');
    expect(group.userData.warRoomUpperArchitectureMeshBudget).toBe(0);
    expect(group.userData.warRoomCeilingBeamsRemoved).toBe(true);
    expect(namedCount(upper, 'war-room-hammerbeam-transverse')).toBe(0);
    expect(namedCount(upper, 'war-room-hammerbeam-longitudinal')).toBe(0);
    expect(meshes(upper)).toHaveLength(0);
    expect(group.userData.warRoomMonogramFree).toBe(true);
    expect(group.userData.warRoomPracticalLightCount).toBe(0);
    expect(group.userData.warRoomMuseumSideKeysOmitted).toBe(2);

    dispose(group);
  });
});
