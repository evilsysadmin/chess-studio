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

  it('usa cuerpo de rey, postura orgullosa, ceño permanente y gorra de plato', () => {
    const main = new THREE.MeshPhysicalMaterial({ color: 0xe1c99f });
    const accent = new THREE.MeshPhysicalMaterial({ color: 0xb88a35, metalness: 0.7 });
    const group = buildMatthiasKing3D(main, accent, { pieceColor: 'w', skinId: 'studio' });
    let meshes = 0;
    group.traverse((node) => { if (node.isMesh) meshes += 1; });

    expect(group.name).toBe('matthias-rival-king');
    expect(group.userData.matthiasKing).toBe(true);
    expect(group.userData.faceStyle).toBe('proud-scowl-v3');
    expect(group.userData.capStyle).toBe('command-peaked-cap-v3');
    expect(group.userData.posture).toBe('proud-command-v1');
    expect(meshes).toBeGreaterThanOrEqual(35);
    expect(group.scale.x).toBeCloseTo(1.035);
    expect(group.getObjectByName('matthias-king-body')).toBeTruthy();
    expect(group.getObjectByName('matthias-command-jacket')).toBeTruthy();
    expect(group.getObjectByName('matthias-command-sash')).toBeTruthy();
    expect(group.getObjectByName('matthias-epaulette-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-face')).toBeTruthy();
    expect(group.getObjectByName('matthias-proud-chin')).toBeTruthy();
    expect(group.getObjectByName('matthias-eye-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-brow-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-mouth-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-face-scar')).toBeTruthy();
    expect(group.getObjectByName('matthias-officer-cap')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap')).toBeTruthy();
    expect(group.getObjectByName('matthias-visor')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-badge-pawn-head')).toBeTruthy();

    // El cuerpo reglamentario sigue usando exactamente el material del bando.
    expect(group.getObjectByName('matthias-king-body').material).toBe(main);

    disposeGroup(group);
    main.dispose();
    accent.dispose();
  });

  it('viste chaqueta oscura cuando Matthias juega con negras', () => {
    const main = new THREE.MeshPhysicalMaterial({ color: 0x22252a });
    const accent = new THREE.MeshPhysicalMaterial({ color: 0xa43631, metalness: 0.7 });
    const group = buildMatthiasKing3D(main, accent, { pieceColor: 'b', skinId: 'delta' });
    const jacket = group.getObjectByName('matthias-command-jacket');

    expect(jacket).toBeTruthy();
    expect(jacket.material.color.getHex()).toBe(0x171b22);
    expect(group.userData.pieceColor).toBe('b');
    expect(group.userData.skinId).toBe('delta');

    disposeGroup(group);
    main.dispose();
    accent.dispose();
  });

  it('mantiene ceño, boca dura e insignia de peón en móvil/coarse pointer', () => {
    const main = new THREE.MeshPhysicalMaterial({ color: 0xe1c99f });
    const accent = new THREE.MeshPhysicalMaterial({ color: 0xb88a35, metalness: 0.7 });
    const group = buildMatthiasKing3D(main, accent, { coarsePointer: true });

    expect(group.getObjectByName('matthias-brow-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-brow-right')).toBeTruthy();
    expect(group.getObjectByName('matthias-mouth-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-mouth-right')).toBeTruthy();
    expect(group.getObjectByName('matthias-proud-chin')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-badge')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-badge-pawn-body')).toBeTruthy();
    expect(group.getObjectByName('matthias-face-scar')).toBeFalsy();

    disposeGroup(group);
    main.dispose();
    accent.dispose();
  });
});
