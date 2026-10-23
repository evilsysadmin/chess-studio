import { describe, expect, it } from 'vitest';
import { buildPiece } from './Board3DPieces.js';
import { COMBAT_OPERATIONS_PIECE_FINISH } from './CombatOperationsPieceFinish.js';

// The campaign may share the 3D renderer with ordinary chess after navigation.
// Its satin finish must never mutate or outlive the canonical piece materials.
function physicalMaterials(piece) {
  const materials = new Set();
  piece.traverse((object) => {
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of entries) {
      if (material?.isMeshPhysicalMaterial) materials.add(material);
    }
  });
  return [...materials];
}

function materialFingerprint(material) {
  return {
    color: material.color.getHex(),
    roughness: material.roughness,
    metalness: material.metalness,
    clearcoat: material.clearcoat,
    envMapIntensity: material.envMapIntensity,
    emissive: material.emissive.getHex(),
    emissiveIntensity: material.emissiveIntensity,
  };
}

describe('Combat Operations · material isolation across room transitions', () => {
  it('restores unmodified canonical materials after Combat for every army class and rendering tier', () => {
    for (const type of ['p', 'n', 'b', 'r', 'q', 'k']) {
      for (const color of ['w', 'b']) {
        for (const coarsePointer of [false, true]) {
          const normalBefore = physicalMaterials(buildPiece(type, color, 'studio', coarsePointer));
          const operations = physicalMaterials(buildPiece(type, color, 'studio', coarsePointer, {
            combatOperationsFinish: true,
          }));
          const normalAfter = physicalMaterials(buildPiece(type, color, 'studio', coarsePointer));
          const label = `${color} ${type} / ${coarsePointer ? 'mobile' : 'desktop'}`;

          expect(normalBefore.length, label).toBeGreaterThan(0);
          expect(operations.length, label).toBeGreaterThan(0);
          expect(normalAfter.map(materialFingerprint), label).toEqual(normalBefore.map(materialFingerprint));

          expect(normalBefore.some((material) => material.userData.combatOperationsPieceFinish), label).toBe(false);
          expect(normalAfter.some((material) => material.userData.combatOperationsPieceFinish), label).toBe(false);
          expect(
            operations.some((material) => material.userData.combatOperationsPieceFinish === COMBAT_OPERATIONS_PIECE_FINISH),
            label,
          ).toBe(true);

          // Geometry may be shared for performance. Mutable PBR materials must not.
          for (const material of operations) {
            expect(normalBefore.includes(material), label).toBe(false);
            expect(normalAfter.includes(material), label).toBe(false);
          }
        }
      }
    }
  });

  it('keeps Matthias own 3D king material scoped to Combat too', () => {
    const opts = { matthiasKing: true, faceTowardCamera: true };
    const baseline = physicalMaterials(buildPiece('k', 'b', 'studio', false, opts));
    const campaign = physicalMaterials(buildPiece('k', 'b', 'studio', false, {
      ...opts, combatOperationsFinish: true,
    }));
    const again = physicalMaterials(buildPiece('k', 'b', 'studio', false, opts));

    expect(baseline.length).toBeGreaterThan(0);
    expect(campaign.some((material) =>
      material.userData.combatOperationsPieceFinish === COMBAT_OPERATIONS_PIECE_FINISH,
    )).toBe(true);
    expect(again.map(materialFingerprint)).toEqual(baseline.map(materialFingerprint));
    expect(again.some((material) => material.userData.combatOperationsPieceFinish)).toBe(false);
  });
});
