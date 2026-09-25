import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { installTeutonicWarRoomDecor } from './WarRoomTeutonicDecor.js';

function meshesNamed(root, name) {
  const result = [];
  root?.traverse?.((child) => {
    if (child?.isMesh && child.name === name) result.push(child);
  });
  return result;
}

function disposeScene(root) {
  const geometries = new Set();
  const materials = new Set();
  root?.traverse?.((child) => {
    if (child?.geometry) geometries.add(child.geometry);
    const list = Array.isArray(child?.material) ? child.material : [child?.material];
    list.forEach((material) => {
      if (material) materials.add(material);
    });
  });
  geometries.forEach((geometry) => geometry.dispose?.());
  materials.forEach((material) => {
    for (const value of Object.values(material)) {
      if (value?.isTexture) value.dispose?.();
    }
    material.dispose?.();
  });
}

describe('WarRoomTeutonicDecor construction geometry', () => {
  it('reuses identical BoxGeometry inside each procedural group', () => {
    const root = new THREE.Group();
    expect(installTeutonicWarRoomDecor(root, { wallZ: -6.5, towardBoard: 1, coarsePointer: false })).toBe(2);

    const mortar = meshesNamed(root, 'war-room-teutonic-mortar-course');
    expect(mortar).toHaveLength(14);
    expect(new Set(mortar.map((mesh) => mesh.geometry)).size).toBe(1);
    expect(mortar[0].geometry.userData.warRoomGroupSharedGeometry).toBe('teutonic-box-pool-v1');

    const leftArmor = root.getObjectByName('war-room-teutonic-armor-left');
    const breastFlutes = meshesNamed(leftArmor, 'war-room-armor-breast-flute');
    expect(breastFlutes).toHaveLength(4);
    expect(new Set(breastFlutes.map((mesh) => mesh.geometry)).size).toBe(1);

    const sword = leftArmor.getObjectByName('war-room-zweihander');
    const gripWraps = meshesNamed(sword, 'war-room-zweihander-grip-wrap');
    expect(gripWraps).toHaveLength(6);
    expect(new Set(gripWraps.map((mesh) => mesh.geometry)).size).toBe(1);

    disposeScene(root);
  });
});
