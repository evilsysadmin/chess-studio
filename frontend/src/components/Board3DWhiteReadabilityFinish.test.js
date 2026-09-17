import { describe, expect, it } from 'vitest';
import { buildPiece, disposeObject } from './Board3DPieces.js';

function meshes(root, predicate) {
  const matches = [];
  root.traverse((child) => {
    if (child?.isMesh && predicate(child)) matches.push(child);
  });
  return matches;
}

describe('War Room white piece readability finish', () => {
  it('keeps pawn heads matte while giving white officers a stronger direct-light satin', () => {
    for (const type of ['p', 'n', 'b', 'r', 'q', 'k']) {
      const piece = buildPiece(type, 'w', 'studio', false);
      try {
        expect(piece.userData.whitePieceReadabilityFinish).toBe('walnut-pawn-matte-officer-satin-v3');
        expect(piece.userData.whitePieceWalnutRimCount).toBe(1);

        const rims = meshes(piece, (mesh) => mesh.userData?.whiteBaseWalnutRim === 'subtle-v1');
        expect(rims).toHaveLength(1);
        expect(rims[0].material.color.getHex()).toBe(0x513625);
        expect(rims[0].material.roughness).toBeGreaterThanOrEqual(0.74);
        expect(rims[0].material.clearcoat).toBeLessThanOrEqual(0.06);
        expect(rims[0].material.userData.surfaceRole).toBe('white-base-walnut');

        const body = meshes(piece, (mesh) => (
          mesh.material?.userData?.surfaceRole === 'ivory'
          && mesh.material?.userData?.whiteHeadFinish !== 'pawn-deep-matte-v2'
          && mesh.material?.userData?.whiteHeadFinish !== 'officer-satin-v2'
        ))[0];
        expect(body).toBeTruthy();

        if (type === 'p') {
          expect(piece.userData.whitePieceMatteHeadCount).toBeGreaterThan(0);
          expect(piece.userData.whitePieceSatinHeadCount).toBe(0);
          const heads = meshes(piece, (mesh) => mesh.userData?.whiteMatteHead === 'pawn-deep-matte-v2');
          expect(heads.length).toBeGreaterThan(0);
          for (const head of heads) {
            expect(head.material.userData.pieceFinish).toBe('matte-ivory-pawn-head-v2');
            expect(head.material.roughness).toBeGreaterThanOrEqual(0.92);
            expect(head.material.clearcoat).toBeLessThanOrEqual(0.035);
            expect(head.material.specularIntensity).toBeLessThanOrEqual(0.16);
            expect(head.material.envMapIntensity).toBe(0);
            expect(head.material.color.getHex()).toBe(body.material.color.getHex());
          }
        } else {
          expect(piece.userData.whitePieceMatteHeadCount).toBe(0);
          expect(piece.userData.whitePieceSatinHeadCount).toBeGreaterThan(0);
          const heads = meshes(piece, (mesh) => mesh.userData?.whiteOfficerHead === 'satin-v2');
          expect(heads.length).toBeGreaterThan(0);
          for (const head of heads) {
            expect(head.material.userData.pieceFinish).toBe('satin-ivory-officer-head-v2');
            expect(head.material.roughness).toBeGreaterThanOrEqual(0.56);
            expect(head.material.roughness).toBeLessThanOrEqual(0.64);
            expect(head.material.clearcoat).toBeGreaterThanOrEqual(0.24);
            expect(head.material.clearcoat).toBeLessThanOrEqual(0.3);
            expect(head.material.clearcoatRoughness).toBeGreaterThanOrEqual(0.32);
            expect(head.material.clearcoatRoughness).toBeLessThanOrEqual(0.4);
            expect(head.material.specularIntensity).toBeGreaterThanOrEqual(0.34);
            expect(head.material.specularIntensity).toBeLessThanOrEqual(0.42);
            expect(head.material.envMapIntensity).toBe(0);
            expect(head.material.color.getHex()).toBe(body.material.color.getHex());
          }
        }
      } finally {
        disposeObject(piece);
      }
    }
  });

  it('does not add the white-only finish to black pieces', () => {
    const piece = buildPiece('p', 'b', 'studio', false);
    try {
      expect(piece.userData.whitePieceReadabilityFinish).toBeUndefined();
      expect(meshes(piece, (mesh) => mesh.userData?.whiteBaseWalnutRim)).toHaveLength(0);
      expect(meshes(piece, (mesh) => mesh.userData?.whiteMatteHead)).toHaveLength(0);
      expect(meshes(piece, (mesh) => mesh.userData?.whiteOfficerHead)).toHaveLength(0);
    } finally {
      disposeObject(piece);
    }
  });
});
