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

  it('usa cuerpo de rey, rig de cabeza, ceño limpio y gorra de plato premium', () => {
    const main = new THREE.MeshPhysicalMaterial({ color: 0xe1c99f });
    const accent = new THREE.MeshPhysicalMaterial({ color: 0xb88a35, metalness: 0.7 });
    const group = buildMatthiasKing3D(main, accent, { pieceColor: 'w', skinId: 'studio' });
    let meshes = 0;
    group.traverse((node) => { if (node.isMesh) meshes += 1; });

    expect(group.name).toBe('matthias-rival-king');
    expect(group.userData.matthiasKing).toBe(true);
    expect(group.userData.faceStyle).toBe('command-fury-scowl-v6');
    expect(group.userData.capStyle).toBe('premium-command-peaked-cap-v6');
    expect(group.userData.posture).toBe('proud-command-v2');
    expect(group.userData.motionRig).toBe('head-rig-v1');
    expect(meshes).toBeGreaterThanOrEqual(28);
    expect(group.scale.x).toBeCloseTo(1.035);
    expect(group.getObjectByName('matthias-king-body')).toBeTruthy();
    expect(group.getObjectByName('matthias-command-jacket')).toBeTruthy();
    expect(group.getObjectByName('matthias-command-sash')).toBeTruthy();
    expect(group.getObjectByName('matthias-epaulette-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-head-rig')).toBeTruthy();
    expect(group.getObjectByName('matthias-face')).toBeTruthy();
    expect(group.getObjectByName('matthias-eye-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-eye-white-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-brow-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-mouth')).toBeTruthy();
    expect(group.getObjectByName('matthias-officer-cap')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-crown')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-top')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-crown-break')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-band-fill')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-band')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-red-piping')).toBeTruthy();
    expect(group.getObjectByName('matthias-visor')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-cord')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-badge')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-badge-inset')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-badge-gem')).toBeTruthy();

    const capGroup = group.getObjectByName('matthias-officer-cap');
    const visor = group.getObjectByName('matthias-visor');
    const cap = group.getObjectByName('matthias-cap');
    const crown = group.getObjectByName('matthias-cap-crown');
    const cord = group.getObjectByName('matthias-cap-cord');
    visor.geometry.computeBoundingBox();
    const visorBox = visor.geometry.boundingBox;
    const visorWidth = visorBox.max.x - visorBox.min.x;
    const visorProjection = visorBox.max.y - visorBox.min.y;

    expect(capGroup.userData.faceClearance).toBe('eyes-and-brows-visible');
    expect(capGroup.userData.silhouette).toBe('home-hero-plate-cap');
    expect(capGroup.userData.reference).toBe('home-command-cap-v2');
    expect(capGroup.userData.crownFlare).toBe('structured-high-flare');
    expect(capGroup.position.y).toBeGreaterThanOrEqual(1.16);
    expect(visor.userData.compactForFaceVisibility).toBe(true);
    expect(visor.userData.shortPremiumBrim).toBe(true);
    expect(visor.geometry.type).toBe('ExtrudeGeometry');
    expect(visorWidth).toBeLessThanOrEqual(0.35);
    expect(visorProjection).toBeLessThanOrEqual(0.16);
    expect(cap.geometry.parameters.radiusTop).toBeLessThanOrEqual(0.21);
    expect(crown.geometry.parameters.radiusTop).toBeGreaterThanOrEqual(0.265);
    expect(crown.geometry.parameters.height).toBeGreaterThanOrEqual(0.13);
    expect(crown.geometry.parameters.radiusTop / cap.geometry.parameters.radiusTop).toBeGreaterThanOrEqual(1.29);
    expect(group.getObjectByName('matthias-cap-top').position.y).toBeGreaterThanOrEqual(0.22);
    expect(Math.abs(capGroup.rotation.x)).toBeGreaterThanOrEqual(0.02);
    expect(cord.geometry.type).toBe('TubeGeometry');

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

    expect(brow.position.y - eye.position.y).toBeGreaterThan(0.038);
    expect(eye.position.y - mouth.position.y).toBeGreaterThan(0.085);
    expect(brow.geometry.parameters.width).toBeLessThanOrEqual(0.105);
    expect(mouth.geometry.parameters.height).toBeLessThanOrEqual(0.012);

    disposeGroup(group);
    main.dispose();
    accent.dispose();
  });

  it('lee cabreado y orgulloso, no cansado o triste', () => {
    const main = new THREE.MeshPhysicalMaterial({ color: 0xe1c99f });
    const accent = new THREE.MeshPhysicalMaterial({ color: 0xb88a35, metalness: 0.7 });
    const group = buildMatthiasKing3D(main, accent);
    const headRig = group.getObjectByName('matthias-head-rig');
    const face = group.getObjectByName('matthias-face');
    const leftEye = group.getObjectByName('matthias-eye-left');
    const rightEye = group.getObjectByName('matthias-eye-right');
    const leftBrow = group.getObjectByName('matthias-brow-left');
    const rightBrow = group.getObjectByName('matthias-brow-right');
    const mouth = group.getObjectByName('matthias-mouth');

    expect(headRig.userData.expression).toBe('command-fury-v2');
    expect(face.scale.x).toBeGreaterThan(1.04);
    expect(face.scale.y).toBeGreaterThan(0.92);
    expect(face.scale.y).toBeLessThan(0.96);

    expect(leftEye.rotation.z).toBeLessThan(-0.07);
    expect(rightEye.rotation.z).toBeGreaterThan(0.07);
    expect(leftBrow.rotation.z).toBeLessThan(-0.40);
    expect(rightBrow.rotation.z).toBeGreaterThan(0.40);
    expect(leftEye.scale.y).toBeLessThan(0.42);
    expect(rightEye.scale.y).toBeLessThan(0.42);

    expect(mouth.geometry.parameters.width).toBeLessThanOrEqual(0.105);
    expect(Math.abs(mouth.rotation.z)).toBeGreaterThan(0.04);
    expect(Math.abs(mouth.rotation.z)).toBeLessThan(0.07);

    disposeGroup(group);
    main.dispose();
    accent.dispose();
  });

  it('viste antracita legible, no negro funerario, cuando Matthias juega con negras', () => {
    const main = new THREE.MeshPhysicalMaterial({ color: 0x22252a });
    const accent = new THREE.MeshPhysicalMaterial({ color: 0xa43631, metalness: 0.7 });
    const group = buildMatthiasKing3D(main, accent, { pieceColor: 'b', skinId: 'delta' });
    const jacket = group.getObjectByName('matthias-command-jacket');
    const sash = group.getObjectByName('matthias-command-sash');

    expect(jacket).toBeTruthy();
    expect(sash).toBeTruthy();
    expect(jacket.material.color.getHex()).toBe(0x2c3036);
    expect(sash.material.color.getHex()).toBe(0x59393b);
    expect(jacket.material.color.r + jacket.material.color.g + jacket.material.color.b).toBeGreaterThan(0.07);
    expect(group.userData.pieceColor).toBe('b');
    expect(group.userData.skinId).toBe('delta');

    disposeGroup(group);
    main.dispose();
    accent.dispose();
  });

  it('mantiene la cara mínima y la gorra premium en móvil/coarse pointer', () => {
    const main = new THREE.MeshPhysicalMaterial({ color: 0xe1c99f });
    const accent = new THREE.MeshPhysicalMaterial({ color: 0xb88a35, metalness: 0.7 });
    const group = buildMatthiasKing3D(main, accent, { coarsePointer: true });

    expect(group.getObjectByName('matthias-brow-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-brow-right')).toBeTruthy();
    expect(group.getObjectByName('matthias-eye-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-eye-right')).toBeTruthy();
    expect(group.getObjectByName('matthias-eye-white-left')).toBeTruthy();
    expect(group.getObjectByName('matthias-eye-white-right')).toBeTruthy();
    expect(group.getObjectByName('matthias-mouth')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-cord')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-badge')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-badge-gem')).toBeTruthy();

    const visor = group.getObjectByName('matthias-visor');
    visor.geometry.computeBoundingBox();
    expect(visor.geometry.boundingBox.max.x - visor.geometry.boundingBox.min.x).toBeLessThanOrEqual(0.35);

    disposeGroup(group);
    main.dispose();
    accent.dispose();
  });
});
