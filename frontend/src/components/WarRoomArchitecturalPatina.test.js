import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installWarRoomArchitecturalPatina } from './WarRoomArchitecturalPatina.js';
import { buildCastleArchitectureLayer } from './WarRoomCastleArchitecture.js';

function createConsoleRoot() {
  const root = new THREE.Group();
  const left = new THREE.Group();
  const right = new THREE.Group();
  left.name = 'war-room-side-console-left';
  right.name = 'war-room-side-console-right';
  root.add(left, right);
  return { root, left, right };
}

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

describe('War Room lived-in architectural patina', () => {
  it('breaks showroom symmetry with exactly ten shadow-free field props', () => {
    const { root, left, right } = createConsoleRoot();
    const added = installWarRoomArchitecturalPatina(root, { coarsePointer: false });

    expect(added).toBe(10);
    expect(root.userData.warRoomLivedInPatina).toBe('v7-asymmetric-field-use');
    expect(root.userData.warRoomLivedInPropCount).toBe(10);
    expect(left.userData.warRoomLivedInSide).toBe('dispatch-work');
    expect(right.userData.warRoomLivedInSide).toBe('drink-and-maps');

    expect(left.getObjectByName('war-room-lived-in-dispatch-case')).toBeTruthy();
    expect(left.getObjectByName('war-room-lived-in-mug')).toBeFalsy();
    expect(left.getObjectByName('war-room-lived-in-map-tube')).toBeFalsy();
    expect(right.getObjectByName('war-room-lived-in-dispatch-case')).toBeFalsy();
    expect(right.getObjectByName('war-room-lived-in-mug')).toBeTruthy();
    expect(right.getObjectByName('war-room-lived-in-map-tube')).toBeTruthy();

    expect(namedCount(left, 'war-room-dispatch-case-clasp')).toBe(1);
    expect(namedCount(right, 'war-room-field-mug-body')).toBe(1);
    expect(namedCount(right, 'war-room-field-mug-handle')).toBe(1);
    expect(namedCount(right, 'war-room-field-mug-coffee')).toBe(1);
    expect(namedCount(right, 'war-room-map-tube-cap')).toBe(2);

    const props = meshes(root);
    expect(props).toHaveLength(10);
    for (const mesh of props) {
      expect(mesh.castShadow).toBe(false);
      expect(mesh.receiveShadow).toBe(false);
    }

    expect(installWarRoomArchitecturalPatina(root, { coarsePointer: false })).toBe(0);
    expect(meshes(root)).toHaveLength(10);
    dispose(root);
  });

  it('does not add patina to coarse/mobile or incomplete furniture roots', () => {
    const mobile = createConsoleRoot();
    expect(installWarRoomArchitecturalPatina(mobile.root, { coarsePointer: true })).toBe(0);
    expect(meshes(mobile.root)).toHaveLength(0);
    expect(mobile.root.userData.warRoomLivedInPatina).toBeUndefined();

    const incomplete = new THREE.Group();
    const onlyLeft = new THREE.Group();
    onlyLeft.name = 'war-room-side-console-left';
    incomplete.add(onlyLeft);
    expect(installWarRoomArchitecturalPatina(incomplete, { coarsePointer: false })).toBe(0);
    expect(incomplete.userData.warRoomLivedInPatina).toBeUndefined();
  });

  it('is installed in the real castle architecture after side consoles exist', () => {
    const layer = buildCastleArchitectureLayer({
      wallZ: -7.6,
      towardBoard: 1,
      coarsePointer: false,
    });

    const left = layer.getObjectByName('war-room-side-console-left');
    const right = layer.getObjectByName('war-room-side-console-right');
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
    expect(layer.userData.warRoomLivedInPatina).toBe('v7-asymmetric-field-use');
    expect(layer.userData.warRoomLivedInPropCount).toBe(10);
    expect(left.getObjectByName('war-room-lived-in-dispatch-case')).toBeTruthy();
    expect(right.getObjectByName('war-room-lived-in-mug')).toBeTruthy();
    expect(right.getObjectByName('war-room-lived-in-map-tube')).toBeTruthy();

    dispose(layer);
  });
});
