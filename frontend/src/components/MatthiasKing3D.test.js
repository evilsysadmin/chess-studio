import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildMatthiasKing3D, isMatthiasRivalKing } from './MatthiasKing3D.js';

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

describe('Matthias rival king 3D', () => {
  it('sólo sustituye al rey del color rival', () => {
    expect(isMatthiasRivalKing({ type: 'k', color: 'b' }, 'b')).toBe(true);
    expect(isMatthiasRivalKing({ type: 'k', color: 'w' }, 'b')).toBe(false);
    expect(isMatthiasRivalKing({ type: 'p', color: 'b' }, 'b')).toBe(false);
    expect(isMatthiasRivalKing({ type: 'k', color: 'b' }, null)).toBe(false);
  });

  it('usa cuerpo reglamentario de rey con una cara más expresiva y gorra de oficial ladeada', () => {
    const main = new THREE.MeshPhysicalMaterial({ color: 0xe1c99f });
    const accent = new THREE.MeshPhysicalMaterial({ color: 0xb88a35, metalness: 0.7 });
    const group = buildMatthiasKing3D(main, accent);
    let meshes = 0;
    group.traverse((node) => { if (node.isMesh) meshes += 1; });

    expect(group.name).toBe('matthias-rival-king');
    expect(group.userData.matthiasKing).toBe(true);
    expect(group.userData.faceStyle).toBe('permanent-scowl-v2');
    expect(group.userData.capStyle).toBe('crooked-officer-cap-v2');
    expect(meshes).toBeGreaterThanOrEqual(28);
    expect(group.scale.x).toBeCloseTo(1.03);
    expect(group.getObjectByName('matthias-king-body')).toBeTruthy();
    expect(group.getObjectByName('matthias-king-base-ring')).toBeTruthy();
    expect(group.getObjectByName('matthias-king-shoulder-ring')).toBeTruthy();
    expect(group.getObjectByName('matthias-face')).toBeTruthy();
    expect(group.getObjectByName('matthias-jaw-shadow')).toBeTruthy();
    expect(group.getObjectByName('matthias-eye-white-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-eye-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-brow-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-brow-crease-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-cheek-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-mouth-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-face-scar')).toBeTruthy();
    expect(group.getObjectByName('matthias-officer-cap')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-band')).toBeTruthy();
    expect(group.getObjectByName('matthias-visor')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-badge')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-badge-pawn-head')).toBeTruthy();

    // El cuerpo usa exactamente el material del bando; la identidad no debe
    // convertir una pieza blanca en una figura negra.
    expect(group.getObjectByName('matthias-king-body').material).toBe(main);

    disposeGroup(group);
    main.dispose();
    accent.dispose();
  });

  it('mantiene el ceño y la insignia de peón en móvil/coarse pointer', () => {
    const main = new THREE.MeshPhysicalMaterial({ color: 0xe1c99f });
    const accent = new THREE.MeshPhysicalMaterial({ color: 0xb88a35, metalness: 0.7 });
    const group = buildMatthiasKing3D(main, accent, { coarsePointer: true });

    expect(group.getObjectByName('matthias-brow-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-brow-right')).toBeTruthy();
    expect(group.getObjectByName('matthias-mouth-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-mouth-right')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-badge')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-badge-pawn-body')).toBeTruthy();
    expect(group.getObjectByName('matthias-face-scar')).toBeFalsy();

    disposeGroup(group);
    main.dispose();
    accent.dispose();
  });
});
