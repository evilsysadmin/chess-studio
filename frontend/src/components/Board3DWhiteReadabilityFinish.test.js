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
  it('adds one restrained walnut base rim and matte upper ivory to every white piece type', () => {
    for (const type of ['p', 'n', 'b', 'r', 'q', 'k']) {
      const piece = buildPiece(type, 'w', 'studio', false);
      try {
        expect(piece.userData.whitePieceReadabilityFinish).toBe('walnut-and-matte-head-v1');
        expect(piece.userData.whitePieceWalnutRimCount).toBe(1);
        expect(piece.userData.whitePieceMatteHeadCount).toBeGreaterThan(0);

        const rims = meshes(piece, (mesh) => mesh.userData?.whiteBaseWalnutRim === 'subtle-v1');
        expect(rims).toHaveLength(1);
        expect(rims[0].material.color.getHex()).toBe(0x513625);
        expect(rims[0].material.roughness).toBeGreaterThanOrEqual(0.74);
        expect(rims[0].material.clearcoat).toBeLessThanOrEqual(0.06);
        expect(rims[0].material.userData.surfaceRole).toBe('white-base-walnut');

        const heads = meshes(piece, (mesh) => mesh.userData?.whiteMatteHead === 'deep-matte-v1');
        expect(heads.length).toBeGreaterThan(0);
        for (const head of heads) {
          expect(head.material.userData.pieceFinish).toBe('matte-ivory-head-v1');
          expect(head.material.roughness).toBeGreaterThanOrEqual(0.92);
          expect(head.material.clearcoat).toBeLessThanOrEqual(0.035);
          expect(head.material.specularIntensity).toBeLessThanOrEqual(0.16);
          expect(head.material.envMapIntensity).toBe(0);
        }

        const body = meshes(piece, (mesh) => (
          mesh.material?.userData?.surfaceRole === 'ivory'
          && mesh.material?.userData?.whiteHeadFinish !== 'deep-matte-v1'
        ))[0];
        expect(body).toBeTruthy();
        expect(heads[0].material.color.getHex()).toBe(body.material.color.getHex());
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
    } finally {
      disposeObject(piece);
    }
  });
});
