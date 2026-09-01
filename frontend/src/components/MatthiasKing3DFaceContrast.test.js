import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildMatthiasKing3D } from './MatthiasKing3D.js';

function disposeGroup(group) {
  const geometries = new Set();
  const materials = new Set();
  group.traverse((node) => {
    if (node.geometry && !geometries.has(node.geometry)) {
      geometries.add(node.geometry);
      node.geometry.dispose();
    }
    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of list) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      if (material.userData?.matthiasOwnedMaterial) material.dispose();
    }
  });
}

function brightness(material) {
  const { r, g, b } = material.color;
  return r + g + b;
}

describe('Matthias black king face contrast', () => {
  it('keeps a pale face and readable features above the dark command uniform', () => {
    const main = new THREE.MeshPhysicalMaterial({ color: 0x22252a });
    const accent = new THREE.MeshPhysicalMaterial({ color: 0xa43631, metalness: 0.7 });
    const group = buildMatthiasKing3D(main, accent, { pieceColor: 'b', skinId: 'delta' });
    const face = group.getObjectByName('matthias-face');
    const nose = group.getObjectByName('matthias-nose');
    const jacket = group.getObjectByName('matthias-command-jacket');
    const eye = group.getObjectByName('matthias-eye-left');
    const brow = group.getObjectByName('matthias-brow-left');
    const mouth = group.getObjectByName('matthias-mouth');

    expect(face.material.color.getHex()).toBe(0xeee1c9);
    expect(nose.material.color.getHex()).toBe(0xbda78b);
    expect(brightness(face.material)).toBeGreaterThan(brightness(jacket.material) * 2.5);
    expect(brightness(face.material)).toBeGreaterThan(brightness(eye.material) * 8);
    expect(brow.material).toBe(eye.material);
    expect(mouth.material).toBe(eye.material);

    disposeGroup(group);
    main.dispose();
    accent.dispose();
  });
});
