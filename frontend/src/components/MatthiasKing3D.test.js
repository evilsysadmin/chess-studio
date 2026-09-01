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

  it('usa cuerpo de rey, rig de cabeza, ceño limpio y gorra de plato', () => {
    const main = new THREE.MeshPhysicalMaterial({ color: 0xe1c99f });
    const accent = new THREE.MeshPhysicalMaterial({ color: 0xb88a35, metalness: 0.7 });
    const group = buildMatthiasKing3D(main, accent, { pieceColor: 'w', skinId: 'studio' });
    let meshes = 0;
    group.traverse((node) => { if (node.isMesh) meshes += 1; });

    expect(group.name).toBe('matthias-rival-king');
    expect(group.userData.matthiasKing).toBe(true);
    expect(group.userData.faceStyle).toBe('clean-command-scowl-v4');
    expect(group.userData.capStyle).toBe('command-peaked-cap-v3');
    expect(group.userData.posture).toBe('proud-command-v1');
    expect(group.userData.motionRig).toBe('head-rig-v1');
    expect(meshes).toBeGreaterThanOrEqual(24);
    expect(group.scale.x).toBeCloseTo(1.035);
    expect(group.getObjectByName('matthias-king-body')).toBeTruthy();
    expect(group.getObjectByName('matthias-command-jacket')).toBeTruthy();
    expect(group.getObjectByName('matthias-command-sash')).toBeTruthy();
    expect(group.getObjectByName('matthias-epaulette-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-head-rig')).toBeTruthy();
    expect(group.getObjectByName('matthias-face')).toBeTruthy();
    expect(group.getObjectByName('matthias-eye-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-brow-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-mouth')).toBeTruthy();
    expect(group.getObjectByName('matthias-officer-cap')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap')).toBeTruthy();
    expect(group.getObjectByName('matthias-visor')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-badge-pawn-head')).toBeTruthy();

    // No vuelva el Frankenstein de micro-geometrías faciales que se apilaban
    // al reducir el rey a tamaño de tablero.
    expect(group.getObjectByName('matthias-brow-crease-left')).toBeFalsy();
    expect(group.getObjectByName('matthias-cheek-left')).toBeFalsy();
    expect(group.getObjectByName('matthias-mouth-left')).toBeFalsy();
    expect(group.getObjectByName('matthias-mouth-right')).toBeFalsy();
    expect(group.getObjectByName('matthias-lower-lip-crease')).toBeFalsy();
    expect(group.getObjectByName('matthias-proud-chin')).toBeFalsy();

    expect(group.getObjectByName('matthias-king-body').material).toBe(main);

    disposeGroup(group);
    main.dispose();
    accent.dispose();
  });

  it('mantiene cejas, ojos y boca separados verticalmente a escala de tablero', () => {
    const main = new THREE.MeshPhysicalMaterial({ color: 0xe1c99f });
    const accent = new THREE.MeshPhysicalMaterial({ color: 0xb88a35, metalness: 0.7 });
    const group = buildMatthiasKing3D(main, accent);
    const brow = group.getObjectByName('matthias-brow-left');
    const eye = group.getObjectByName('matthias-eye-left');
    const mouth = group.getObjectByName('matthias-mouth');

    expect(brow.position.y - eye.position.y).toBeGreaterThan(0.045);
    expect(eye.position.y - mouth.position.y).toBeGreaterThan(0.085);
    expect(brow.geometry.parameters.width).toBeLessThanOrEqual(0.105);
    expect(mouth.geometry.parameters.height).toBeLessThanOrEqual(0.012);

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

  it('mantiene la cara mínima e insignia de peón en móvil/coarse pointer', () => {
    const main = new THREE.MeshPhysicalMaterial({ color: 0xe1c99f });
    const accent = new THREE.MeshPhysicalMaterial({ color: 0xb88a35, metalness: 0.7 });
    const group = buildMatthiasKing3D(main, accent, { coarsePointer: true });

    expect(group.getObjectByName('matthias-brow-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-brow-right')).toBeTruthy();
    expect(group.getObjectByName('matthias-eye-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-eye-right')).toBeTruthy();
    expect(group.getObjectByName('matthias-mouth')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-badge')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-badge-pawn-body')).toBeTruthy();

    disposeGroup(group);
    main.dispose();
    accent.dispose();
  });
});
