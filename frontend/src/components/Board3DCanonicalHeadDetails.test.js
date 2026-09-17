import { describe, expect, it } from 'vitest';
import { buildPiece, disposeObject } from './Board3DPieces.js';

function meshesBy(root, predicate) {
  const matches = [];
  root.traverse((child) => {
    if (child?.isMesh && predicate(child)) matches.push(child);
  });
  return matches;
}

function luminance(color) {
  return (color.r * 0.2126) + (color.g * 0.7152) + (color.b * 0.0722);
}

describe('War Room canonical rook and knight head details', () => {
  it('da al caballo blanco la crin dorada aprobada sin recolorear la cabeza', () => {
    const knight = buildPiece('n', 'w', 'studio', false);
    const details = meshesBy(knight, (mesh) => Boolean(mesh.userData?.knightSculptDetail));
    const mane = details.find((mesh) => mesh.userData.knightSculptDetail === 'mane-ridge');
    const baseSlot = details.find((mesh) => mesh.userData.knightSculptDetail === 'base-slot');
    const head = meshesBy(knight, (mesh) => Boolean(mesh.userData?.knightHeadProfile))[0];

    expect(mane).toBeTruthy();
    expect(baseSlot).toBeTruthy();
    expect(head).toBeTruthy();
    expect(mane.material).toBe(baseSlot.material);
    expect(mane.material).not.toBe(head.material);
    expect(mane.userData.knightManeFinish).toBe('gold-crest-v1');
    expect(knight.userData.board3DKnightManeFinish).toBe('gold-crest-v1');

    disposeObject(knight);
  });

  it('oscurece sólo las seis almenas blancas de la torre y mantiene la corona sin remate', () => {
    const rook = buildPiece('r', 'w', 'studio', false);
    const blackRook = buildPiece('r', 'b', 'studio', false);
    const battlements = meshesBy(rook, (mesh) => mesh.userData?.rookPart === 'battlement');
    const crownBase = meshesBy(rook, (mesh) => mesh.userData?.rookPart === 'crown-base')[0];
    const finials = meshesBy(rook, (mesh) => mesh.userData?.rookPart === 'finial');

    expect(battlements).toHaveLength(6);
    expect(crownBase).toBeTruthy();
    expect(finials).toHaveLength(0);
    expect(rook.userData.whiteRookBattlementCount).toBe(6);
    expect(rook.userData.whiteRookCrownContrast).toBe('six-shadowed-crenellations-v1');
    expect(battlements.every((mesh) => mesh.userData.whiteRookBattlement === 'shadowed-crenellation-v1')).toBe(true);
    expect(battlements.every((mesh) => mesh.material === battlements[0].material)).toBe(true);
    expect(luminance(battlements[0].material.color)).toBeLessThan(luminance(crownBase.material.color) * 0.9);
    expect(blackRook.userData.whiteRookBattlementCount).toBeUndefined();

    [rook, blackRook].forEach(disposeObject);
  });
});
