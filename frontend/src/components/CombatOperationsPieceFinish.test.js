import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPiece } from './Board3DPieces.js';
import {
  applyCombatOperationsPieceFinish,
  COMBAT_OPERATIONS_PIECE_FINISH,
} from './CombatOperationsPieceFinish.js';

function firstPhysicalMaterial(group) {
  let found = null;
  group.traverse((object) => {
    if (!found && object.material?.isMeshPhysicalMaterial) found = object.material;
  });
  return found;
}

function mainFinishMaterials(group) {
  const materials = new Set();
  group.traverse((object) => {
    const material = object.material;
    if (material?.userData?.combatOperationsPieceFinish) materials.add(material);
  });
  return [...materials];
}

describe('Combat Operations · veteran satin finish', () => {
  it('is strictly opt-in: playable chess and every non-Combat skin stay canonical', () => {
    for (const color of ['w', 'b']) {
      for (const coarsePointer of [false, true]) {
        const classic = buildPiece('p', color, 'studio', coarsePointer);
        expect(mainFinishMaterials(classic)).toHaveLength(0);
        const combat = buildPiece('p', color, 'studio', coarsePointer, { combatOperationsFinish: true });
        expect(mainFinishMaterials(combat).length).toBeGreaterThanOrEqual(1);
        expect(mainFinishMaterials(combat)[0].userData.combatOperationsPieceFinish)
          .toBe(COMBAT_OPERATIONS_PIECE_FINISH);
      }
    }
  });

  it('uses contrast-focused PBR on white and charcoal, not emissive overlays', () => {
    for (const side of ['w', 'b']) {
      const ordinary = buildPiece('p', side, 'studio', true);
      const battle = buildPiece('p', side, 'studio', true, { combatOperationsFinish: true });
      const canonical = firstPhysicalMaterial(ordinary);
      const finished = mainFinishMaterials(battle)[0];
      expect(finished.isMeshPhysicalMaterial).toBe(true);
      expect(finished.color.getHex()).not.toBe(canonical.color.getHex());
      const canonicalLuma = canonical.color.r * 0.2126 + canonical.color.g * 0.7152 + canonical.color.b * 0.0722;
      const combatLuma = finished.color.r * 0.2126 + finished.color.g * 0.7152 + finished.color.b * 0.0722;
      if (side === 'w') expect(combatLuma).toBeLessThan(canonicalLuma * 0.76);
      else expect(combatLuma).toBeGreaterThan(canonicalLuma * 1.7);
      expect(finished.roughness).toBeGreaterThanOrEqual(side === 'w' ? 0.73 : 0.47);
      expect(finished.clearcoat).toBeLessThanOrEqual(side === 'w' ? 0.23 : 0.58);
      expect(finished.emissive.getHex()).toBe(canonical.emissive.getHex());
      expect(finished.emissiveIntensity).toBe(canonical.emissiveIntensity);
      expect(finished.map).toBeNull();
      expect(finished.bumpMap).toBeNull();
    }
  });

  it('does not modify invalid or already-shared nonphysical material inputs', () => {
    const inert = new THREE.MeshBasicMaterial({ color: 0x223344 });
    expect(applyCombatOperationsPieceFinish(inert, 'w')).toBe(inert);
    expect(inert.color.getHex()).toBe(0x223344);
    expect(inert.userData.combatOperationsPieceFinish).toBeUndefined();
  });

  it('preserves king and knight silhouette and stays on the material owner', () => {
    for (const type of ['n', 'k']) {
      const piece = buildPiece(type, 'w', 'studio', false, { combatOperationsFinish: true });
      expect(mainFinishMaterials(piece).length).toBeGreaterThanOrEqual(1);
      expect(piece.userData.board3DRenderableMeshCount).toBeGreaterThan(0);
    }
  });
});
